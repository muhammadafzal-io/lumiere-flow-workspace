/** Parse email the assistant spelled back during a voice confirmation (STEP 3b). */
export function parseEmailFromConfirmationText(text: string): string | undefined {
  const direct = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (direct) {
    const email = direct[1].toLowerCase();
    if (isValidEmail(email)) return email;
  }

  const hyphenAt = text.match(
    /([A-Za-z0-9](?:-[A-Za-z0-9])+)\s+at\s+((?:[A-Za-z0-9]+(?:\s+dot\s+[A-Za-z0-9]+)*)+)/i,
  );
  if (hyphenAt) {
    const email = `${hyphenAt[1].replace(/-/g, "").toLowerCase()}@${normalizeSpokenDomain(hyphenAt[2])}`;
    if (isValidEmail(email)) return email;
  }

  const wordsAt = text.match(
    /\b(?:that'?s\s+)?([a-zA-Z0-9._%+-]+)\s+at\s+((?:[A-Za-z0-9]+(?:\s+dot\s+[A-Za-z0-9]+)*)+)/i,
  );
  if (wordsAt) {
    const email = `${wordsAt[1].toLowerCase()}@${normalizeSpokenDomain(wordsAt[2])}`;
    if (isValidEmail(email)) return email;
  }

  return undefined;
}

function normalizeSpokenDomain(domain: string): string {
  return domain
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isEmailConfirmationLine(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("confirm") ||
    lower.includes("is that correct") ||
    lower.includes("did i get that right") ||
    lower.includes("@") ||
    /\s+at\s+(?:gmail|yahoo|hotmail|outlook|icloud)/i.test(text) ||
    /[A-Za-z0-9]-[A-Za-z0-9]-[A-Za-z0-9]/.test(text)
  );
}

/** Latest email the assistant spelled back — more reliable than caller STT on tool args. */
export function findVoiceConfirmedEmail(
  lines: Array<{ role: string; text: string }>,
): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.role !== "assistant" || !isEmailConfirmationLine(line.text)) continue;
    const parsed = parseEmailFromConfirmationText(line.text);
    if (parsed) return parsed;
  }
  return undefined;
}
