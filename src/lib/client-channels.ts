/** Canonical production deployment — single repo: lumiere-flow-workspace. */
export const DEFAULT_APP_URL = "https://lumiere-flow-workspace-htt1.vercel.app";

/** Public chat widget — use this URL everywhere (emails, portal, agent, embeds). */
export const WIDGET_URL = `${DEFAULT_APP_URL}/widget`;

export function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  // A localhost value copied from a dev .env must never reach a real client: in production it would
  // put "http://localhost:3000/…" into emails and SMS. Fall back to the canonical URL instead.
  const isLocal = !!configured && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configured);
  if (!configured || (isLocal && process.env.NODE_ENV === "production")) return DEFAULT_APP_URL;
  return configured;
}

export function getWidgetUrl(): string {
  return WIDGET_URL;
}

/** Standard line for email/SMS bodies pointing clients to the widget. */
export function widgetLinkLine(): string {
  return `Chat or book online anytime: ${WIDGET_URL}`;
}

export function getDiscordInviteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim();
  return url || null;
}
