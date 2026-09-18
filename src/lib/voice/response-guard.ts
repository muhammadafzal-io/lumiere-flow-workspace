import type { TranscriptRejectionReason } from "@/lib/voice/session-metrics";

export interface CancelDecisionInput {
  /** Why the transcript was rejected. */
  reason: TranscriptRejectionReason;
  /**
   * Whether this transcription belongs to a user turn the call was actually tracking. It is false
   * for audio captured while the agent was speaking or a tool was running, which the client
   * deliberately ignores — that audio never triggered the in-flight response, so cancelling it
   * would silence a reply the caller is waiting for.
   */
  hasTrackedUserTurn: boolean;
  /** A tool round in play means the pending response is the booking confirmation. */
  toolRoundInFlight: boolean;
}

export interface CancelDecision {
  cancel: boolean;
  /** Why not, for logs — omitted when cancelling. */
  skippedBecause?: "untracked_audio" | "tool_round_in_flight" | "echo_heuristic";
}

/**
 * Whether a rejected transcription should also cancel the response currently being generated.
 *
 * Cancelling is what actually saves the (expensive) spoken reply to noise, but it is only correct
 * when the noise is what prompted that reply. Three cases must not cancel:
 *
 * - audio the client ignored because the agent was mid-sentence — a breath or background blip
 *   transcribing as empty would otherwise cut the agent off and leave the call silent, with no
 *   nudge to recover from unless a heavy tool happened to be involved;
 * - a tool round in flight, where the pending response is the booking confirmation;
 * - the echo heuristic, which can misfire on a caller who genuinely repeats the agent's words.
 */
export function shouldCancelResponseForRejectedTranscript(
  input: CancelDecisionInput,
): CancelDecision {
  if (!input.hasTrackedUserTurn) return { cancel: false, skippedBecause: "untracked_audio" };
  if (input.toolRoundInFlight) return { cancel: false, skippedBecause: "tool_round_in_flight" };
  if (input.reason === "echo") return { cancel: false, skippedBecause: "echo_heuristic" };
  return { cancel: true };
}

/** How long a caller's answer may go unanswered before the agent is nudged to speak. */
export const SILENT_AGENT_NUDGE_MS = 4_000;

export interface SilentAgentInput {
  /** A response is currently being generated. */
  responseActive: boolean;
  /** The agent is currently speaking. */
  aiSpeaking: boolean;
  /** A tool call is still running; its own recovery nudge covers that case. */
  toolFetchInFlight: boolean;
  /** The call is ending or already gone. */
  callEnding: boolean;
}

/**
 * Whether to ask the agent to respond after a caller turn produced no reply at all.
 *
 * Without this, any path that leaves the model with nothing in flight — a cancelled response, a
 * dropped event, a turn the model simply didn't answer — ends the conversation silently, with the
 * caller waiting on a line that will never speak again. The nudge is a single deterministic
 * response.create per caller turn: no extra call happens when the agent is already speaking or
 * generating.
 */
export function shouldNudgeSilentAgent(input: SilentAgentInput): boolean {
  return (
    !input.responseActive && !input.aiSpeaking && !input.toolFetchInFlight && !input.callEnding
  );
}
