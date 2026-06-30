/** Canonical production deployment — single repo: lumiere-flow-workspace. */
export const DEFAULT_APP_URL = "https://lumiere-flow-workspace-htt1.vercel.app";

/** Public URLs for client-facing chat channels (widget + Discord). */
export function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return DEFAULT_APP_URL;
}

export function getWidgetUrl(): string {
  return `${getAppBaseUrl()}/widget`;
}

export function getDiscordInviteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim();
  return url || null;
}
