"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Copy, Check, ExternalLink, MessageSquare, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDiscordInviteUrl, getWidgetUrl } from "@/lib/client-channels";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function useChannelUrls() {
  return useMemo(
    () => ({
      widgetUrl: getWidgetUrl(),
      discordUrl: getDiscordInviteUrl(),
    }),
    [],
  );
}

function CopyWidgetLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={copy}>
      {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

/** Dashboard cards — primary entry point for staff. */
export function ClientChannelsDashboard() {
  const { widgetUrl, discordUrl } = useChannelUrls();

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b bg-secondary/30">
        <h2 className="text-sm font-semibold tracking-tight">Client channels</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Open the AI assistant your clients use — same booking, voice, and email flows as
          production.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x">
        <ChannelCard
          title="Website chat widget"
          description="Text chat and voice concierge. Share this link or embed it on your site."
          icon={
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
          }
          badges={["Chat", "Voice"]}
          primaryLabel="Open widget"
          primaryHref={widgetUrl}
          secondary={<CopyWidgetLink url={widgetUrl} />}
          urlPreview={widgetUrl}
        />
        <ChannelCard
          title="Discord"
          description="Talk to Lumière in your Discord server — bookings, reminders, and escalations."
          icon={
            <div className="h-10 w-10 rounded-lg bg-[#5865F2]/15 flex items-center justify-center text-[#5865F2]">
              <DiscordIcon className="h-5 w-5" />
            </div>
          }
          badges={["Messaging"]}
          primaryLabel={discordUrl ? "Open Discord" : "Invite not configured"}
          primaryHref={discordUrl ?? undefined}
          primaryDisabled={!discordUrl}
          secondary={
            !discordUrl ? (
              <p className="text-[11px] text-muted-foreground leading-snug">
                Set <code className="font-mono">NEXT_PUBLIC_DISCORD_INVITE_URL</code> in Vercel env.
              </p>
            ) : undefined
          }
        />
      </div>
    </section>
  );
}

function ChannelCard({
  title,
  description,
  icon,
  badges,
  primaryLabel,
  primaryHref,
  primaryDisabled,
  secondary,
  urlPreview,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  badges: string[];
  primaryLabel: string;
  primaryHref?: string;
  primaryDisabled?: boolean;
  secondary?: ReactNode;
  urlPreview?: string;
}) {
  return (
    <div className="p-5 flex flex-col gap-4 min-h-[180px]">
      <div className="flex items-start gap-3">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-sm">{title}</h3>
            {badges.map((b) => (
              <span
                key={b}
                className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium"
              >
                {b}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      {urlPreview && (
        <p className="text-[11px] font-mono text-muted-foreground truncate bg-muted/50 rounded-md px-2.5 py-1.5 border">
          {urlPreview}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {primaryHref && !primaryDisabled ? (
          <Button asChild size="sm" className="h-8">
            <a href={primaryHref} target="_blank" rel="noopener noreferrer">
              {primaryLabel}
              <ExternalLink className="h-3.5 w-3.5 ml-1.5 opacity-70" />
            </a>
          </Button>
        ) : (
          <Button size="sm" className="h-8" disabled={primaryDisabled}>
            {primaryLabel}
          </Button>
        )}
        {secondary}
      </div>
    </div>
  );
}

/** Sidebar footer — always visible while navigating the portal. */
export function ClientChannelsSidebar() {
  const { widgetUrl, discordUrl } = useChannelUrls();

  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Client channels
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Open chat widget">
              <a href={widgetUrl} target="_blank" rel="noopener noreferrer">
                <MessageSquare className="h-4 w-4" />
                <span>Chat widget</span>
                <ExternalLink className="ml-auto h-3 w-3 opacity-50 group-data-[collapsible=icon]:hidden" />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild={!!discordUrl}
              tooltip={discordUrl ? "Open Discord" : "Set NEXT_PUBLIC_DISCORD_INVITE_URL"}
              disabled={!discordUrl}
            >
              {discordUrl ? (
                <a href={discordUrl} target="_blank" rel="noopener noreferrer">
                  <DiscordIcon className="h-4 w-4" />
                  <span>Discord</span>
                  <ExternalLink className="ml-auto h-3 w-3 opacity-50 group-data-[collapsible=icon]:hidden" />
                </a>
              ) : (
                <span className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                  <DiscordIcon className="h-4 w-4" />
                  <span>Discord</span>
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Top bar quick actions. */
export function ClientChannelsTopBar() {
  const { widgetUrl, discordUrl } = useChannelUrls();

  return (
    <div className="hidden md:flex items-center gap-1.5">
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-normal" asChild>
        <a href={widgetUrl} target="_blank" rel="noopener noreferrer">
          <MessageSquare className="h-3.5 w-3.5" />
          Widget
          <Mic className="h-3 w-3 text-muted-foreground" aria-hidden />
        </a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-8 gap-1.5 text-xs font-normal",
          discordUrl && "text-[#5865F2] border-[#5865F2]/30",
        )}
        asChild={!!discordUrl}
        disabled={!discordUrl}
      >
        {discordUrl ? (
          <a href={discordUrl} target="_blank" rel="noopener noreferrer">
            <DiscordIcon className="h-3.5 w-3.5" />
            Discord
          </a>
        ) : (
          <span className="flex items-center gap-1.5 opacity-50">
            <DiscordIcon className="h-3.5 w-3.5" />
            Discord
          </span>
        )}
      </Button>
    </div>
  );
}
