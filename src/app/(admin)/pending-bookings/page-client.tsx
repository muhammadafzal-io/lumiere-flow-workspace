"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RefreshCw,
  Clock,
  MoreHorizontal,
  Phone,
  UserCheck,
  CalendarX,
  EyeOff,
} from "lucide-react";
import { AccessGate } from "@/components/rbac/AccessGate";
import { useCurrentUser } from "@/lib/current-user-context";

interface PendingBookingItem {
  token: string;
  eventId: string;
  phone: string;
  clientName: string | null;
  treatment: string | null;
  status: "pending" | "completed" | "expired";
  expiresAt: string;
  createdAt: string;
  deliveryChannel: "email" | "sms" | "chat_reply" | "none" | null;
  remindedAt: string | null;
  deliveryError: string | null;
  appointmentStart: string | null;
  practitionerName: string | null;
  onCalendar: boolean;
}

type PendingAction = { kind: "cancel" | "dismiss"; item: PendingBookingItem };

function fmtTime(raw: string, timeZone: string) {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function displayStatus(item: PendingBookingItem): "pending" | "reminded" | "expired" {
  if (item.status === "expired") return "expired";
  return item.remindedAt ? "reminded" : "pending";
}

function statusClass(status: "pending" | "reminded" | "expired") {
  if (status === "expired") return "bg-destructive/10 text-destructive border-destructive/20";
  if (status === "reminded") return "bg-warning/15 text-warning-foreground border-warning/30";
  return "bg-info/10 text-info border-info/20";
}

/** Only an appointment still on the calendar and not yet started can be completed or cancelled. */
function isUpcoming(item: PendingBookingItem): boolean {
  return (
    item.onCalendar &&
    !!item.appointmentStart &&
    new Date(item.appointmentStart).getTime() > Date.now()
  );
}

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return { message: (data.error as string) || fallback, fieldErrors: data.errors ?? null };
}

export default function PendingBookingsPage() {
  const { timezone, can } = useCurrentUser();
  const tz = timezone ?? "America/Chicago";
  const canUpdate = can("pending_bookings", "Update");
  const canCancel = canUpdate && can("calendar", "Delete");

  const [items, setItems] = useState<PendingBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);

  const [detailsFor, setDetailsFor] = useState<PendingBookingItem | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDenied(null);
    try {
      const res = await fetch("/api/booking-completions");
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending bookings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const patch = (token: string, body: Record<string, unknown>) =>
    fetch(`/api/booking-completions/${encodeURIComponent(token)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const openDetails = (item: PendingBookingItem) => {
    setDetailsFor(item);
    setFullName(item.clientName ?? "");
    setEmail("");
    setBirthday("");
    setFieldErrors({});
  };

  const submitDetails = async () => {
    if (!detailsFor) return;
    setBusy(true);
    setFieldErrors({});
    try {
      const res = await patch(detailsFor.token, {
        action: "complete",
        fullName,
        email,
        birthday,
      });
      if (!res.ok) {
        const { message, fieldErrors: errs } = await readError(res, "Could not save details");
        if (errs) setFieldErrors(errs);
        else toast.error(message);
        return;
      }
      toast.success("Booking completed — confirmation email sent");
      setDetailsFor(null);
      fetchItems();
    } finally {
      setBusy(false);
    }
  };

  const runConfirmed = async () => {
    if (!confirming) return;
    const { kind, item } = confirming;
    setBusy(true);
    try {
      if (kind === "cancel") {
        const res = await fetch("/api/calendar/cancel", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: item.eventId }),
        });
        if (!res.ok) {
          toast.error((await readError(res, "Could not cancel appointment")).message);
          return;
        }
        const closed = await patch(item.token, { action: "mark_cancelled" });
        if (!closed.ok) {
          toast.error((await readError(closed, "Cancelled, but could not update list")).message);
        } else {
          toast.success("Appointment cancelled");
        }
      } else {
        const res = await patch(item.token, { action: "dismiss" });
        if (!res.ok) {
          toast.error((await readError(res, "Could not dismiss")).message);
          return;
        }
        toast.success("Removed from follow-up list");
      }
      setConfirming(null);
      fetchItems();
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = items.filter((i) => displayStatus(i) !== "expired").length;
  const expiredCount = items.filter((i) => displayStatus(i) === "expired").length;

  if (accessDenied) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-[1400px]">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Pending Bookings
        </h1>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Bookings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Voice bookings still waiting on the customer to finish their email/birthday via the
            completion link. Call the client to collect their details and enter them here, cancel
            appointments that won&apos;t go ahead, or dismiss rows that no longer need follow-up.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="border rounded-lg px-3 py-2 bg-card">
          <div className="text-[11px] text-muted-foreground">Awaiting details</div>
          <div className="text-xl font-semibold">{pendingCount}</div>
        </div>
        <div className="border rounded-lg px-3 py-2 bg-card">
          <div className="text-[11px] text-muted-foreground">Expired — needs follow-up</div>
          <div className="text-xl font-semibold text-destructive">{expiredCount}</div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Appointment</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Treatment</th>
                <th className="px-3 py-2 font-medium">Booked</th>
                <th className="px-3 py-2 font-medium">Sent via</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Link expires</th>
                <th className="px-3 py-2 font-medium">Delivery error</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Nothing waiting on a customer right now.
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item) => {
                  const status = displayStatus(item);
                  const upcoming = isUpcoming(item);
                  return (
                    <tr key={item.token} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {!item.onCalendar ? (
                          <span className="text-muted-foreground italic">Not on calendar</span>
                        ) : item.appointmentStart ? (
                          <>
                            {fmtTime(item.appointmentStart, tz)}
                            {!upcoming && (
                              <span className="ml-1.5 text-muted-foreground">(past)</span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[140px] truncate">
                        {item.clientName ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{item.phone}</td>
                      <td className="px-3 py-2 text-xs max-w-[140px] truncate">
                        {item.treatment ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {fmtTime(item.createdAt, tz)}
                      </td>
                      <td className="px-3 py-2 text-xs capitalize">
                        {item.deliveryChannel ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border capitalize ${statusClass(status)}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {fmtTime(item.expiresAt, tz)}
                      </td>
                      <td className="px-3 py-2 text-xs text-destructive max-w-[220px] truncate">
                        {item.deliveryError ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Actions for ${item.clientName ?? item.phone}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <a href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}>
                                <Phone className="h-3.5 w-3.5 mr-2" />
                                Call {item.phone}
                              </a>
                            </DropdownMenuItem>
                            {canUpdate && upcoming && (
                              <DropdownMenuItem onSelect={() => openDetails(item)}>
                                <UserCheck className="h-3.5 w-3.5 mr-2" />
                                Enter client details
                              </DropdownMenuItem>
                            )}
                            {canCancel && upcoming && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setConfirming({ kind: "cancel", item })}
                              >
                                <CalendarX className="h-3.5 w-3.5 mr-2" />
                                Cancel appointment
                              </DropdownMenuItem>
                            )}
                            {canUpdate && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => setConfirming({ kind: "dismiss", item })}
                                >
                                  <EyeOff className="h-3.5 w-3.5 mr-2" />
                                  Dismiss
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!detailsFor} onOpenChange={(open) => !open && !busy && setDetailsFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter client details</DialogTitle>
            <DialogDescription>
              {detailsFor?.treatment ?? "Appointment"}
              {detailsFor?.appointmentStart && ` · ${fmtTime(detailsFor.appointmentStart, tz)}`}
              {` · ${detailsFor?.phone ?? ""}`}. Saving confirms the booking and emails the client
              their confirmation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="pb-name" className="text-xs">
                Full name *
              </Label>
              <Input
                id="pb-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="First Last"
                autoComplete="off"
              />
              {fieldErrors.fullName && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.fullName}</p>
              )}
            </div>
            <div>
              <Label htmlFor="pb-email" className="text-xs">
                Email *
              </Label>
              <Input
                id="pb-email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="off"
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>
              )}
            </div>
            <div>
              <Label htmlFor="pb-birthday" className="text-xs">
                Birthday *
              </Label>
              <Input
                id="pb-birthday"
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
              {fieldErrors.birthday && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.birthday}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsFor(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitDetails} disabled={busy}>
              {busy ? "Saving…" : "Confirm booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirming}
        onOpenChange={(open) => !open && !busy && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.kind === "cancel" ? "Cancel this appointment?" : "Dismiss this booking?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.kind === "cancel"
                ? `${confirming.item.treatment ?? "The appointment"}${
                    confirming.item.appointmentStart
                      ? ` on ${fmtTime(confirming.item.appointmentStart, tz)}`
                      : ""
                  } will be removed from the calendar and the slot offered to the waitlist.`
                : "It will be removed from this list. The appointment itself stays on the calendar unchanged."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                runConfirmed();
              }}
              className={
                confirming?.kind === "cancel"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {busy ? "Working…" : confirming?.kind === "cancel" ? "Cancel appointment" : "Dismiss"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
