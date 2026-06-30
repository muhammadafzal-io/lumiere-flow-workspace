/** Resolve OpenAI API key for chat / GPT-4o agent. */
export function getOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

/**
 * Resolve OpenAI key for Realtime voice.
 * Falls back to OPENAI_API_KEY when OPENAI_API_KEY_REAL_TIME is not set.
 */
export function getOpenAIRealtimeApiKey(): string | undefined {
  return (
    process.env.OPENAI_API_KEY_REAL_TIME?.trim() || process.env.OPENAI_API_KEY?.trim() || undefined
  );
}

export const OPENAI_KEY_SETUP_HINT =
  "Add OPENAI_API_KEY (chat) and optionally OPENAI_API_KEY_REAL_TIME (voice) in Vercel → Project → Settings → Environment Variables, then redeploy.";
