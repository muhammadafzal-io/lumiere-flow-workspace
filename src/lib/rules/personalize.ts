/** Replace rule message placeholders with client-specific values. */
export function personalizeRuleMessage(
  template: string,
  opts: {
    name: string;
    offerCode?: string;
    lastTreatment?: string;
    /** Auto-generated BDAY-XX-XXXX for Birthday rules (chatbot redeemable). */
    birthdayToken?: string;
  },
): string {
  const first = opts.name.trim().split(/\s+/)[0] || opts.name;
  const token = opts.birthdayToken ?? opts.offerCode ?? "";

  return template
    .replace(/\{first_name\}/g, first)
    .replace(/\{birthday_token\}/g, token)
    .replace(/\{credit_code\}/g, token)
    .replace(/\{last_treatment\}/g, opts.lastTreatment ?? "your last treatment");
}
