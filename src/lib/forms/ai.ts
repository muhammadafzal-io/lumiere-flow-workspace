import "server-only";

import OpenAI from "openai";
import { getOpenAIApiKey } from "@/lib/openai-config";
import { sanitizeFormFields } from "@/lib/forms/sanitize";
import type { GeneratedForm } from "@/lib/forms/types";

export class AINotConfiguredError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured");
    this.name = "AINotConfiguredError";
  }
}

function getOpenAI(): OpenAI {
  const key = getOpenAIApiKey();
  if (!key) throw new AINotConfiguredError();
  return new OpenAI({ apiKey: key });
}

const FORM_SYSTEM = `You are Lumière Med Spa's clinical intake/consent form builder AI.

Convert a plain-English description into JSON ONLY (no markdown):
{
  "name": "short form title, e.g. Botox Pre-Treatment Consent",
  "fields": [
    { "type": "text"|"textarea"|"number"|"date"|"yes_no"|"checkbox"|"radio"|"select"|"consent",
      "label": "the question or statement shown to the client",
      "required": true|false,
      "options": ["Option A","Option B"],
      "helpText": "optional one-line clarification" }
  ]
}

Field type guide — pick the narrowest fit:
- text: short free-text answers (name, medication name).
- textarea: longer free-text answers (describe your symptoms, list all medications).
- number: numeric answers (age, weight).
- date: a calendar date (date of last treatment, date of birth).
- yes_no: a single yes/or-no clinical question ("Are you currently pregnant or nursing?"). Do NOT
  set options for yes_no — it is always exactly two implicit choices.
- checkbox: the client may select MULTIPLE items from a list (e.g. "Which of these apply to you?
  Allergies, Blood thinners, Pregnancy"). REQUIRES options.
- radio: the client selects exactly ONE item from a short list of 3+ named choices (not a plain
  yes/no — use yes_no for that). REQUIRES options.
- select: like radio but for longer lists (5+ options) better shown as a dropdown. REQUIRES options.
- consent: a single agreement statement the client checks to confirm consent — label IS the full
  consent statement text (e.g. "I confirm the above information is accurate and I consent to
  receiving Botox treatment today."). Never give consent an options array. Always mark required: true.

Rules:
- Omit "id" entirely — the app assigns it. Omit "options" entirely for every non-choice type.
- Generate 4-12 fields for a typical consent/intake form unless the description asks for more.
- Always end a consent-style form with exactly one "consent" field summarizing the agreement.
- Ask about allergies/medications/pregnancy/medical history as yes_no or textarea, not free text
  unless the description specifically asks for open-ended detail.
- Never invent unrelated fields (no name/email/phone fields — those are collected elsewhere).

Example — input: "Create a pre-treatment consent form for Botox treatment. Ask about allergies,
medications, pregnancy, previous Botox treatments, and include consent confirmation." ->
{
  "name": "Botox Pre-Treatment Consent",
  "fields": [
    { "type": "yes_no", "label": "Do you have any known allergies?", "required": true },
    { "type": "textarea", "label": "If yes, please list your allergies.", "required": false },
    { "type": "textarea", "label": "List any medications you are currently taking.", "required": true },
    { "type": "yes_no", "label": "Are you currently pregnant or breastfeeding?", "required": true },
    { "type": "yes_no", "label": "Have you had Botox treatment before?", "required": true },
    { "type": "date", "label": "Date of your most recent Botox treatment, if any.", "required": false },
    { "type": "consent", "label": "I confirm the above information is accurate and I consent to receiving Botox treatment today.", "required": true }
  ]
}

Wrong (do not do this): putting an "options" array on a yes_no field, making "consent" a checkbox
group with multiple options, or making every question a plain "text" field.`;

/** Generate a structured form from a plain-English prompt. Output is always run through
 * sanitizeFormFields before being returned — never trust the raw model output directly. */
export async function generateFormWithAI(prompt: string): Promise<GeneratedForm> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: FORM_SYSTEM },
      { role: "user", content: prompt.trim() },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("AI returned empty response");

  return sanitizeFormFields(JSON.parse(raw) as { name?: unknown; fields?: unknown });
}

export function isAIConfigured(): boolean {
  return !!getOpenAIApiKey();
}
