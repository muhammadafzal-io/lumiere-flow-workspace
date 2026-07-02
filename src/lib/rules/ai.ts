import "server-only";

import OpenAI from "openai";
import type { Channel, Rule, TriggerType } from "@/lib/types";
import { RULE_CHANNELS } from "@/lib/types";
import type { ParsedRule } from "@/lib/ai-parse";
import type { RuleAudienceFilters } from "@/lib/rules/audience-config";
import { sanitizeAudienceFilters } from "@/lib/rules/audience-match";

const VALID_TRIGGERS: TriggerType[] = [
  "Visit count",
  "Inactivity",
  "Birthday",
  "Treatment-based",
  "Date-based",
  "No-show recovery",
  "Custom",
];

const VALID_CHANNELS: Channel[] = [...RULE_CHANNELS];

export class AINotConfiguredError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured");
    this.name = "AINotConfiguredError";
  }
}

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AINotConfiguredError();
  return new OpenAI({ apiKey: key });
}

function sanitizeRule(parsed: Partial<ParsedRule>): ParsedRule {
  const trigger_type = VALID_TRIGGERS.includes(parsed.trigger_type as TriggerType)
    ? (parsed.trigger_type as TriggerType)
    : "Visit count";

  const channel = VALID_CHANNELS.includes(parsed.channel as Channel)
    ? (parsed.channel as Channel)
    : "Email";

  const trigger_config =
    parsed.trigger_config && typeof parsed.trigger_config === "object"
      ? { ...parsed.trigger_config }
      : {};

  if (parsed.audience_filters && typeof parsed.audience_filters === "object") {
    trigger_config.audience_filters = parsed.audience_filters;
  }

  return {
    name: String(parsed.name ?? "New rule").slice(0, 120),
    trigger_type,
    trigger_config,
    channel,
    message_template: String(parsed.message_template ?? "").slice(0, 2000),
    offer_code: parsed.offer_code ? String(parsed.offer_code).slice(0, 32) : undefined,
    audience_filters: parsed.audience_filters,
  };
}

const RULE_SYSTEM = `You are Lumière Med Spa's marketing rule builder AI.

Convert plain English into JSON ONLY (no markdown):
{
  "name": "short title",
  "trigger_type": ${VALID_TRIGGERS.map((t) => `"${t}"`).join(" | ")},
  "trigger_config": { ... },
  "audience_filters": { optional extra filters },
  "channel": "Email" | "Discord" | "WhatsApp",
  "message_template": "warm email with {first_name}; use {birthday_token} for Birthday rules or {credit_code} for static offer codes",
  "offer_code": "CREDIT50 or SAVE20 or null (omit for Birthday — tokens are auto-generated)"
}

trigger_config:
- Visit count: { "min_visits": number }
- Inactivity: { "days": number }
- Birthday: { "days_before": number }
- Treatment-based: { "treatment": "Any"|"Botox"|..., "days_after": number, "exact_calendar_day": boolean }
  When exact_calendar_day is true, audience is built from completed Google Calendar appointments on that clinic day.
  Use exact_calendar_day: true with days_after: 1 for "had treatment yesterday". days_after: 0 = today.
- Date-based: { "date": "YYYY-MM-DD" }
- No-show recovery: { "hours_after": number }
- Custom: {}

audience_filters (optional refinements):
{
  "status": ["Active"],
  "treatment": ["Botox"],
  "visit_min": number,
  "visit_max": number,
  "last_visit": "0" | "1" | "7" | "30" | "30-90" | "90" | "any",
  "has_email": true
}

Defaults: marketing/loyalty offers → Visit count + Email channel.
Message: professional, warm, under 120 words.
For Birthday triggers: always include {birthday_token} (unique $50 chatbot code per client). Do not set offer_code.
For other triggers: include {credit_code} when offer_code is set.`;

/** Parse full rule definition from natural language */
export async function parseRuleWithAI(input: string): Promise<ParsedRule> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: RULE_SYSTEM },
      { role: "user", content: input.trim() },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("AI returned empty response");

  return sanitizeRule(JSON.parse(raw) as Partial<ParsedRule>);
}

/** Convert natural language audience query into filter chips */
export async function parseAudienceQueryWithAI(
  query: string,
  rule?: Pick<Rule, "trigger_type" | "trigger_config" | "name">,
): Promise<{ filters: RuleAudienceFilters; explanation: string }> {
  const openai = getOpenAI();
  const context = rule
    ? `Current rule: "${rule.name}" (${rule.trigger_type}, config: ${JSON.stringify(rule.trigger_config)})`
    : "No rule context";

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Convert audience search queries into JSON filters for a med spa client database.
Return: { "filters": { ... }, "explanation": "one sentence" }

filters shape:
{
  "q": "optional name/email search string",
  "status": ["Active","VIP","Dormant","New"],
  "treatment": ["Botox","HydraFacial",...],
  "visit_min": number,
  "visit_max": number,
  "last_visit": "0" | "1" | "7" | "30" | "30-90" | "90" | "any",
  "has_email": true | false
}

Only include fields mentioned or clearly implied. has_email defaults true for email campaigns.
Map "yesterday" or "last day" to Treatment-based exact_calendar_day: true, days_after: 1, or last_visit "1".
Map "today" to exact_calendar_day: true, days_after: 0, or last_visit "0".
Map "last week" or "past 7 days" to last_visit "7". Map "last month" or "recent" to last_visit "30".`,
      },
      { role: "user", content: `${context}\n\nQuery: ${query.trim()}` },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("AI returned empty response");

  const json = JSON.parse(raw) as { filters?: RuleAudienceFilters; explanation?: string };
  return {
    filters: sanitizeAudienceFilters(json.filters ?? {}),
    explanation: json.explanation ?? "Filters applied",
  };
}

/** Generate or rewrite marketing email copy */
export async function generateRuleMessageWithAI(opts: {
  ruleName: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  offerCode?: string;
  instruction?: string;
}): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content: `Write a marketing email body for Lumière Med Spa.
Use {first_name}. For Birthday rules use {birthday_token} (auto-generated $50 chatbot code). For other rules use {credit_code} when an offer code applies.
Warm, professional, no emojis, under 120 words. Return ONLY the message text.`,
      },
      {
        role: "user",
        content: `Rule: ${opts.ruleName}
Trigger: ${opts.triggerType} ${JSON.stringify(opts.triggerConfig)}
Offer code: ${opts.offerCode ?? "none"}
${opts.instruction ? `Instruction: ${opts.instruction}` : "Write the email."}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("AI returned empty message");
  return text;
}

export function isAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
