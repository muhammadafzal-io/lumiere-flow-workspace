"use client";

import Link from "next/link";
import { Loader2, Sparkles, type LucideIcon } from "lucide-react";
import type { CustomerAppointmentStatus } from "@/lib/account/visible";
import { CUSTOMER_STATUS_LABELS } from "@/lib/account/visible";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs as UITabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * The customer-facing vocabulary — built on the same tokens and primitives as the admin portal
 * (bg-card/border, the shadcn Button, the same badge and skeleton conventions) rather than a
 * separate palette, so the portal reads as the same product a staff member works in every day.
 */

export function AccountCard({
  children,
  className = "",
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Adds the hover affordance for a card that's also a button/link. */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card text-card-foreground shadow-[0_1px_2px_rgba(27,42,74,0.04)] animate-in fade-in-0 slide-in-from-bottom-1 duration-500",
        interactive &&
          "transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_30px_-18px_rgba(27,42,74,0.3)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The stage behind a page's opening block — the public hero's language, scaled down: a blueprint
 * grid faded toward the edges, a teal glow rising from below, and two slow-drifting blobs. Sits
 * behind its parent's content (-z-10), so the parent needs `relative isolate overflow-hidden`.
 */
export function HeroBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.07) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 80% 90% at 40% 30%, black 20%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 90% at 40% 30%, black 20%, transparent 80%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 50% 120%, color-mix(in oklch, var(--color-primary) 65%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="animate-blob-drift pointer-events-none absolute -left-24 -top-24 -z-10 h-80 w-80 rounded-full bg-primary/25 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-blob-drift-slow pointer-events-none absolute -right-24 top-1/3 -z-10 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />
    </>
  );
}

/** Full-screen dark stage for pages with no shell around them (sign-in, claiming a profile). */
export function AccountStage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-panel px-4 py-10 text-panel-foreground">
      <HeroBackdrop />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}

/**
 * The opening block of every account page: full-bleed dark stage flowing on from the dark header,
 * with a label, a big title, a line of context and — optionally — the page's main actions. The
 * negative top margin cancels the shell's padding so the stage meets the header with no seam.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative isolate left-1/2 -mt-8 mb-10 w-screen -translate-x-1/2 overflow-hidden bg-panel text-panel-foreground sm:-mt-12">
      <HeroBackdrop />
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-14">
        {eyebrow && (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-[11px] uppercase tracking-[0.18em] text-panel-foreground/75 backdrop-blur">
            {eyebrow}
          </span>
        )}
        <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.05] tracking-[-0.035em] sm:text-6xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-panel-foreground/70">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-7 flex flex-wrap gap-3">{children}</div>}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      <span className="h-px w-5 bg-primary/60" aria-hidden />
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<CustomerAppointmentStatus, string> = {
  upcoming: "bg-success/10 text-success border-success/20",
  today: "bg-primary/10 text-primary border-primary/20",
  past: "bg-muted text-muted-foreground border-border",
  awaiting_details: "bg-warning/15 text-warning-foreground border-warning/30",
  awaiting_approval: "bg-warning/15 text-warning-foreground border-warning/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export function StatusBadge({ status }: { status: CustomerAppointmentStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {CUSTOMER_STATUS_LABELS[status]}
    </span>
  );
}

export function AccountEmpty({
  title,
  body,
  action,
  icon: Icon = Sparkles,
}: {
  title: string;
  body: string;
  action?: { label: string; href: string };
  icon?: LucideIcon;
}) {
  return (
    <AccountCard className="relative overflow-hidden border-dashed bg-primary/[0.03] px-6 py-12 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-2xl"
      />
      <div className="relative">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <p className="font-serif text-lg font-medium text-foreground">{title}</p>
        <p className="mx-auto mt-1.5 max-w-[36ch] text-sm text-muted-foreground">{body}</p>
        {action && (
          <Link
            href={action.href}
            className={cn(buttonVariants({ variant: "default" }), "mt-6 rounded-full px-6")}
          >
            {action.label}
          </Link>
        )}
      </div>
    </AccountCard>
  );
}

/** Matches the inline error banner used across the admin portal (e.g. the dashboard). */
export function AccountError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="font-medium underline underline-offset-2 flex-shrink-0"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function AccountLoading({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-5 animate-pulse">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 bg-muted rounded" />
              <div className="h-2.5 w-1/4 bg-muted rounded" />
            </div>
            <div className="h-5 w-16 bg-muted rounded-full flex-shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AccountSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Thin wrappers over the shared Button so every account page already using them picks up the
 * real admin button styling (and any future change to it) without touching each call site. */
export function PrimaryButton({
  children,
  onClick,
  href,
  disabled,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  if (href) {
    return (
      <Button asChild className={cn("rounded-full", className)}>
        <Link href={href}>{children}</Link>
      </Button>
    );
  }
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn("rounded-full", className)}
    >
      {children}
    </Button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  href,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  className?: string;
}) {
  if (href) {
    return (
      <Button variant="outline" asChild className={cn("rounded-full", className)}>
        <Link href={href}>{children}</Link>
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("rounded-full", className)}
    >
      {children}
    </Button>
  );
}

/** The Appointments page's upcoming/past toggle — the same Radix Tabs primitive admin uses
 * elsewhere, just driven as a controlled value/onChange pair. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <UITabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList>
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </UITabs>
  );
}
