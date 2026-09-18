import { describe, expect, it } from "vitest";
import { classifyUserTranscript, shouldRejectUserTranscript } from "../transcript-filter";

/** Short answers that carry real booking meaning — these must always reach the agent. */
const PRODUCTIVE = [
  "yes",
  "yup",
  "yeah",
  "no",
  "nope",
  "ok",
  "sure",
  "correct",
  "Botox",
  "tomorrow",
  "3 PM",
  "Friday",
  "2:30",
  "Dr Josuf",
  "book it",
  "that's correct",
  "use this phone number",
  "no, make it 4 PM",
  "naeem@example.com",
  "+14255551234",
];

const NON_PRODUCTIVE = ["", "   ", "...", "umm", "uh", "hmm", "[music]", "[silence]", ".,!?"];

describe("classifyUserTranscript", () => {
  it("accepts short but productive booking answers", () => {
    for (const text of PRODUCTIVE) {
      expect(classifyUserTranscript(text), text).toEqual({ reject: false });
    }
  });

  it("rejects empty and whitespace-only transcripts as empty", () => {
    for (const text of ["", "   ", "\n"]) {
      expect(classifyUserTranscript(text)).toEqual({ reject: true, reason: "empty" });
    }
  });

  it("rejects known transcription junk", () => {
    for (const text of ["thank you for watching", "[music]", "please subscribe", "..."]) {
      const verdict = classifyUserTranscript(text);
      expect(verdict.reject, text).toBe(true);
    }
  });

  it("labels an echo of the agent separately from confident noise", () => {
    const lastAssistantText =
      "I have Friday at nine, eleven twenty and two o'clock with Dr Sophia Marchitti";
    const verdict = classifyUserTranscript(
      "I have Friday at nine eleven twenty and two o'clock with Dr Sophia Marchitti",
      { lastAssistantText },
    );
    expect(verdict).toEqual({ reject: true, reason: "echo" });
  });

  it("drops ultra-short noise as too_short", () => {
    // NOTE: the greeting-window branch in the filter is unreachable — every transcript short
    // enough to satisfy it is already caught by the single-word rule above it. Kept as-is here
    // because this task is not changing filter behaviour.
    expect(classifyUserTranscript("tsk", { msSinceCallActive: 1_000 })).toEqual({
      reject: true,
      reason: "too_short",
    });
  });

  it("keeps a treatment name spoken right after the greeting", () => {
    expect(classifyUserTranscript("Botox", { msSinceCallActive: 1_000 })).toEqual({
      reject: false,
    });
  });

  it("matches the original boolean helper exactly", () => {
    for (const text of [...PRODUCTIVE, ...NON_PRODUCTIVE]) {
      expect(shouldRejectUserTranscript(text), text).toBe(classifyUserTranscript(text).reject);
    }
  });
});
