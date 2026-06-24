import { NextRequest, NextResponse } from "next/server";
import { runReminderFlow } from "@/lib/retention/reminders";
import { runNoshowFlow } from "@/lib/retention/noshow";
import { runReactivationFlow } from "@/lib/retention/reactivation";
import { runBirthdayFlow } from "@/lib/retention/birthday";
import { processAllActiveCampaigns } from "@/lib/campaigns/process";
import { sendAllPendingCampaignEmails } from "@/lib/campaigns/send";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const flow = new URL(req.url).searchParams.get("flow") ?? "all";

  const runners: Record<string, () => Promise<unknown>> = {
    reminders: runReminderFlow,
    noshow: runNoshowFlow,
    reactivation: runReactivationFlow,
    birthday: runBirthdayFlow,
    campaigns: async () => {
      const process = await processAllActiveCampaigns();
      const send = await sendAllPendingCampaignEmails();
      return { process, send: send.totals };
    },
    rules: async () => {
      const { runScheduledRules } = await import("@/lib/rules/run-scheduled");
      return runScheduledRules();
    },
  };

  // Run a single flow if specified, otherwise run all
  if (flow !== "all" && runners[flow]) {
    try {
      const result = await runners[flow]();
      return NextResponse.json({ ok: true, flow, result });
    } catch (err) {
      return NextResponse.json({ ok: false, flow, error: String(err) }, { status: 500 });
    }
  }

  // Run all flows in parallel (campaigns runs sequentially internally)
  const [reminders, noshow, reactivation, birthday, campaigns] = await Promise.allSettled([
    runReminderFlow(),
    runNoshowFlow(),
    runReactivationFlow(),
    runBirthdayFlow(),
    runners.campaigns(),
  ]);

  return NextResponse.json({
    ok: true,
    results: {
      reminders:
        reminders.status === "fulfilled"
          ? reminders.value
          : { error: String((reminders as PromiseRejectedResult).reason) },
      noshow:
        noshow.status === "fulfilled"
          ? noshow.value
          : { error: String((noshow as PromiseRejectedResult).reason) },
      reactivation:
        reactivation.status === "fulfilled"
          ? reactivation.value
          : { error: String((reactivation as PromiseRejectedResult).reason) },
      birthday:
        birthday.status === "fulfilled"
          ? birthday.value
          : { error: String((birthday as PromiseRejectedResult).reason) },
      campaigns:
        campaigns.status === "fulfilled"
          ? campaigns.value
          : { error: String((campaigns as PromiseRejectedResult).reason) },
    },
  });
}
