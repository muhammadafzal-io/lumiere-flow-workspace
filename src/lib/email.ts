/** Strip voice/STT junk glued to the local part (e.g. that'sriaz36872 → riaz36872). */
export function sanitizeEmailLocalPart(local: string): string {
  return local
    .toLowerCase()
    .replace(/^(?:that'?s|thats|gotit|letmeconfirm)+/i, "")
    .replace(/^[^a-z0-9]+/i, "");
}

/** Normalize email on booking payloads (strips spaces from speech/typing, e.g. "talha azeem@gmail.com"). */
export function normalizeEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.includes("@")) return undefined;
  const compact = raw.trim().toLowerCase().replace(/\s+/g, "");
  const at = compact.indexOf("@");
  if (at <= 0) return undefined;

  const local = sanitizeEmailLocalPart(compact.slice(0, at));
  const domain = compact.slice(at + 1);
  if (!local || !domain) return undefined;

  const email = `${local}@${domain}`;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}
