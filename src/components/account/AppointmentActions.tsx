"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";
import type { CustomerAppointment } from "@/lib/account/visible";
import { AccountError } from "@/components/account/AccountUI";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Reschedule and cancel, for a client's own upcoming appointment — the same two actions staff have
 * on the calendar, and they run the same code behind the scenes (calendar update, email to the
 * client, slot offered to the waitlist). A past or already-cancelled appointment shows neither.
 */

const CHANGEABLE = new Set<CustomerAppointment["status"]>([
  "upcoming",
  "today",
  "awaiting_details",
  "awaiting_approval",
]);

interface Slot {
  startTime: string;
  endTime: string;
  practitioner: string | null;
}

const toDateInput = (d: Date) => d.toLocaleDateString("en-CA");
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function AppointmentActions({
  appointment,
  onChanged,
}: {
  appointment: CustomerAppointment;
  onChanged?: () => void;
}) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!CHANGEABLE.has(appointment.status)) return null;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 rounded-full sm:h-8"
          onClick={() => setRescheduleOpen(true)}
        >
          <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
          Reschedule
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8"
          onClick={() => setCancelOpen(true)}
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>

      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        appointment={appointment}
        onDone={() => {
          setRescheduleOpen(false);
          onChanged?.();
        }}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        appointment={appointment}
        onDone={() => {
          setCancelOpen(false);
          onChanged?.();
        }}
      />
    </>
  );
}

function RescheduleDialog({
  open,
  onOpenChange,
  appointment,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: CustomerAppointment;
  onDone: () => void;
}) {
  const [date, setDate] = useState(() => toDateInput(new Date(appointment.startTime)));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotStart, setSlotStart] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlotStart("");
    const params = new URLSearchParams({ date, treatment: appointment.treatment });
    if (appointment.practitioner) params.set("practitioner", appointment.practitioner);
    fetch(`/api/account/slots?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => {
        if (cancelled) return;
        const list: Slot[] = json.slots ?? [];
        setSlots(list);
        if (list.length > 0) setSlotStart(list[0].startTime);
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [open, date, appointment.treatment, appointment.practitioner, refresh]);

  const selected = slots.find((s) => s.startTime === slotStart);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/appointments/${encodeURIComponent(appointment.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: selected.startTime, endTime: selected.endTime }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "We couldn't move that appointment.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't move that appointment.");
      setRefresh((n) => n + 1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>
            {appointment.treatment} — currently {fmtWhen(appointment.startTime)}. We&apos;ll email
            you the new time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={date}
                min={toDateInput(new Date())}
                onChange={(e) => setDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">
                Available slot{" "}
                {loadingSlots && <span className="text-xs text-muted-foreground">checking…</span>}
              </Label>
              <Select
                value={slotStart || undefined}
                onValueChange={setSlotStart}
                disabled={loadingSlots || slots.length === 0}
              >
                <SelectTrigger className="h-9">
                  <SelectValue
                    placeholder={
                      loadingSlots
                        ? "Loading slots…"
                        : slots.length === 0
                          ? "No slots available"
                          : "Select a time"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((slot) => (
                    <SelectItem key={slot.startTime} value={slot.startTime}>
                      {fmtTime(slot.startTime)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!loadingSlots && slots.length === 0 && (
            <p className="text-xs text-destructive">No open slots that day — try another date.</p>
          )}
          {error && <AccountError message={error} />}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Keep current time
          </Button>
          <Button
            type="button"
            className="rounded-full"
            onClick={save}
            disabled={saving || !selected}
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  appointment,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: CustomerAppointment;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/appointments/${encodeURIComponent(appointment.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "We couldn't cancel that appointment.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't cancel that appointment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
          <AlertDialogDescription>
            {appointment.treatment} on {fmtWhen(appointment.startTime)}. We&apos;ll email you a
            confirmation, and the time will be offered to others.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <AccountError message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Keep appointment</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(e) => {
              // Stay open until the request finishes, so a failure can show its message.
              e.preventDefault();
              void cancel();
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Cancel appointment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
