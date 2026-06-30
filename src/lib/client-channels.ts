/** Public URLs for client-facing chat channels (widget + Discord). */

export function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function getWidgetUrl(): string {
  const base = getAppBaseUrl();
  return base ? `${base}/widget` : "/widget";
}

export function getDiscordInviteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim();
  return url || null;
}
