import "server-only";

import { getSupabase } from "@/lib/supabase";
import type { RetentionResult } from "@/types";

const SENDS_TABLE = "rule_sends";
const EMAIL_SENDS_TABLE = "email_sends";

/** Persist rule send records for cron dedupe and optional validation audit. */
export async function recordRuleSends(
  ruleId: string,
  details: RetentionResult["details"],
): Promise<void> {
  const sb = getSupabase();
  const rows = details
    .filter((d) => d.status === "sent" && d.clientId)
    .map((d) => ({
      rule_id: ruleId,
      client_id: d.clientId!,
      client_email: d.emailAddress ?? "",
      status: "sent",
    }));

  if (!rows.length) return;

  const { error } = await sb.from(SENDS_TABLE).insert(rows);
  if (error) console.warn("[rules] rule_sends insert failed:", error.message);
}

/** True when this client was emailed a specific rule (cron or manual). */
export async function clientReceivedRuleEmail(
  ruleId: string,
  clientId: string,
): Promise<boolean> {
  const sb = getSupabase();

  const { data: ruleSend } = await sb
    .from(SENDS_TABLE)
    .select("id")
    .eq("rule_id", ruleId)
    .eq("client_id", clientId)
    .eq("status", "sent")
    .limit(1);
  if (ruleSend?.length) return true;

  const { data: emailSend } = await sb
    .from(EMAIL_SENDS_TABLE)
    .select("id")
    .eq("category", "rule")
    .eq("source_id", ruleId)
    .eq("client_id", clientId)
    .eq("status", "sent")
    .limit(1);
  return (emailSend?.length ?? 0) > 0;
}
