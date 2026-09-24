// Client-safe pieces of the client notes feature (no server imports).

export const CLIENT_NOTE_MAX_LENGTH = 5000;
export const CLIENT_NOTES_PAGE_SIZE = 20;

export interface ClientNote {
  id: string;
  clientId: string;
  eventId: string | null;
  body: string;
  authorUserId: string | null;
  authorName: string;
  /** Whether the client can see this note in their portal (default: internal only). */
  sharedWithClient: boolean;
  createdAt: string;
  updatedAt: string | null;
}

/** Trims a note body and checks its length; returns an error message, or the cleaned body. */
export function validateNoteBody(
  raw: unknown,
): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Write a note first." };
  const body = raw.trim();
  if (!body) return { ok: false, error: "Write a note first." };
  if (body.length > CLIENT_NOTE_MAX_LENGTH) {
    return { ok: false, error: `Notes can be at most ${CLIENT_NOTE_MAX_LENGTH} characters.` };
  }
  return { ok: true, body };
}
