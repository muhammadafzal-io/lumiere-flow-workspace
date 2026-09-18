import { describe, expect, it } from "vitest";
import { shouldCancelResponseForRejectedTranscript } from "../response-guard";

const base = { hasTrackedUserTurn: true, toolRoundInFlight: false } as const;

describe("shouldCancelResponseForRejectedTranscript", () => {
  it("cancels the reply that noise from a tracked user turn prompted", () => {
    for (const reason of ["empty", "junk", "too_short", "greeting_noise"] as const) {
      expect(shouldCancelResponseForRejectedTranscript({ ...base, reason })).toEqual({
        cancel: true,
      });
    }
  });

  it("never cancels on audio the call was not tracking", () => {
    // The stall this guards against: the caller answers ("Today is Friday, 18th September"), the
    // agent starts replying, and a breath transcribes as empty. That audio was ignored — no
    // placeholder — so cancelling it would silence the agent for the rest of the call.
    expect(
      shouldCancelResponseForRejectedTranscript({
        reason: "empty",
        hasTrackedUserTurn: false,
        toolRoundInFlight: false,
      }),
    ).toEqual({ cancel: false, skippedBecause: "untracked_audio" });
  });

  it("never cancels while a tool round is in flight", () => {
    expect(
      shouldCancelResponseForRejectedTranscript({
        reason: "junk",
        hasTrackedUserTurn: true,
        toolRoundInFlight: true,
      }),
    ).toEqual({ cancel: false, skippedBecause: "tool_round_in_flight" });
  });

  it("never cancels on the echo heuristic alone", () => {
    expect(shouldCancelResponseForRejectedTranscript({ ...base, reason: "echo" })).toEqual({
      cancel: false,
      skippedBecause: "echo_heuristic",
    });
  });

  it("puts untracked audio ahead of every other reason", () => {
    expect(
      shouldCancelResponseForRejectedTranscript({
        reason: "echo",
        hasTrackedUserTurn: false,
        toolRoundInFlight: true,
      }),
    ).toMatchObject({ cancel: false, skippedBecause: "untracked_audio" });
  });
});
