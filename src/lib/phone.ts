/** Normalize phone to digits-only for comparison. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Match phones across +1, spaces, dashes — compares full digits and last 10 (US). */
export function phonesMatch(text: string, phone: string): boolean {
  const haystack = phoneDigits(text);
  const needle = phoneDigits(phone);
  if (!needle || needle.length < 7 || !haystack) return false;
  if (haystack === needle) return true;
  if (haystack.includes(needle) || needle.includes(haystack)) return true;

  const n10 = needle.slice(-10);
  if (n10.length === 10 && haystack.includes(n10)) return true;

  const n7 = needle.slice(-7);
  if (n7.length === 7 && haystack.includes(n7)) return true;

  return false;
}

/** True if any needle variant matches the field text. */
export function phonesMatchAny(text: string, ...phones: Array<string | undefined>): boolean {
  const field = text.trim();
  if (!field) return false;
  for (const phone of phones) {
    if (phone?.trim() && phonesMatch(field, phone)) return true;
  }
  return false;
}

/** Best-effort normalisation for spoken or messy phone input. */
export function extractPhoneForLookup(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const digits = phoneDigits(trimmed);
  if (digits.length >= 10) {
    const d10 =
      digits.length >= 11 && digits.startsWith("1") ? digits.slice(-10) : digits.slice(-10);
    return `+1${d10}`;
  }
  if (digits.length >= 7) return digits;
  return trimmed;
}

/** Collect unique phone strings to search (formats + digit variants). */
export function phoneSearchVariants(...phones: Array<string | undefined>): string[] {
  const out = new Set<string>();
  for (const p of phones) {
    const trimmed = p?.trim();
    if (!trimmed) continue;
    out.add(trimmed);
    const digits = phoneDigits(trimmed);
    if (digits.length < 7) continue;
    out.add(digits);
    const d10 =
      digits.length >= 11 && digits.startsWith("1")
        ? digits.slice(1)
        : digits.length === 10
          ? digits
          : digits.slice(-10);
    if (d10.length === 10) {
      out.add(d10);
      out.add(`+1${d10}`);
      out.add(`1${d10}`);
      out.add(`+1 ${d10.slice(0, 3)} ${d10.slice(3, 6)} ${d10.slice(6)}`);
      out.add(`(${d10.slice(0, 3)}) ${d10.slice(3, 6)}-${d10.slice(6)}`);
    }
  }
  return [...out];
}
