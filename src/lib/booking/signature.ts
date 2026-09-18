/**
 * Validation for a drawn signature, shared by the approval API and the page that captures it.
 *
 * A signature arrives as a PNG data URL produced by a canvas. Only PNG is accepted, and only up to
 * a size a real signature needs — that keeps a pasted photo, an SVG (which can carry script) or an
 * oversized payload out of a column that is later rendered back as an image.
 */

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

/** ~200 KB of base64, far above a drawn signature (tens of KB) and far below a photo. */
export const MAX_SIGNATURE_CHARS = 200_000;

/** Rejects a canvas that was submitted without anything drawn on it. */
const MIN_SIGNATURE_CHARS = 1_000;

export type SignatureCheck = { ok: true; signature: string } | { ok: false; error: string };

export function validateSignature(raw: unknown): SignatureCheck {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Please sign to approve." };
  }
  const signature = raw.trim();
  if (!signature.startsWith(PNG_DATA_URL_PREFIX)) {
    return { ok: false, error: "That signature could not be read." };
  }
  const base64 = signature.slice(PNG_DATA_URL_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { ok: false, error: "That signature could not be read." };
  }
  if (signature.length < MIN_SIGNATURE_CHARS) {
    return { ok: false, error: "Please sign to approve." };
  }
  if (signature.length > MAX_SIGNATURE_CHARS) {
    return { ok: false, error: "That signature is too large — please sign again." };
  }
  return { ok: true, signature };
}
