const EMAIL_IN_TEXT = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Pick the longest valid @-address in text (avoids partial matches on dotted locals like muhammad.afzal.110190@gmail.com). */
export function findLongestEmailInText(text: string): string | undefined {
  const matches = [...text.matchAll(EMAIL_IN_TEXT)]
    .map((m) => m[0].toLowerCase())
    .filter(isValidEmail);
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => b.length - a.length)[0];
}

function normalizeSpokenLocalPart(raw: string): string {
  return raw
    .replace(/\s+dot\s+/gi, ".")
    .replace(/-/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeSpokenDomain(domain: string): string {
  return domain
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function buildSpokenEmail(localRaw: string, domainRaw: string): string | undefined {
  const email = `${normalizeSpokenLocalPart(localRaw)}@${normalizeSpokenDomain(domainRaw)}`;
  return isValidEmail(email) ? email : undefined;
}

/** Parse email the assistant spelled back during a voice confirmation (STEP 3b). */
export function parseEmailFromConfirmationText(text: string): string | undefined {
  const direct = findLongestEmailInText(text);
  if (direct) return direct;

  const hyphenLocalDots = text.match(
    /\b(?:that'?s\s+)?((?:[A-Za-z0-9](?:-[A-Za-z0-9])*)(?:\s+dot\s+(?:[A-Za-z0-9](?:-[A-Za-z0-9])*))*)\s+at\s+((?:[A-Za-z0-9]+(?:\s+dot\s+[A-Za-z0-9]+)*)+)/i,
  );
  if (hyphenLocalDots) {
    const email = buildSpokenEmail(hyphenLocalDots[1], hyphenLocalDots[2]);
    if (email) return email;
  }

  const wordsLocalDots = text.match(
    /\b(?:that'?s\s+)?((?:[a-zA-Z0-9]+(?:\s+dot\s+[a-zA-Z0-9]+)*))\s+at\s+((?:[A-Za-z0-9]+(?:\s+dot\s+[A-Za-z0-9]+)*)+)/i,
  );
  if (wordsLocalDots) {
    const email = buildSpokenEmail(wordsLocalDots[1], wordsLocalDots[2]);
    if (email) return email;
  }

  const hyphenAt = text.match(
    /([A-Za-z0-9](?:-[A-Za-z0-9])+)\s+at\s+((?:[A-Za-z0-9]+(?:\s+dot\s+[A-Za-z0-9]+)*)+)/i,
  );
  if (hyphenAt) {
    const email = buildSpokenEmail(hyphenAt[1], hyphenAt[2]);
    if (email) return email;
  }

  const wordsAt = text.match(
    /\b(?:that'?s\s+)?([a-zA-Z0-9._%+-]+)\s+at\s+((?:[A-Za-z0-9]+(?:\s+dot\s+[A-Za-z0-9]+)*)+)/i,
  );
  if (wordsAt) {
    const email = buildSpokenEmail(wordsAt[1], wordsAt[2]);
    if (email) return email;
  }

  return undefined;
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
    /[A-Za-z0-9]-[A-Za-z0-9]-[A-Za-z0-9]/.test(text) ||
    /\s+dot\s+/i.test(text)
  );
}

/** True when spelled-back email should replace the tool argument (never use a truncated partial). */
export function shouldPreferConfirmedEmail(current: string, confirmed: string): boolean {
  const [localCurrent, domainCurrent] = current.split("@");
  const [localConfirmed, domainConfirmed] = confirmed.split("@");
  if (!localCurrent || !domainCurrent || !localConfirmed || !domainConfirmed) return true;
  if (domainCurrent !== domainConfirmed) return true;
  if (localConfirmed.length >= localCurrent.length) return true;
  if (localCurrent.endsWith(localConfirmed) || localCurrent.includes(`.${localConfirmed}`)) {
    return false;
  }
  return true;
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
