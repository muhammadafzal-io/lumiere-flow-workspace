/** Canonical production deployment — single repo: lumiere-flow-workspace. */
export const DEFAULT_APP_URL = "https://lumiere-flow-workspace-htt1.vercel.app";

/** Public chat widget — use this URL everywhere (emails, portal, agent, embeds). */
export const WIDGET_URL = `${DEFAULT_APP_URL}/widget`;

export function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || DEFAULT_APP_URL;
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
