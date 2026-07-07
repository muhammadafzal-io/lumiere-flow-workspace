const STT_JUNK_LOCAL_SEGMENT =
  /^(?:that'?s|thats|gotit|letme(?:spellitback|confirm(?:youremail)?)?|thankyou(?:for(?:clarifying|confirming))?|clarifying|confirm(?:your|ing)?|spellitback)$/i;

function stripJunkDottedSegments(local: string): string {
  const segments = local.split(".");
  while (segments.length > 1 && STT_JUNK_LOCAL_SEGMENT.test(segments[0]!)) {
    segments.shift();
  }
  return segments.join(".");
}

/** Strip voice/STT junk glued to the local part (e.g. that'sriaz36872 → riaz36872). */
export function sanitizeEmailLocalPart(local: string): string {
  let s = local.toLowerCase();

  // "let me spell it back: musammad.afzal…" often becomes "letmespellitback:musammad…"
  if (s.includes(":")) {
    const afterColon = s.slice(s.lastIndexOf(":") + 1);
    if (afterColon.length >= 3) s = afterColon;
  }

  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/^(?:that'?s|thats|gotit|letmeconfirm|letme|confirmyour)+/i, "")
      .replace(/^[^a-z0-9]+/i, "");
    s = stripJunkDottedSegments(s);
  }

  return s.replace(/^[^a-z0-9]+/i, "");
}

/** True when STT glued conversational words onto the email local part. */
export function hasSttJunkLocalPrefix(local: string): boolean {
  const norm = local.toLowerCase();
  if (/^(?:that'?s|thats|gotit|letme|confirm|thankyou|clarifying|spellitback)/.test(norm)) {
    return true;
  }
  if (/(?:thankyou|letmespellitback|spellitback|clarifying)/.test(norm)) {
    return true;
  }
  const firstSegment = norm.split(/[.:@]/)[0] ?? "";
  return STT_JUNK_LOCAL_SEGMENT.test(firstSegment);
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
