/** True when input is a date of birth answer — not a promo/credit code. */
export function looksLikeDateOfBirthInput(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  if (/^\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?$/.test(s)) return true;
  if (
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      s,
    ) &&
    /\d/.test(s)
  ) {
    return true;
  }
  if (/\b(birthday|birth\s*date|date\s*of\s*birth|born\s+on|dob)\b/i.test(s)) return true;
  return false;
}

export function phoneRequiredForPromoError(): string {
  return "Phone number is required before validating any promo code. Ask for the client's phone first, then call validate_credit_code with both code and phone.";
}

export function dateOfBirthNotPromoCodeError(): string {
  return "That looks like a date of birth, not a promo code. Save it with upsert_client as birthday (YYYY-MM-DD). Do not call validate_credit_code for birthdays.";
}
