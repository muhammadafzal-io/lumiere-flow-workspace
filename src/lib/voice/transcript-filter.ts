/** Short valid caller replies — always accept even if brief */
const VALID_SHORT = new Set([
  "yes",
  "yep",
  "yup",
  "yeah",
  "yea",
  "ya",
  "no",
  "nay",
  "nah",
  "nope",
  "ok",
  "okay",
  "k",
  "sure",
  "right",
  "correct",
  "exactly",
  "mhm",
  "mm",
  "uh",
  "huh",
  "hi",
  "hey",
  "bye",
  "thanks",
  "thank",
  "hello",
]);

/** Common Whisper / background hallucinations */
const JUNK_PATTERNS: RegExp[] = [
  /thank(s)? you for watching/i,
  /like and subscribe/i,
  /\bsubscribe\b/i,
  /^\[music\]$/i,
  /^\[applause\]$/i,
  /^\[silence\]$/i,
  /^\[background/i,
  /copyright/i,
  /all rights reserved/i,
  /^\.+$/,
  /^[\s.,!?\-–—]+$/,
  /^(.)\1{4,}$/,
  /^(um+|uh+|er+|ah+|hm+)$/i,
  /^(the|a|an|you|it|is|and|or|to|of|in|on|at|for|be|we|he|she|they)$/i,
  /transcribed by/i,
  /amara\.org/i,
  /^\W+$/,
];

export interface TranscriptFilterContext {
  lastAssistantText?: string;
  /** Ms since call became active — used to ignore post-greeting noise */
  msSinceCallActive?: number;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s@.+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return normalize(text).split(" ").filter(Boolean).length;
}

function isLikelyEcho(userText: string, assistantText: string): boolean {
  const u = normalize(userText);
  const a = normalize(assistantText);
  if (!u || !a || u.length < 8) return false;

  if (a.includes(u) || u.includes(a)) return true;

  const uWords = new Set(u.split(" ").filter((w) => w.length > 2));
  const aWords = a.split(" ").filter((w) => w.length > 2);
  if (uWords.size === 0 || aWords.length === 0) return false;

  let overlap = 0;
  for (const w of uWords) {
    if (aWords.includes(w)) overlap++;
  }
  return overlap / uWords.size >= 0.65 && uWords.size >= 3;
}

/** Returns true when a user transcription should be discarded. */
export function shouldRejectUserTranscript(
  text: string,
  ctx: TranscriptFilterContext = {},
): boolean {
  const raw = text.trim();
  if (!raw) return true;

  const norm = normalize(raw);
  if (!norm) return true;

  if (VALID_SHORT.has(norm)) return false;

  if (/^\d[\d:.\-\s+()]{2,}$/.test(raw)) return false;
  if (raw.includes("@") && raw.includes(".")) return false;

  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(raw) || pattern.test(norm)) return true;
  }

  if (norm.length < 3 && !/^\d+$/.test(norm)) return true;

  if (wordCount(raw) === 1 && norm.length < 4 && !/^\d+$/.test(norm)) return true;

  // Right after the opening greeting: drop ultra-short noise only (not names or treatments)
  if (
    ctx.msSinceCallActive != null &&
    ctx.msSinceCallActive < 8_000 &&
    wordCount(raw) < 2 &&
    norm.length < 4 &&
    !/^\d+$/.test(norm)
  ) {
    return true;
  }

  if (ctx.lastAssistantText && isLikelyEcho(raw, ctx.lastAssistantText)) {
    return true;
  }

  return false;
}
