/** Generates a unique reward code: CAMP-{initials}-{RAND} */
export function generateRewardCode(customerName: string, campaignId: string): string {
  const initials =
    customerName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 4) || "VIP";
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const suffix = campaignId.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `CAMP-${initials}-${rand}-${suffix}`;
}

export function displayRewardCode(raw: string): string {
  return raw.replace(/^USED:/, "");
}
