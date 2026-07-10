import { NextResponse } from "next/server";
import { getVoiceSystemPrompt } from "@/lib/agent/voice-system-prompt";
import { TOOLS } from "@/lib/agent/tools";
import { getOpenAIRealtimeApiKey, OPENAI_KEY_SETUP_HINT } from "@/lib/openai-config";

const REALTIME_TOOLS = [
  ...TOOLS.map((t) => ({
    type: "function" as const,
    name: t.function.name,
    description: t.function.description ?? "",
    parameters: t.function.parameters ?? { type: "object", properties: {} },
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
          instructions: await getVoiceSystemPrompt(),
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
