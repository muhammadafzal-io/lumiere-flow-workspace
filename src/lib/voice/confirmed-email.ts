import { hasSttJunkLocalPrefix, normalizeEmail, sanitizeEmailLocalPart } from "@/lib/email";

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

type EmailParseSource = "hyphen" | "direct" | "word";
type SpeakerRole = "assistant" | "user";

interface EmailCandidate {
  email: string;
  index: number;
  source: EmailParseSource;
  role: SpeakerRole;
}

const SOURCE_RANK: Record<EmailParseSource, number> = {
  hyphen: 3,
  direct: 2,
  word: 1,
};

const ROLE_RANK: Record<SpeakerRole, number> = {
  assistant: 2,
  user: 1,
};

/** Pick the longest valid @-address in text (avoids partial matches on dotted locals). */
export function findLongestEmailInText(text: string): string | undefined {
  const prepared = prepareTextForEmailExtraction(text);
  const matches = [...prepared.matchAll(EMAIL_IN_TEXT)]
    .map((m) => finalizeEmail(m[0].toLowerCase()))
    .filter((email): email is string => Boolean(email));
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
    .toLowerCase()
    .replace(/[.,!?;:]+$/, "");
  if (!normalized.includes(".") && /^(gmail|yahoo|hotmail|outlook|icloud)$/.test(normalized)) {
    normalized = `${normalized}.com`;
  }
  return normalized;
}

/** Remove STT glue like that'sriaz… or thank-you spell-back phrases before @-patterns. */
function prepareTextForEmailExtraction(text: string): string {
  return text
    .replace(/that'?s(?=[a-zA-Z0-9])/gi, "")
    .replace(
      /thank\s*you(?:\s+for\s+clarifying)?[.,!\s—-]*let\s*me\s+spell\s*it\s+back[.:!\s—-]*/gi,
      "",
    );
}

function stripSpokenEmailPrefix(local: string): string {
  return local
    .replace(
      /^(?:that'?s|let me confirm(?:\s+your email)?|got it|thank you(?:\s+for\s+clarifying)?|let me spell it back)\s*[—,-]?\s*/i,
      "",
    )
    .trim();
}

function buildSpokenEmail(localRaw: string, domainRaw: string): string | undefined {
  const local = sanitizeEmailLocalPart(normalizeSpokenLocalPart(stripSpokenEmailPrefix(localRaw)));
  return finalizeEmail(`${local}@${normalizeSpokenDomain(domainRaw)}`);
}

function finalizeEmail(email: string): string | undefined {
  const at = email.indexOf("@");
  if (at <= 0) return undefined;
  const cleaned = `${sanitizeEmailLocalPart(email.slice(0, at))}@${email.slice(at + 1).toLowerCase()}`;
  return isValidEmail(cleaned) ? cleaned : undefined;
}

/** Reject single spoken digit words like "zero" that are partial STT/spell-back mistakes. */
export function isSuspiciousEmailLocal(local: string): boolean {
  const norm = local.toLowerCase().trim();
  if (!norm) return true;
  if (norm.length < 3) return true;
  if (SPOKEN_DIGIT_WORDS[norm]) return true;
  return false;
}

function parseHyphenSpellBackEmail(text: string): string | undefined {
  const hyphenLocalDots = text.match(
    /\b(?:that'?s\s+)?((?:[A-Za-z0-9](?:-[A-Za-z0-9])*)(?:\s+dot\s+(?:[A-Za-z0-9](?:-[A-Za-z0-9])*))*)\s+at\s+((?:[a-zA-Z0-9]+(?:\s+dot\s+[a-zA-Z0-9]+)*)+)/i,
  );
  if (hyphenLocalDots) {
    const email = buildSpokenEmail(hyphenLocalDots[1], hyphenLocalDots[2]);
    if (email) return email;
  }
  return extractSimpleHyphenAtEmail(text);
}

function extractSimpleHyphenAtEmail(text: string): string | undefined {
  if (/(?:-[A-Za-z0-9])+\s+dot\s+/i.test(text)) return undefined;
  const hyphenAt = text.match(/([A-Za-z0-9](?:-[A-Za-z0-9])+)\s+at\s+([a-z0-9.]+)/i);
  if (!hyphenAt) return undefined;
  return buildSpokenEmail(hyphenAt[1], hyphenAt[2]);
}

function parseWordSpokenEmail(text: string): string | undefined {
  const spellBack = text.match(/\blet me spell it back\s*[—,:.\s-]*\s*(.+?)\s+at\s+([a-z0-9.]+)/i);
  if (spellBack) {
    const email = buildSpokenEmail(stripSpokenEmailPrefix(spellBack[1]), spellBack[2]);
    if (email) return email;
  }

  const broad = text.match(
    /\b(?:that'?s|let me confirm(?:\s+your email)?|let me spell it back)\s*[—,-]?\s*(.+?)\s+at\s+([a-z0-9.]+)/i,
  );
  if (broad) {
    const email = buildSpokenEmail(stripSpokenEmailPrefix(broad[1]), broad[2]);
    if (email) return email;
  }

  if (/\s+dot\s+/i.test(text)) {
    const loose = text.match(/(.+?)\s+at\s+((?:[a-zA-Z0-9]+(?:\s+dot\s+[a-zA-Z0-9]+)*))/i);
    if (loose) {
      const email = buildSpokenEmail(stripSpokenEmailPrefix(loose[1]), loose[2]);
      if (email) return email;
    }
  }

  const re =
    /\b(?:that'?s\s+)?((?:[a-zA-Z0-9]+(?:\s+dot\s+[a-zA-Z0-9]+)*)|[a-zA-Z0-9._%+-]+)\s+at\s+([a-z0-9.]+)/gi;
  const wordCandidates: Array<{ email: string; index: number }> = [];
  for (const match of text.matchAll(re)) {
    const email = buildSpokenEmail(match[1], match[2]);
    if (email) wordCandidates.push({ email, index: wordCandidates.length + 1 });
  }
  return pickBestEmailByLength(wordCandidates);
}

function parseEmailCandidatesFromLine(
  text: string,
): Array<{ email: string; source: EmailParseSource }> {
  const prepared = prepareTextForEmailExtraction(text);
  const out: Array<{ email: string; source: EmailParseSource }> = [];

  const hyphen = parseHyphenSpellBackEmail(prepared);
  if (hyphen) out.push({ email: hyphen, source: "hyphen" });

  const direct = findLongestEmailInText(prepared);
  if (direct) out.push({ email: direct, source: "direct" });

  const word = parseWordSpokenEmail(prepared);
  if (word) out.push({ email: word, source: "word" });

  return out;
}

/** Parse email the assistant spelled back during a voice confirmation (STEP 3b). */
export function parseEmailFromConfirmationText(text: string): string | undefined {
  const candidates = parseEmailCandidatesFromLine(text);
  return pickBestEmailCandidate(
    candidates.map((candidate, index) => ({
      ...candidate,
      index,
      role: "assistant",
    })),
  );
}

function pickBestEmailByLength(
  candidates: Array<{ email: string; index: number }>,
): string | undefined {
  const ranked = candidates
    .filter(({ email }) => isValidEmail(email) && !isSuspiciousEmailLocal(email.split("@")[0]))
    .sort((a, b) => {
      if (b.email.length !== a.email.length) return b.email.length - a.email.length;
      return b.index - a.index;
    });
  return ranked[0]?.email;
}

function pickBestEmailCandidate(candidates: EmailCandidate[]): string | undefined {
  const ranked = candidates
    .filter(({ email }) => isValidEmail(email) && !isSuspiciousEmailLocal(email.split("@")[0]))
    .sort((a, b) => {
      if (SOURCE_RANK[b.source] !== SOURCE_RANK[a.source]) {
        return SOURCE_RANK[b.source] - SOURCE_RANK[a.source];
      }
      if (ROLE_RANK[b.role] !== ROLE_RANK[a.role]) {
        return ROLE_RANK[b.role] - ROLE_RANK[a.role];
      }
      if (b.email.length !== a.email.length) return b.email.length - a.email.length;
      return b.index - a.index;
    });
  return ranked[0]?.email;
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
    lower.includes("spell it back") ||
    lower.includes("spell back") ||
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

/**
 * True when transcript email should replace the tool argument.
 * Generic rules: never swap in a shorter/partial address; prefer longer on same domain;
 * prefer transcript when same length but STT-corrupted; reject suspicious partials.
 */
export function shouldPreferConfirmedEmail(current: string, confirmed: string): boolean {
  if (current === confirmed) return false;

  const [localCurrent, domainCurrent] = current.split("@");
  const [localConfirmed, domainConfirmed] = confirmed.split("@");
  if (!localCurrent || !domainCurrent || !localConfirmed || !domainConfirmed) return true;

  const currentSuspicious = isSuspiciousEmailLocal(localCurrent);
  const confirmedSuspicious = isSuspiciousEmailLocal(localConfirmed);
  if (confirmedSuspicious && !currentSuspicious) return false;
  if (currentSuspicious && !confirmedSuspicious) return true;
  if (hasSttJunkLocalPrefix(localCurrent)) return true;

  if (domainCurrent !== domainConfirmed) return true;

  if (localConfirmed.length !== localCurrent.length) {
    return localConfirmed.length > localCurrent.length;
  }

  if (localCurrent.endsWith(localConfirmed) || localCurrent.includes(`.${localConfirmed}`)) {
    return false;
  }

  return true;
}

/**
 * Most recent assistant spell-back / confirmation line (STEP 3b).
 * Ignores suspicious partials like "zero@gmail.com".
 */
export function findAssistantSpellBackEmail(
  lines: Array<{ role: string; text: string }>,
): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (line.role !== "assistant") continue;
    if (!isEmailConfirmationLine(line.text)) continue;
    const email = parseEmailFromConfirmationText(line.text);
    if (!email) continue;
    const local = email.split("@")[0] ?? "";
    if (isSuspiciousEmailLocal(local)) continue;
    return email;
  }
  return undefined;
}

/** Email to save — assistant spell-back wins over tool/STT args. */
export function resolveVoiceBookingEmail(
  lines: Array<{ role: string; text: string }>,
  toolRaw: unknown,
): string | undefined {
  const assistant = findAssistantSpellBackEmail(lines);
  if (assistant) {
    const norm = normalizeEmail(assistant);
    if (norm) return norm;
  }

  const transcript = findVoiceConfirmedEmailFromTranscript(lines);
  if (transcript) {
    const norm = normalizeEmail(transcript);
    if (norm) return norm;
  }

  return normalizeEmail(toolRaw);
}

function findVoiceConfirmedEmailFromTranscript(
  lines: Array<{ role: string; text: string }>,
): string | undefined {
  const candidates: EmailCandidate[] = [];

  lines.forEach((line, index) => {
    if (!isEmailRelevantLine(line.text) && !isEmailConfirmationLine(line.text)) return;

    const role: SpeakerRole = line.role === "assistant" ? "assistant" : "user";
    for (const parsed of parseEmailCandidatesFromLine(line.text)) {
      candidates.push({ ...parsed, index, role });
    }
  });

  return pickBestEmailCandidate(candidates);
}

/** Best email from the call transcript — assistant spell-back first, then hyphen/word fallbacks. */
export function findVoiceConfirmedEmail(
  lines: Array<{ role: string; text: string }>,
): string | undefined {
  const assistant = findAssistantSpellBackEmail(lines);
  if (assistant) return assistant;
  return findVoiceConfirmedEmailFromTranscript(lines);
}
