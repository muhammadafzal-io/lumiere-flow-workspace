"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCheck, Loader2, RefreshCw, Stamp, X } from "lucide-react";
import { AccessGate } from "@/components/rbac/AccessGate";
import { SignaturePad } from "@/components/booking/SignaturePad";
import { useCurrentUser } from "@/lib/current-user-context";
import type { ApprovalStatus } from "@/lib/booking/approvals";

interface ApprovalItem {
  id: string;
  eventId: string;
  serviceName: string;
  status: ApprovalStatus;
  decidedByName: string | null;
  decidedAt: string | null;
  reason: string | null;
  signature: string | null;
  createdAt: string;
  onCalendar: boolean;
  clientName: string | null;
  treatment: string | null;
  appointmentStart: string | null;
  practitionerName: string | null;
  room: string | null;
  notes: string | null;
}

const FILTERS = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ALL", label: "All" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const STATUS_PILL: Record<ApprovalStatus, string> = {
  PENDING: "bg-warning/15 text-warning-foreground border-warning/30",
  APPROVED: "bg-success/10 text-success border-success/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
  CANCELLED: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Pending sign-off",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Booking cancelled",
};

function StatusPill({ status }: { status: ApprovalStatus }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border whitespace-nowrap ${STATUS_PILL[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ApprovalsPage() {
  const { can } = useCurrentUser();
  const canDecide = can("booking_approvals", "Update");

  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("PENDING");
  const [reviewing, setReviewing] = useState<ApprovalItem | null>(null);
  const [reason, setReason] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(null);
    setLoadError(null);
    try {
      const res = await fetch("/api/booking-approvals");
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to load approvals");
      setItems(data.items ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "ALL" ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );

  const pendingCount = items.filter((i) => i.status === "PENDING").length;

  const decide = async (action: "approve" | "reject") => {
    if (!reviewing) return;
    if (action === "reject" && !reason.trim()) {
      toast.error("Add a reason so the team knows why.");
      return;
    }
    if (action === "approve" && !signature) {
      toast.error("Sign in the box to approve.");
      return;
    }
    setDeciding(action);
    try {
      const res = await fetch(`/api/booking-approvals/${reviewing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason.trim() || undefined,
          signature: action === "approve" ? signature : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not record that decision");
      toast.success(action === "approve" ? "Booking approved" : "Booking rejected");
      setReviewing(null);
      setReason("");
      setSignature(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record that decision");
      // Someone else may have decided first — reload so the queue shows what actually happened.
      void load();
    } finally {
      setDeciding(null);
    }
  };

  if (accessDenied) return <AccessGate status={accessDenied} />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Stamp className="h-5 w-5" /> Approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bookings for services that need the head practitioner&apos;s sign-off.
            {pendingCount > 0 && ` ${pendingCount} waiting.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.key === "PENDING" && pendingCount > 0 && ` (${pendingCount})`}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <div className="rounded-md border px-4 py-10 text-center text-sm text-muted-foreground">
          {loadError}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border px-4 py-10 text-center text-sm text-muted-foreground">
          {filter === "PENDING"
            ? "Nothing is waiting for sign-off."
            : "No bookings in this list yet."}
        </div>
      ) : (
        <div className="rounded-md border divide-y text-sm">
          {visible.map((item) => (
            <div
              key={item.id}
              className="px-3 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="font-medium break-words">
                  {item.treatment || item.serviceName}
                  {item.clientName ? ` · ${item.clientName}` : ""}
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {fmt(item.appointmentStart)} · {item.practitionerName || "Unassigned"}
                  {item.room ? ` · ${item.room}` : ""}
                </div>
                {item.status !== "PENDING" && item.decidedByName && (
                  <div className="text-muted-foreground text-xs mt-0.5">
                    {STATUS_LABEL[item.status]} by {item.decidedByName} · {fmt(item.decidedAt)}
                    {item.reason ? ` — ${item.reason}` : ""}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                <StatusPill status={item.status} />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setReviewing(item);
                    setReason("");
                    setSignature(null);
                  }}
                >
                  Review
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!reviewing}
        onOpenChange={(o) => {
          if (!o) {
            setReviewing(null);
            setSignature(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{reviewing?.treatment || reviewing?.serviceName}</DialogTitle>
            <DialogDescription>
              {reviewing?.onCalendar
                ? "Review the booking before signing off."
                : "This booking is no longer on the calendar."}
            </DialogDescription>
          </DialogHeader>

          {reviewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <Detail label="Client" value={reviewing.clientName} />
                <Detail label="Service" value={reviewing.treatment || reviewing.serviceName} />
                <Detail label="When" value={fmt(reviewing.appointmentStart)} />
                <Detail label="Practitioner" value={reviewing.practitionerName} />
                <Detail label="Room" value={reviewing.room} />
                <Detail label="Requested" value={fmt(reviewing.createdAt)} />
              </div>
              {reviewing.notes && (
                <div>
                  <div className="text-xs text-muted-foreground">Booking notes</div>
                  <p className="whitespace-pre-wrap break-words mt-0.5">{reviewing.notes}</p>
                </div>
              )}
              {reviewing.status === "PENDING" && canDecide && (
                <div className="rounded-md border p-3">
                  <SignaturePad
                    onChange={setSignature}
                    disabled={!!deciding}
                    label="Sign to approve"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Your signature is stored with this approval as a record of the sign-off.
                  </p>
                </div>
              )}
              {reviewing.status === "PENDING" && canDecide && (
                <div>
                  <Label className="text-xs">Reason (required to reject)</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="mt-1"
                    placeholder="e.g. client needs a consultation first"
                  />
                </div>
              )}
              {reviewing.status !== "PENDING" && (
                <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                  {STATUS_LABEL[reviewing.status]}
                  {reviewing.decidedByName ? ` by ${reviewing.decidedByName}` : ""} ·{" "}
                  {fmt(reviewing.decidedAt)}
                  {reviewing.reason ? ` — ${reviewing.reason}` : ""}
                  {reviewing.signature && (
                    <div className="mt-2">
                      <div className="mb-1">Signed by {reviewing.decidedByName}</div>
                      {/* A stored data URL, not a served asset — next/image cannot optimise it. */}
                      <img
                        src={reviewing.signature}
                        alt={`Signature of ${reviewing.decidedByName ?? "approver"}`}
                        className="h-20 rounded border bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewing(null)} disabled={!!deciding}>
              Close
            </Button>
            {reviewing?.status === "PENDING" && canDecide && (
              <>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void decide("reject")}
                  disabled={!!deciding}
                >
                  {deciding === "reject" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Reject
                </Button>
                <Button onClick={() => void decide("approve")} disabled={!!deciding}>
                  {deciding === "approve" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words">{value || "—"}</div>
    </div>
  );
}
