/** Replace rule message placeholders with client-specific values. */
export function personalizeRuleMessage(
  template: string,
  opts: {
    name: string;
    offerCode?: string;
    offerType?: "credit" | "discount";
    offerAmount?: number;
    lastTreatment?: string;
    /** Auto-generated BDAY-XX-XXXX for Birthday rules (chatbot redeemable). */
    birthdayToken?: string;
  },
): string {
  const first = opts.name.trim().split(/\s+/)[0] || opts.name;
  const token = opts.birthdayToken ?? opts.offerCode ?? "";
  const amount = opts.offerAmount ?? 0;
  const offerType = opts.offerType ?? "credit";
  const offerAmountText = offerType === "discount" ? `${amount}%` : amount > 0 ? `$${amount}` : "";
  const offerSummary =
    amount > 0 ? (offerType === "discount" ? `${amount}% off` : `$${amount} credit`) : "";

  return template
    .replace(/\{first_name\}/g, first)
    .replace(/\{birthday_token\}/g, token)
    .replace(/\{credit_code\}/g, token)
    .replace(/\{offer_amount\}/g, offerAmountText)
    .replace(/\{discount_percent\}/g, offerType === "discount" ? String(amount) : "")
    .replace(/\{offer_summary\}/g, offerSummary)
    .replace(/\{last_treatment\}/g, opts.lastTreatment ?? "your last treatment");
}
