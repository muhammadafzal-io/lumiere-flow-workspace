"use client";

import { CheckCheck, Hourglass, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/current-user-context";
import type { RequiredFormStatus } from "@/types";

export function formatFormDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One required form on a booking, with its status and the staff actions the viewer is allowed
 * to take — viewing answers needs forms:View, filling in or marking complete needs forms:Update. */
export function RequiredFormRow({
  form,
  subtitle,
  marking,
  onViewResponse,
  onMarkComplete,
  onFillOnBehalf,
}: {
  form: RequiredFormStatus;
  /** Secondary line under the form name, e.g. the appointment it belongs to. */
  subtitle?: string;
  marking: boolean;
  onViewResponse: (formId: string) => void;
  onMarkComplete: (formId: string) => void;
  onFillOnBehalf: (formId: string) => void;
}) {
  const { can, timezone } = useCurrentUser();
  const canView = can("forms", "View");
  const canUpdate = can("forms", "Update");
  const tz = timezone ?? undefined;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium break-words">{form.formName}</div>
          {subtitle && <div className="text-muted-foreground text-xs mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {form.status === "COMPLETED" && (
            <span className="text-xs text-success flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5" /> Completed
            </span>
          )}
          {form.status === "SUBMITTED" && (
            <span className="text-xs text-info flex items-center gap-1">
              <Inbox className="h-3.5 w-3.5" /> Submitted
            </span>
          )}
          {form.status === "PENDING" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Hourglass className="h-3.5 w-3.5" /> Pending
            </span>
          )}
          {form.status === "PENDING" && canUpdate && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onFillOnBehalf(form.id)}
            >
              Fill on Behalf
            </Button>
          )}
          {form.status !== "PENDING" && canView && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onViewResponse(form.id)}
            >
              View Response
            </Button>
          )}
          {form.status === "SUBMITTED" && canUpdate && (
            <Button
              size="sm"
              className="h-6 px-2 text-[11px]"
              disabled={marking}
              onClick={() => onMarkComplete(form.id)}
            >
              {marking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : "Mark Complete"}
            </Button>
          )}
        </div>
      </div>
      <div className="text-muted-foreground text-xs mt-1">
        {form.sentAt && <>Sent {formatFormDateTime(form.sentAt, tz)}</>}
        {form.submittedAt && <> · Submitted {formatFormDateTime(form.submittedAt, tz)}</>}
        {form.completedAt && <> · Completed {formatFormDateTime(form.completedAt, tz)}</>}
      </div>
    </div>
  );
}
