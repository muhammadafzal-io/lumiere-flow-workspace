const EMAIL_IN_TEXT = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const SPOKEN_DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/** Pick the longest valid @-address in text (avoids partial matches on dotted locals). */
export function findLongestEmailInText(text: string): string | undefined {
  const matches = [...text.matchAll(EMAIL_IN_TEXT)]
    .map((m) => m[0].toLowerCase())
    .filter(isValidEmail);
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => b.length - a.length)[0];
}

function collapseSpokenDigitRun(segment: string): string {
  const words = segment.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.every((w) => SPOKEN_DIGIT_WORDS[w.toLowerCase()])) {
    return words.map((w) => SPOKEN_DIGIT_WORDS[w.toLowerCase()]).join("");
  }
  return segment.replace(/-/g, "").replace(/\s+/g, "");
}

function normalizeSpokenLocalPart(raw: string): string {
  const segments = raw.split(/\s+dot\s+/i).map((part) => collapseSpokenDigitRun(part.trim()));
  return segments.join(".").replace(/-/g, "").replace(/\s+/g, "").toLowerCase();
}

function normalizeSpokenDomain(domain: string): string {
  let normalized = domain
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\s+/g, "")
    .toLowerCase();
  if (!normalized.includes(".") && /^(gmail|yahoo|hotmail|outlook|icloud)$/.test(normalized)) {
    normalized = `${normalized}.com`;
  }
  return normalized;
}

function stripSpokenEmailPrefix(local: string): string {
  return local
    .replace(/^(?:that'?s|let me confirm(?:\s+your email)?|got it)\s*[—,-]?\s*/i, "")
    .trim();
}

function buildSpokenEmail(localRaw: string, domainRaw: string): string | undefined {
  const email = `${normalizeSpokenLocalPart(localRaw)}@${normalizeSpokenDomain(domainRaw)}`;
  return isValidEmail(email) ? email : undefined;
}

/** Reject single spoken digit words like "zero" that are partial STT/spell-back mistakes. */
export function isSuspiciousEmailLocal(local: string): boolean {
  const norm = local.toLowerCase().trim();
  if (!norm) return true;
  if (norm.length < 3) return true;
  if (SPOKEN_DIGIT_WORDS[norm]) return true;
  return false;
}

function extractBroadSpokenEmail(text: string): string | undefined {
  const prefixed = text.match(
    /\b(?:that'?s|let me confirm(?:\s+your email)?)\s*[—,-]?\s*(.+?)\s+at\s+((?:[a-zA-Z0-9]+(?:\s+dot\s+[a-zA-Z0-9]+)*)+)/i,
  );
  if (!prefixed) return undefined;
  return buildSpokenEmail(stripSpokenEmailPrefix(prefixed[1]), prefixed[2]);
}

function extractLooseSpokenEmail(text: string): string | undefined {
  if (!/\s+dot\s+/i.test(text)) return undefined;
  const loose = text.match(/(.+?)\s+at\s+((?:[a-zA-Z0-9]+(?:\s+dot\s+[a-zA-Z0-9]+)*))/i);
  if (!loose) return undefined;
  return buildSpokenEmail(stripSpokenEmailPrefix(loose[1]), loose[2]);
}

function findAllWordsAtEmails(text: string): string[] {
  const re =
    /\b(?:that'?s\s+)?((?:[a-zA-Z0-9]+(?:\s+dot\s+[a-zA-Z0-9]+)*)|[a-zA-Z0-9._%+-]+)\s+at\s+((?:[a-zA-Z0-9]+(?:\s+dot\s+[A-Za-z0-9]+)*)+)/gi;
  const out: string[] = [];
  for (const match of text.matchAll(re)) {
    const email = buildSpokenEmail(match[1], match[2]);
    if (email) out.push(email);
  }
  return out;
}

function pickBestEmail(candidates: Array<{ email: string; index: number }>): string | undefined {
  const byEmail = new Map<string, number>();
  for (const { email, index } of candidates) {
    if (!isValidEmail(email)) continue;
    const prev = byEmail.get(email);
    if (prev === undefined || index > prev) byEmail.set(email, index);
  }

  const ranked = [...byEmail.entries()]
    .map(([email, index]) => ({ email, index }))
    .filter(({ email }) => !isSuspiciousEmailLocal(email.split("@")[0]))
    .sort((a, b) => {
      if (b.email.length !== a.email.length) return b.email.length - a.email.length;
      return b.index - a.index;
    });

  return ranked[0]?.email;
}

/** Parse email the assistant spelled back during a voice confirmation (STEP 3b). */
export function parseEmailFromConfirmationText(text: string): string | undefined {
  const direct = findLongestEmailInText(text);
  if (direct) return direct;

  const broad = extractBroadSpokenEmail(text);
  if (broad) return broad;

  const hyphenLocalDots = text.match(
    /\b(?:that'?s\s+)?((?:[A-Za-z0-9](?:-[A-Za-z0-9])*)(?:\s+dot\s+(?:[A-Za-z0-9](?:-[A-Za-z0-9])*))*)\s+at\s+((?:[A-Za-z0-9]+(?:\s+dot\s+[A-Za-z0-9]+)*)+)/i,
  );
  if (hyphenLocalDots) {
    const email = buildSpokenEmail(hyphenLocalDots[1], hyphenLocalDots[2]);
    if (email) return email;
  }

  const hyphenAt = text.match(
    /([A-Za-z0-9](?:-[A-Za-z0-9])+)\s+at\s+((?:[A-Za-z0-9]+(?:\s+dot\s+[A-Za-z0-9]+)*)+)/i,
  );
  if (hyphenAt) {
    const email = buildSpokenEmail(hyphenAt[1], hyphenAt[2]);
    if (email) return email;
  }

  const loose = extractLooseSpokenEmail(text);
  if (loose) return loose;

  return pickBestEmail(
    findAllWordsAtEmails(text).map((email, index) => ({ email, index: index + 1 })),
  );
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

function isEmailRelevantLine(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("@") ||
    /\s+at\s+(?:gmail|yahoo|hotmail|outlook|icloud)/i.test(lower) ||
    /\s+dot\s+/i.test(lower) ||
    /\bgmail\b/.test(lower)
  );
}

/** True when spelled-back email should replace the tool argument (never use a truncated partial). */
export function shouldPreferConfirmedEmail(current: string, confirmed: string): boolean {
  const [localCurrent, domainCurrent] = current.split("@");
  const [localConfirmed, domainConfirmed] = confirmed.split("@");
  if (!localCurrent || !domainCurrent || !localConfirmed || !domainConfirmed) return true;

  const currentSuspicious = isSuspiciousEmailLocal(localCurrent);
  const confirmedSuspicious = isSuspiciousEmailLocal(localConfirmed);
  if (confirmedSuspicious && !currentSuspicious) return false;
  if (currentSuspicious && !confirmedSuspicious) return true;

  if (domainCurrent !== domainConfirmed) return true;
  if (localConfirmed.length >= localCurrent.length) return true;
  if (localCurrent.endsWith(localConfirmed) || localCurrent.includes(`.${localConfirmed}`)) {
    return false;
  }
  return true;
}

/** Best email from the call transcript — user speech and assistant spell-back. */
export function findVoiceConfirmedEmail(
  lines: Array<{ role: string; text: string }>,
): string | undefined {
  const candidates: Array<{ email: string; index: number }> = [];

  lines.forEach((line, index) => {
    if (!isEmailRelevantLine(line.text) && !isEmailConfirmationLine(line.text)) return;

    const direct = findLongestEmailInText(line.text);
    if (direct) candidates.push({ email: direct, index });

    const spoken = parseEmailFromConfirmationText(line.text);
    if (spoken) candidates.push({ email: spoken, index });
  });

  return pickBestEmail(candidates);
}
