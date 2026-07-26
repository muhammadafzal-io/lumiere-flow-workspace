/** Normalize phone to digits-only for comparison. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Match phones across +1/leading-1/no-prefix variants — compares full digits, then the last-10
 * national number. Deliberately NOT a substring-anywhere check: two unrelated phone numbers can
 * easily share a run of digits in the middle (e.g. a 7-digit local-number overlap), and this
 * function backs cancel/reschedule-by-phone, where a false match means acting on the wrong
 * client's appointment. A match only counts when one number, after normalizing away a leading
 * country/trunk-prefix digit, is identical to the other — never a loose "contains" check.
 */
export function phonesMatch(text: string, phone: string): boolean {
  const haystack = phoneDigits(text);
  const needle = phoneDigits(phone);
  if (!needle || needle.length < 7 || !haystack) return false;
  if (haystack === needle) return true;

  const h10 = haystack.length >= 10 ? haystack.slice(-10) : haystack;
  const n10 = needle.length >= 10 ? needle.slice(-10) : needle;
  if (h10.length === 10 && n10.length === 10 && h10 === n10) return true;

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

/**
 * Converts a locally-typed number (e.g. "03457066680") into the country-code format WhatsApp's
 * Cloud API requires (no leading 0, no "+", prefixed with the country code) — same "assume this
 * clinic's locale" approach extractPhoneForLookup already takes for US numbers with "+1", just
 * for this clinic's Pakistan-based numbers. Without this, a number already allow-listed/verified
 * in international format (e.g. "923457066680") gets silently rejected by Meta when a form saves
 * it in local format instead — same phone, different string, and the WhatsApp API does no
 * fuzzy-matching of its own.
 */
export function normalizeWhatsAppPhone(raw: string, defaultCountryCode = "92"): string {
  const digits = phoneDigits(raw);
  if (!digits) return digits;
  if (digits.startsWith(defaultCountryCode)) return digits;
  if (digits.startsWith("0")) return defaultCountryCode + digits.slice(1);
  return defaultCountryCode + digits;
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
