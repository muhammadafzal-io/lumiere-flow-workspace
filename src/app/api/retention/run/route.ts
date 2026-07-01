import { NextRequest, NextResponse } from "next/server";
import { runReminderFlow } from "@/lib/retention/reminders";
import { runNoshowFlow } from "@/lib/retention/noshow";
import { runReactivationFlow } from "@/lib/retention/reactivation";
import { runBirthdayFlow } from "@/lib/retention/birthday";
import { runFollowupFlow } from "@/lib/retention/followup";
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
    reminders: () => runReminderFlow({ trigger: "cron" }),
    noshow: () => runNoshowFlow({ trigger: "cron" }),
    reactivation: () => runReactivationFlow({ trigger: "cron" }),
    followup: () => runFollowupFlow({ trigger: "cron" }),
    campaigns: async () => {
      const process = await processAllActiveCampaigns();
      const send = await sendAllPendingCampaignEmails({ trigger: "cron" });
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
  const [reminders, noshow, reactivation, birthday, followup, campaigns] = await Promise.allSettled([
    runReminderFlow({ trigger: "cron" }),
    runNoshowFlow({ trigger: "cron" }),
    runReactivationFlow({ trigger: "cron" }),
    runBirthdayFlow({ trigger: "cron" }),
    runFollowupFlow({ trigger: "cron" }),
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
      followup:
        followup.status === "fulfilled"
          ? followup.value
          : { error: String((followup as PromiseRejectedResult).reason) },
      campaigns:
        campaigns.status === "fulfilled"
          ? campaigns.value
          : { error: String((campaigns as PromiseRejectedResult).reason) },
    },
  });
}
