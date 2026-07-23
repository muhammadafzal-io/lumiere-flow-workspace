import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CheckResult = {
  key: string;
  status: "ok" | "missing" | "warning";
  note: string;
};

function check(key: string, note: string, optional = false): CheckResult {
  const val = process.env[key];
  if (!val?.trim()) {
    return {
      key,
      status: optional ? "warning" : "missing",
      note: optional ? `${note} (optional)` : note,
    };
  }
  // Mask the value — show first 6 chars + ***
  const masked = val.length > 6 ? `${val.slice(0, 6)}***` : "***";
  return { key, status: "ok", note: `${note} — ${masked}` };
}

function checkJson(key: string, note: string): CheckResult {
  const val = process.env[key];
  if (!val?.trim()) return { key, status: "missing", note };
  try {
    const parsed = JSON.parse(val);
    const projectId = parsed.project_id ?? parsed.client_email ?? "parsed ok";
    return { key, status: "ok", note: `${note} — ${projectId}` };
  } catch {
    return { key, status: "warning", note: `${note} — SET but invalid JSON` };
  }
}

export async function GET() {
  const checks: CheckResult[] = [
    check("SUPABASE_URL", "Supabase project URL (server-side)"),
    check("NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL (client-side)", true),
    check("SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
    check("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key", true),

    check("MESSAGING_PROVIDER", "Active messaging channel (discord/whatsapp)"),
    check("DISCORD_BOT_TOKEN", "Discord bot token for sending messages"),
    check("DISCORD_APPLICATION_ID", "Discord application ID"),
    check("DISCORD_PUBLIC_KEY", "Discord public key for webhook verification"),
    check("DISCORD_CHAT_CHANNEL_ID", "Discord channel for outbound retention messages"),
    check("WHATSAPP_ACCESS_TOKEN", "WhatsApp Cloud API token", true),
    check("WHATSAPP_PHONE_NUMBER_ID", "WhatsApp phone number ID", true),

    checkJson("GOOGLE_SERVICE_ACCOUNT_JSON", "Google service account credentials"),
    check("GOOGLE_CALENDAR_ID", "Google Calendar ID for bookings"),

    check("OPENAI_API_KEY", "OpenAI key (chat widget, rules AI, reactivation)"),
    check(
      "OPENAI_API_KEY_REAL_TIME",
      "OpenAI Realtime key (voice — falls back to OPENAI_API_KEY)",
      true,
    ),

    check("SLACK_ESCALATION_WEBHOOK_URL", "Slack webhook for escalation alerts", true),

    check("CRON_SECRET", "Secret to authenticate cron-job.org calls"),

    check("NEXT_PUBLIC_APP_URL", "Public URL of this deployment"),
    check("TZ", "Timezone (e.g. America/Chicago)", true),
  ];

  const missing = checks.filter((c) => c.status === "missing");
  const warnings = checks.filter((c) => c.status === "warning");
  const ok = checks.filter((c) => c.status === "ok");

  const healthy = missing.length === 0;

  return NextResponse.json(
    {
      healthy,
      summary: `${ok.length} ok · ${warnings.length} warnings · ${missing.length} missing`,
      missing: missing.map((c) => ({ key: c.key, note: c.note })),
      warnings: warnings.map((c) => ({ key: c.key, note: c.note })),
      ok: ok.map((c) => ({ key: c.key, note: c.note })),
    },
    { status: healthy ? 200 : 503 },
  );
}
