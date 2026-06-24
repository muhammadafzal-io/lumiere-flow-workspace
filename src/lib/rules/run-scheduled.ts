import "server-only";

import { getSupabase } from "@/lib/supabase";
import { buildRuleAudience } from "@/lib/rules/audience";
import type { RuleAudienceFilters } from "@/lib/rules/audience-config";
import { sendRuleEmails } from "@/lib/rules/send";
import {
  isRuleScheduleDue,
  parseRuleSchedule,
  type RuleScheduleConfig,
} from "@/lib/rules/schedule-config";
import type { Rule } from "@/lib/types";
import type { RetentionResult } from "@/types";

const RULES_TABLE = "Rules";
const SENDS_TABLE = "rule_sends";

function mapRuleRow(r: Record<string, unknown>): Rule {
  let trigger_config: Record<string, unknown> = {};
  try {
    trigger_config = JSON.parse(String(r["Trigger Config"] ?? "{}"));
  } catch {
    // ignore
  }
  return {
    id: String(r.id),
    name: String(r["Rule Name"] ?? ""),
    status: String(r["Status"] ?? "draft").toLowerCase() as Rule["status"],
    trigger_type: (r["Trigger Type"] as Rule["trigger_type"]) ?? "Custom",
    trigger_config,
    audience_filter: [],
    channel: "Email",
    message_template: String(r["Message Template"] ?? ""),
    offer_code: r["Incentive Code"] ? String(r["Incentive Code"]) : undefined,
    created_at: String(r.created_at ?? new Date().toISOString()),
    last_run_at: r["Last Run At"] ? String(r["Last Run At"]) : undefined,
    audience_size: 0,
    sent_30d: 0,
    reply_rate: 0,
    revenue: 0,
  };
}

async function fetchSentClientIds(ruleId: string): Promise<Set<string>> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(SENDS_TABLE)
    .select("client_id")
    .eq("rule_id", ruleId)
    .eq("status", "sent");

  if (error) {
    console.warn("[rules/cron] rule_sends lookup failed (run migration?):", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((row) => String(row.client_id)));
}

async function recordSends(
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
  if (error) console.warn("[rules/cron] rule_sends insert failed:", error.message);
}

async function updateScheduleAfterRun(
  ruleId: string,
  triggerConfig: Record<string, unknown>,
  schedule: RuleScheduleConfig,
): Promise<void> {
  const sb = getSupabase();
  const nextSchedule: RuleScheduleConfig = {
    ...schedule,
    last_auto_run_at: new Date().toISOString(),
  };
  await sb
    .from(RULES_TABLE)
    .update({
      "Trigger Config": JSON.stringify({
        ...triggerConfig,
        schedule: nextSchedule,
      }),
      "Last Run At": new Date().toISOString(),
    })
    .eq("id", ruleId);
}

export interface RuleCronRunResult {
  ruleId: string;
  ruleName: string;
  due: boolean;
  skipped?: string;
  send?: RetentionResult;
}

export async function runScheduledRules(opts?: {
  ruleId?: string;
  force?: boolean;
}): Promise<{ processed: number; results: RuleCronRunResult[] }> {
  const sb = getSupabase();
  let query = sb.from(RULES_TABLE).select("*").eq("Status", "Active");
  if (opts?.ruleId) query = query.eq("id", opts.ruleId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const results: RuleCronRunResult[] = [];

  for (const row of data ?? []) {
    const rule = mapRuleRow(row as Record<string, unknown>);
    const schedule = parseRuleSchedule(rule.trigger_config?.schedule);

    if (!schedule.enabled) {
      results.push({ ruleId: rule.id, ruleName: rule.name, due: false, skipped: "schedule disabled" });
      continue;
    }

    if (!opts?.force && !isRuleScheduleDue(schedule)) {
      results.push({ ruleId: rule.id, ruleName: rule.name, due: false, skipped: "not due yet" });
      continue;
    }

    const savedFilters = (rule.trigger_config?.audience_filters ?? {}) as RuleAudienceFilters;
    const audience = await buildRuleAudience(rule, {
      ...savedFilters,
      has_email: savedFilters.has_email ?? true,
    });

    let targets = audience.rows;
    if (schedule.send_mode !== "all_eligible") {
      const sent = await fetchSentClientIds(rule.id);
      targets = targets.filter((r) => !sent.has(r.id));
    }

    if (targets.length === 0) {
      await updateScheduleAfterRun(rule.id, rule.trigger_config, schedule);
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        due: true,
        skipped: "no new recipients",
        send: { sent: 0, skipped: 0, failed: 0, details: [] },
      });
      continue;
    }

    const sendResult = await sendRuleEmails(
      rule,
      targets.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        treatment: r.treatment,
      })),
    );

    await recordSends(rule.id, sendResult.details);
    await updateScheduleAfterRun(rule.id, rule.trigger_config, schedule);

    results.push({ ruleId: rule.id, ruleName: rule.name, due: true, send: sendResult });
  }

  return { processed: results.filter((r) => r.due && r.send && r.send.sent > 0).length, results };
}
