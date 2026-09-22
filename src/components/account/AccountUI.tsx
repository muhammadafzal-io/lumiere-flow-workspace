"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { CustomerAppointmentStatus } from "@/lib/account/visible";
import { CUSTOMER_STATUS_LABELS } from "@/lib/account/visible";

/**
 * The customer-facing vocabulary: one card style, one badge, one empty state, one error state.
 *
 * Styled from the Lumière tokens the chat widget already uses (cream canvas, navy chrome,
 * champagne accent) rather than the admin theme, so the portal reads as the same product a client
 * met in the widget — warmer and less dense than the operational UI.
 */

export function AccountCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-lumiere-ivory bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-serif text-3xl font-medium tracking-[-0.02em] text-lumiere-navy">
        {title}
      </h1>
      {subtitle && <p className="text-sm text-lumiere-muted mt-1">{subtitle}</p>}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-lumiere-muted mb-2">
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<CustomerAppointmentStatus, string> = {
  upcoming: "bg-success/10 text-success border-success/20",
  today: "bg-lumiere-blush text-lumiere-navy border-lumiere-rose/40",
  past: "bg-lumiere-ivory text-lumiere-muted border-lumiere-ivory",
  awaiting_details: "bg-warning/15 text-warning-foreground border-warning/30",
  awaiting_approval: "bg-warning/15 text-warning-foreground border-warning/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export function StatusBadge({ status }: { status: CustomerAppointmentStatus }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {CUSTOMER_STATUS_LABELS[status]}
    </span>
  );
}

export function AccountEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <AccountCard className="px-6 py-10 text-center">
      <p className="font-medium text-lumiere-navy">{title}</p>
      <p className="text-sm text-lumiere-muted mt-1">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-5 inline-flex rounded-full bg-lumiere-navy px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-lumiere-navy-light"
        >
          {action.label}
        </Link>
      )}
    </AccountCard>
  );
}

export function AccountError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <AccountCard className="px-6 py-8 text-center">
      <p className="text-sm text-lumiere-navy">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-sm font-medium text-lumiere-navy underline underline-offset-4"
        >
          Try again
        </button>
      )}
    </AccountCard>
  );
}

export function AccountLoading({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-24 rounded-2xl border border-lumiere-ivory bg-white/60 animate-pulse"
        />
      ))}
    </div>
  );
}

export function AccountSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-lumiere-muted" />
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-full bg-lumiere-navy px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-lumiere-navy-light disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
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
  const classes = `inline-flex items-center justify-center rounded-full border border-lumiere-navy/20 bg-transparent px-6 py-3 text-sm font-medium text-lumiere-navy transition-colors hover:border-lumiere-navy/50 disabled:opacity-40 ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}
