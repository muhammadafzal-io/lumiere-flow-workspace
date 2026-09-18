/**
 * Per-call counters for a voice session. Nothing in the app currently reads the `usage` object the
 * Realtime API attaches to every `response.done`, so there has been no way to answer "what does a
 * voice booking actually cost". This accumulates that, plus how many turns were spent on rejected
 * (noise/echo) audio, and reports it once when the call ends.
 *
 * Pure bookkeeping — no I/O, no PII: transcript lengths and counts only, never transcript text.
 */

/** The shape Realtime reports on response.done; every field is optional across API versions. */
export interface RealtimeUsage {
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  input_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
    cached_tokens?: number;
    cached_tokens_details?: { text_tokens?: number; audio_tokens?: number };
  };
  output_token_details?: { text_tokens?: number; audio_tokens?: number };
}

export type TranscriptRejectionReason = "empty" | "junk" | "too_short" | "greeting_noise" | "echo";

export interface VoiceSessionMetrics {
  responses: number;
  responsesCancelled: number;
  speechEvents: number;
  transcriptsAccepted: number;
  transcriptsRejected: number;
  rejectionsByReason: Record<TranscriptRejectionReason, number>;
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  totalTokens: number;
}

export interface VoiceMetricsRecorder {
  responseUsage: (usage: RealtimeUsage | undefined) => void;
  responseCancelled: () => void;
  speechDetected: () => void;
  transcriptAccepted: () => void;
  transcriptRejected: (reason: TranscriptRejectionReason) => void;
  toolCalled: (toolName: string) => void;
  snapshot: () => VoiceSessionMetrics;
}

function emptyRejections(): Record<TranscriptRejectionReason, number> {
  return { empty: 0, junk: 0, too_short: 0, greeting_noise: 0, echo: 0 };
}

export function createVoiceMetrics(): VoiceMetricsRecorder {
  const m: VoiceSessionMetrics = {
    responses: 0,
    responsesCancelled: 0,
    speechEvents: 0,
    transcriptsAccepted: 0,
    transcriptsRejected: 0,
    rejectionsByReason: emptyRejections(),
    toolCalls: 0,
    toolCallsByName: {},
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    inputAudioTokens: 0,
    outputAudioTokens: 0,
    totalTokens: 0,
  };

  return {
    responseUsage(usage) {
      m.responses += 1;
      if (!usage) return;
      m.inputTokens += usage.input_tokens ?? 0;
      m.outputTokens += usage.output_tokens ?? 0;
      m.totalTokens += usage.total_tokens ?? 0;
      m.cachedInputTokens += usage.input_token_details?.cached_tokens ?? 0;
      m.inputAudioTokens += usage.input_token_details?.audio_tokens ?? 0;
      m.outputAudioTokens += usage.output_token_details?.audio_tokens ?? 0;
    },
    responseCancelled() {
      m.responsesCancelled += 1;
    },
    speechDetected() {
      m.speechEvents += 1;
    },
    transcriptAccepted() {
      m.transcriptsAccepted += 1;
    },
    transcriptRejected(reason) {
      m.transcriptsRejected += 1;
      m.rejectionsByReason[reason] += 1;
    },
    toolCalled(toolName) {
      m.toolCalls += 1;
      m.toolCallsByName[toolName] = (m.toolCallsByName[toolName] ?? 0) + 1;
    },
    snapshot() {
      return {
        ...m,
        rejectionsByReason: { ...m.rejectionsByReason },
        toolCallsByName: { ...m.toolCallsByName },
      };
    },
  };
}

/** Flat, log-friendly summary — counts and token totals only. */
export function summarizeVoiceMetrics(
  m: VoiceSessionMetrics,
  durationSeconds: number,
): Record<string, number | string> {
  return {
    call_seconds: Math.round(durationSeconds),
    responses: m.responses,
    responses_cancelled: m.responsesCancelled,
    speech_events: m.speechEvents,
    transcripts_accepted: m.transcriptsAccepted,
    transcripts_rejected: m.transcriptsRejected,
    rejected_breakdown:
      Object.entries(m.rejectionsByReason)
        .filter(([, n]) => n > 0)
        .map(([reason, n]) => `${reason}:${n}`)
        .join(" ") || "none",
    tool_calls: m.toolCalls,
    tools:
      Object.entries(m.toolCallsByName)
        .map(([name, n]) => `${name}:${n}`)
        .join(" ") || "none",
    input_tokens: m.inputTokens,
    cached_input_tokens: m.cachedInputTokens,
    input_audio_tokens: m.inputAudioTokens,
    output_tokens: m.outputTokens,
    output_audio_tokens: m.outputAudioTokens,
    total_tokens: m.totalTokens,
  };
}
