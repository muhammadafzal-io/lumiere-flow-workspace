import { describe, expect, it } from "vitest";
import { CLIENT_NOTE_MAX_LENGTH, validateNoteBody } from "../notes-shared";

describe("validateNoteBody", () => {
  it("trims the note", () => {
    expect(validateNoteBody("  Prefers numbing cream  ")).toEqual({
      ok: true,
      body: "Prefers numbing cream",
    });
  });

  it("rejects empty, blank and non-text notes", () => {
    for (const raw of ["", "   ", undefined, null, 42]) {
      expect(validateNoteBody(raw).ok).toBe(false);
    }
  });

  it("rejects notes over the length limit", () => {
    expect(validateNoteBody("a".repeat(CLIENT_NOTE_MAX_LENGTH)).ok).toBe(true);
    expect(validateNoteBody("a".repeat(CLIENT_NOTE_MAX_LENGTH + 1)).ok).toBe(false);
  });
});
