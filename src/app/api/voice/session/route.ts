import { NextResponse } from "next/server";
import { getVoiceSystemPrompt } from "@/lib/agent/voice-system-prompt";
import { TOOLS } from "@/lib/agent/tools";
import { getOpenAIRealtimeApiKey, OPENAI_KEY_SETUP_HINT } from "@/lib/openai-config";

/**
 * book_appointment's shared schema (used by chat/Discord too) includes client_email and
 * birthday as valid parameters, since chat/Discord bookings require them. For the realtime
 * voice session specifically, those two fields are removed from the schema entirely rather
 * than just described as optional in prose — a parameter's mere presence in a function
 * signature is a much stronger invitation for a model to collect and fill it than a system
 * prompt telling it not to. Live-call testing showed the voice model fabricating plausible-
 * looking values for these fields despite explicit prose instructions not to; the only
 * reliable fix is to make it structurally impossible for the tool call to carry them.
 */
function voiceOnlyBookAppointmentSchema(params: Record<string, unknown>): Record<string, unknown> {
  const properties = { ...(params.properties as Record<string, unknown>) };
  delete properties.client_email;
  delete properties.birthday;
  return { ...params, properties };
}

const REALTIME_TOOLS = [
  ...TOOLS.map((t) => ({
    type: "function" as const,
    name: t.function.name,
    description:
      t.function.name === "book_appointment"
        ? "Create a confirmed appointment in the clinic's Google Calendar with room and practitioner assignment. Only call after the client has confirmed a specific slot from check_availability results. Only phone, treatment, date_time, and duration_minutes are required — this schema has no client_email or birthday field on purpose; a secure completion link collects those afterward. Never ask the caller for their email or birthday, and never invent values for fields that don't exist here."
        : (t.function.description ?? ""),
    parameters:
      t.function.name === "book_appointment"
        ? voiceOnlyBookAppointmentSchema(
            t.function.parameters ?? { type: "object", properties: {} },
          )
        : (t.function.parameters ?? { type: "object", properties: {} }),
  })),
  {
    type: "function" as const,
    name: "end_call",
    description:
      "End the voice call and close the session. Call this only after you have spoken the farewell message and the client has said goodbye or confirmed they need nothing else.",
    parameters: { type: "object", properties: {} },
  },
];

export async function POST() {
  const apiKey = getOpenAIRealtimeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "OpenAI API key not configured",
        hint: OPENAI_KEY_SETUP_HINT,
      },
      { status: 500 },
    );
  }

  try {
    const instructions = await getVoiceSystemPrompt();
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime-mini",
          instructions,
          output_modalities: ["audio"],
          tools: REALTIME_TOOLS,
          tool_choice: "auto",
          audio: {
            input: {
              transcription: { model: "whisper-1", language: "en" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.82,
                prefix_padding_ms: 250,
                silence_duration_ms: 900,
              },
              noise_reduction: { type: "near_field" },
            },
            output: {
              voice: "marin",
            },
          },
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? "Unknown error" },
        { status: res.status },
      );
    }

    return NextResponse.json({
      sessionId: data.session?.id,
      clientSecret: data.value,
      expiresAt: data.expires_after?.seconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
