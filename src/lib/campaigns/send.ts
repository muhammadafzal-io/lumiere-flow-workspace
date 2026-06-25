import { getSupabase } from "@/lib/supabase";
import { logEvent } from "@/lib/integrations/activity-log";
import type { EmailSendTrigger } from "@/lib/integrations/email-send-log";
import { getMessagingProvider } from "@/lib/messaging";
import { trySend } from "@/lib/retention/utils";
import { mapCampaignRow, mapRecipientRow } from "@/lib/campaigns/db";
import { displayRewardCode } from "@/lib/campaigns/reward-code";
import type { Campaign, CampaignRecipient } from "@/lib/types";
import type { RetentionResult } from "@/types";

function buildCampaignMessage(
  campaign: Campaign,
  recipient: CampaignRecipient,
  rewardCode: string,
): string {
  const rewardLabel =
    campaign.reward_type === "credit"
      ? `$${campaign.reward_amount} credit`
      : `${campaign.reward_amount}% discount`;
  const code = displayRewardCode(rewardCode);

  return [
    `Hi ${recipient.customer_name.split(" ")[0] || recipient.customer_name},`,
    ``,
    `Thank you for being a loyal Lumière guest! You've visited us ${recipient.visit_count} times, and we'd love to celebrate with you.`,
    ``,
    `Your reward: ${rewardLabel}`,
    `Code: ${code}`,
    ``,
    `Campaign: ${campaign.name}`,
    campaign.description ? campaign.description : "",
    ``,
    `Use this code on your next visit. Book by replying here or call us Monday–Saturday, 9 AM – 7 PM.`,
    ``,
    `— The Lumière Team`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface SendCampaignResult extends RetentionResult {
  campaignId?: string;
  campaignName?: string;
}

async function sendToRecipient(
  campaign: Campaign,
  recipient: CampaignRecipient,
  rewardCode: string,
  triggerType: EmailSendTrigger = "manual",
): Promise<{ ok: boolean; emailSent: boolean; reason?: string }> {
  const messaging = getMessagingProvider();
  const message = buildCampaignMessage(campaign, recipient, rewardCode);
  const subject =
    campaign.reward_type === "credit"
      ? `Your $${campaign.reward_amount} Lumière loyalty reward is here`
      : `Your ${campaign.reward_amount}% Lumière loyalty discount is here`;

  const contactId = recipient.customer_email || "email-only";

  try {
    const { platform, simulated, emailSent, emailError } = await trySend(messaging, {
      to: contactId,
      text: message,
      email: recipient.customer_email || undefined,
      subject,
      flowType: "campaign",
      emailLog: {
        category: "campaign",
        triggerType,
        sourceId: campaign.id,
        sourceName: campaign.name,
        clientId: recipient.customer_id,
        clientName: recipient.customer_name,
      },
    });

    if (!recipient.customer_email) {
      return { ok: false, emailSent: false, reason: "no email address on file" };
    }

    if (!emailSent && !simulated) {
      return { ok: false, emailSent: false, reason: emailError ?? "email send failed" };
    }

    await logEvent(
      "campaign",
      recipient.customer_name,
      `${simulated ? "Simulated" : "Sent"} campaign reward "${campaign.name}". Code: ${displayRewardCode(rewardCode)}.${emailSent ? ` Email: ${recipient.customer_email}` : ""}`,
      {
        clientId: recipient.customer_id,
        email: recipient.customer_email,
        platform,
        status: emailSent || simulated ? "success" : "failed",
      },
    );

    return { ok: true, emailSent: emailSent || simulated };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await logEvent(
      "campaign",
      recipient.customer_name,
      `Failed to send campaign reward: ${reason}`,
      {
        clientId: recipient.customer_id,
        email: recipient.customer_email,
        status: "failed",
      },
    );
    return { ok: false, emailSent: false, reason };
  }
}

/** Send pending emails for a single campaign. */
export async function sendCampaignEmails(
  campaignId: string,
  opts?: { trigger?: EmailSendTrigger },
): Promise<SendCampaignResult> {
  const triggerType = opts?.trigger ?? "manual";
  const sb = getSupabase();
  const result: SendCampaignResult = {
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [],
    campaignId,
  };

  const { data: campaignRow, error: cErr } = await sb
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaignRow) throw new Error(cErr?.message ?? "Campaign not found");
  const campaign = mapCampaignRow(campaignRow);
  result.campaignName = campaign.name;

  const { data: pending, error: pErr } = await sb
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "failed"]);

  if (pErr) throw new Error(pErr.message);

  for (const row of pending ?? []) {
    const recipient = mapRecipientRow(row);

    const { data: reward } = await sb
      .from("customer_rewards")
      .select("reward_code")
      .eq("campaign_id", campaignId)
      .eq("customer_id", recipient.customer_id)
      .maybeSingle();

    if (!reward?.reward_code) {
      result.skipped++;
      result.details.push({
        clientId: recipient.customer_id,
        clientName: recipient.customer_name,
        status: "skipped",
        reason: "no reward record",
      });
      continue;
    }

    const sendResult = await sendToRecipient(campaign, recipient, reward.reward_code, triggerType);
    const now = new Date().toISOString();

    if (sendResult.ok) {
      await sb
        .from("campaign_recipients")
        .update({ status: "sent", sent_at: now })
        .eq("id", recipient.id);
      result.sent++;
      result.details.push({
        clientId: recipient.customer_id,
        clientName: recipient.customer_name,
        status: "sent",
        emailAddress: recipient.customer_email,
        emailSent: sendResult.emailSent,
        messagePreview: `Code: ${displayRewardCode(reward.reward_code)}`,
      });
    } else {
      await sb.from("campaign_recipients").update({ status: "failed" }).eq("id", recipient.id);
      result.failed++;
      result.details.push({
        clientId: recipient.customer_id,
        clientName: recipient.customer_name,
        status: "failed",
        reason: sendResult.reason,
      });
    }
  }

  return result;
}

/** Send pending campaign emails across all active campaigns (Flows page / cron). */
export async function sendAllPendingCampaignEmails(opts?: {
  trigger?: EmailSendTrigger;
}): Promise<{
  campaigns: SendCampaignResult[];
  totals: { sent: number; skipped: number; failed: number };
}> {
  const sb = getSupabase();
  const { data: active, error } = await sb.from("campaigns").select("id").eq("status", "active");

  if (error) throw new Error(error.message);

  const campaigns: SendCampaignResult[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of active ?? []) {
    const r = await sendCampaignEmails(String(c.id), { trigger: opts?.trigger ?? "cron" });
    campaigns.push(r);
    sent += r.sent;
    skipped += r.skipped;
    failed += r.failed;
  }

  return { campaigns, totals: { sent, skipped, failed } };
}
