"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  X,
  Sparkles,
  MapPin,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  Bell,
  CheckCheck,
  Clock,
  Loader2,
  Lock,
  ClipboardList,
  Hourglass,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import type { Appointment, Practitioner, Customer, AppointmentStatus } from "@/lib/types";
import type { AvailableSlot, RequiredFormStatus } from "@/types";
import {
  birthdayToInputValue,
  isValidBirthdayInput,
  normalizeBirthdayForStorage,
} from "@/lib/birthday";
import { store } from "@/lib/store";
import { splitAppointmentField } from "@/lib/customers/visit-count";
import { formatLastVisit } from "@/lib/customers/last-visit";
import {
  getDisplayTimezone,
  fmtTimeRange,
  fmtTime,
  practitionerById,
  zonedParts,
  zonedDateTimeToUtc,
} from "@/lib/calendar-utils";
import { useCurrentUser } from "@/lib/current-user-context";
import { isAppointmentPast } from "@/lib/appointment-lock";
import { FormResponseDialog } from "@/components/forms/FormResponseDialog";
import { StaffFillFormDialog } from "@/components/forms/StaffFillFormDialog";

function statusPill(s: AppointmentStatus) {
  const map: Record<AppointmentStatus, string> = {
    confirmed: "bg-success/10 text-success border-success/20",
    pending: "bg-warning/15 text-warning-foreground border-warning/30",
    completed: "bg-muted text-muted-foreground border-border",
    cancelled: "bg-destructive/10 text-destructive border-destructive/20",
    no_show: "bg-destructive/10 text-destructive border-destructive/20",
  };
  const label: Record<AppointmentStatus, string> = {
    confirmed: "Confirmed",
    pending: "Pending",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No-show",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${map[s]}`}>
      {label[s]}
    </span>
  );
}

function customerStatusPill(s: string) {
  const map: Record<string, string> = {
    Active: "bg-success/10 text-success border-success/20",
    Dormant: "bg-warning/15 text-warning-foreground border-warning/30",
    VIP: "bg-primary/10 text-primary border-primary/20",
    New: "bg-info/10 text-info border-info/20",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${map[s]}`}>
      {s}
    </span>
  );
}

// ----------------- Slide-over -----------------

export function AppointmentSlideOver({
  appointment,
  customer,
  practitioners,
  onClose,
  onReschedule,
  onCancel,
  onCompleted,
}: {
  appointment: Appointment | null;
  customer: Customer | null;
  practitioners: Practitioner[];
  onClose: () => void;
  onReschedule: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
  onCompleted?: () => void;
}) {
  const open = !!appointment;
  const [completing, setCompleting] = useState(false);
  const [forms, setForms] = useState<RequiredFormStatus[]>([]);
  const [viewingResponseId, setViewingResponseId] = useState<string | null>(null);
  const [markingFormId, setMarkingFormId] = useState<string | null>(null);
  const [fillingFormId, setFillingFormId] = useState<string | null>(null);
  useEffect(() => {
    setForms(appointment?.requiredForms ?? []);
  }, [appointment?.id, appointment?.requiredForms]);
  if (!appointment)
    return (
      <Sheet open={false} onOpenChange={onClose}>
        <SheetContent />
      </Sheet>
    );
  const a = appointment;
  const start = new Date(a.start_time);
  const end = new Date(a.end_time);
  const prac = practitionerById(practitioners, a.practitioner_id);
  const isPast = isAppointmentPast(a.end_time);

  const markFormComplete = async (formId: string) => {
    setMarkingFormId(formId);
    try {
      const res = await fetch(`/api/required-forms/${formId}/complete`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      setForms((prev) =>
        prev.map((f) =>
          f.id === formId
            ? { ...f, status: "COMPLETED", completedAt: new Date().toISOString() }
            : f,
        ),
      );
      toast.success("Form marked as completed");
    } catch {
      toast.error("Failed to update form status");
    } finally {
      setMarkingFormId(null);
    }
  };

  const handleFilledOnBehalf = (formId: string, submittedAt: string) => {
    setForms((prev) =>
      prev.map((f) => (f.id === formId ? { ...f, status: "SUBMITTED", submittedAt } : f)),
    );
    toast.success("Form submitted on the client's behalf");
  };

  const markComplete = async () => {
    if (!customer) {
      toast.error("Can't mark complete — this appointment isn't linked to a client record");
      return;
    }
    const dateStr = start.toISOString().slice(0, 10);
    const entry = `${dateStr} ${a.treatment}`;

    // The calendar has no persisted "completed" status (Google Calendar doesn't track one), so
    // this button never disappears after use — reopening the same appointment, even in the same
    // session, still offers it. Guard against re-clicking re-appending the same visit.
    const alreadyRecorded = splitAppointmentField(customer.appointments).some(
      (seg) => seg.trim() === entry,
    );
    if (alreadyRecorded) {
      toast.success("Already marked complete — no duplicate added");
      onClose();
      return;
    }

    const appointments = customer.appointments ? `${customer.appointments}; ${entry}` : entry;

    setCompleting(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: customer.id, appointments }),
      });
      if (!res.ok) throw new Error();
      toast.success("Appointment marked complete — added to client's visit history");
      onCompleted?.();
      onClose();
    } catch {
      toast.error("Failed to mark complete");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg leading-tight">
                  {customer?.name || a.clientName || "Client"}
                </SheetTitle>
                <div className="mt-2 flex items-center gap-2">
                  {statusPill(a.status)}
                  {a.source === "ai_booked" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border bg-primary/10 text-primary border-primary/20">
                      <Sparkles className="h-3 w-3" /> AI booked
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </SheetHeader>

          <div className="px-6 py-5 space-y-6">
            {isPast && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                This appointment is in the past — scheduling details are locked.
              </div>
            )}

            {/* Appointment details */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
                Appointment
              </h3>
              <div className="rounded-lg border bg-card divide-y">
                <Row
                  icon={<CalendarIcon className="h-3.5 w-3.5" />}
                  label="Date"
                  value={start.toLocaleDateString("en-US", {
                    timeZone: getDisplayTimezone(),
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                />
                <Row
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Time"
                  value={`${fmtTimeRange(start, end)} · ${a.duration_minutes} min`}
                />
                <Row label="Treatment" value={a.treatment} />
                <Row label="Practitioner" value={prac?.name || "Unassigned"} swatch={prac?.color} />
                <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Room" value={a.room} />
                <Row label="Price" value={`$${a.price.toLocaleString()}`} />
                <Row
                  label="Source"
                  value={
                    a.source === "ai_booked"
                      ? `Booked by AI on ${new Date(a.created_at).toLocaleDateString("en-US", { timeZone: getDisplayTimezone(), month: "short", day: "numeric" })}, ${fmtTime(new Date(a.created_at))}`
                      : `Manually booked${a.created_by ? ` by ${a.created_by}` : ""} on ${new Date(a.created_at).toLocaleDateString("en-US", { timeZone: getDisplayTimezone(), month: "short", day: "numeric" })}`
                  }
                />
              </div>
            </section>

            {/* Client snapshot */}
            {customer ? (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
                  Client
                </h3>
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {customer.name
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-sm truncate">{customer.name}</div>
                        {customerStatusPill(customer.status)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3" />
                          {customer.email}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-muted/40 px-2.5 py-2">
                      <div className="text-muted-foreground">Total visits</div>
                      <div className="font-semibold mt-0.5">{customer.total_visits}</div>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2.5 py-2">
                      <div className="text-muted-foreground">Last visit</div>
                      <div className="font-semibold mt-0.5">
                        {formatLastVisit(
                          customer.last_visit,
                          {
                            timeZone: getDisplayTimezone(),
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                          "en-US",
                        )}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="block mt-3 text-xs text-primary hover:underline"
                  >
                    View full profile →
                  </Link>
                </div>
              </section>
            ) : a.clientName ? (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
                  Client
                </h3>
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {a.clientName
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{a.clientName}</div>
                      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          {a.clientContact && !a.clientContact.includes("@")
                            ? a.clientContact
                            : "—"}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3" />
                          {a.clientContact && a.clientContact.includes("@") ? a.clientContact : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-muted/40 px-2.5 py-2">
                      <div className="text-muted-foreground">Total visits</div>
                      <div className="font-semibold mt-0.5">—</div>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2.5 py-2">
                      <div className="text-muted-foreground">Last visit</div>
                      <div className="font-semibold mt-0.5">—</div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {/* AI transcript */}
            {a.source === "ai_booked" && a.ai_transcript && a.ai_transcript.length > 0 && (
              <section>
                <Collapsible defaultOpen>
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary" /> AI booking transcript
                    </h3>
                    <CollapsibleTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <div className="rounded-lg border bg-card p-3 space-y-2">
                      {a.ai_transcript.map((m, i) => (
                        <div
                          key={i}
                          className={`flex ${m.from === "ai" ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                              m.from === "ai"
                                ? "bg-primary/10 text-foreground border border-primary/15"
                                : "bg-muted text-foreground"
                            }`}
                          >
                            <div
                              className={`text-[10px] font-semibold mb-0.5 uppercase tracking-wider ${m.from === "ai" ? "text-primary" : "text-muted-foreground"}`}
                            >
                              {m.from === "ai"
                                ? "AI Agent"
                                : customer?.name.split(" ")[0] || "Client"}
                            </div>
                            <div>{m.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            )}

            {/* Reminders */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5 flex items-center gap-1.5">
                <Bell className="h-3 w-3" /> Reminders
              </h3>
              <div className="rounded-lg border bg-card divide-y">
                <ReminderRow
                  label="3-day reminder"
                  sent={a.reminder_status.t_3day}
                  when={new Date(start.getTime() - 3 * 86400000)}
                />
                <ReminderRow
                  label="1-day reminder"
                  sent={a.reminder_status.t_1day}
                  when={new Date(start.getTime() - 86400000)}
                />
                <ReminderRow
                  label="2-hour reminder"
                  sent={a.reminder_status.t_2hour}
                  when={new Date(start.getTime() - 2 * 3600000)}
                />
              </div>
            </section>

            {/* Required Forms */}
            {forms.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5 flex items-center gap-1.5">
                  <ClipboardList className="h-3 w-3" /> Required Forms
                </h3>
                <div className="rounded-lg border bg-card divide-y">
                  {forms.map((f) => (
                    <RequiredFormRow
                      key={f.id}
                      form={f}
                      marking={markingFormId === f.id}
                      onViewResponse={setViewingResponseId}
                      onMarkComplete={markFormComplete}
                      onFillOnBehalf={setFillingFormId}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Notes */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
                Notes
              </h3>
              <Textarea
                defaultValue={a.notes}
                placeholder="Add a note about this appointment…"
                className="min-h-[80px]"
                readOnly={isPast}
                onBlur={(e) => {
                  if (!isPast && e.target.value !== a.notes) {
                    store.upsertAppointment({ ...a, notes: e.target.value });
                  }
                }}
              />
              {isPast && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Notes are locked once an appointment is in the past.
                </p>
              )}
            </section>
          </div>

          <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t px-6 py-3 flex items-center justify-end gap-2">
            {!isPast && a.status !== "completed" && a.status !== "cancelled" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCancel(a)}
                  className="text-destructive hover:text-destructive"
                >
                  Cancel appointment
                </Button>
              </>
            )}
            {isPast && a.status !== "completed" && a.status !== "cancelled" && (
              <Button size="sm" onClick={markComplete} disabled={completing}>
                {completing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                )}
                Mark complete
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <FormResponseDialog
        trackingId={viewingResponseId}
        onClose={() => setViewingResponseId(null)}
      />
      <StaffFillFormDialog
        trackingId={fillingFormId}
        onClose={() => setFillingFormId(null)}
        onSubmitted={handleFilledOnBehalf}
      />
    </>
  );
}

function Row({
  icon,
  label,
  value,
  swatch,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  swatch?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="text-muted-foreground text-xs w-28 flex items-center gap-1.5 flex-shrink-0">
        {icon}
        {label}
      </div>
      <div className="text-sm flex-1 flex items-center gap-2">
        {swatch && (
          <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: swatch }} />
        )}
        {value}
      </div>
    </div>
  );
}
function ReminderRow({ label, sent, when }: { label: string; sent: boolean; when: Date }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <div className="flex-1">{label}</div>
      <div className="text-xs text-muted-foreground">
        {when.toLocaleString("en-US", {
          timeZone: getDisplayTimezone(),
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
      {sent ? (
        <span className="text-xs text-success flex items-center gap-1">
          <CheckCheck className="h-3.5 w-3.5" /> Sent
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Scheduled</span>
      )}
    </div>
  );
}

function fmtShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: getDisplayTimezone(),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function RequiredFormRow({
  form,
  marking,
  onViewResponse,
  onMarkComplete,
  onFillOnBehalf,
}: {
  form: RequiredFormStatus;
  marking: boolean;
  onViewResponse: (formId: string) => void;
  onMarkComplete: (formId: string) => void;
  onFillOnBehalf: (formId: string) => void;
}) {
  return (
    <div className="px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate">{form.formName}</div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
          {form.status === "PENDING" && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onFillOnBehalf(form.id)}
            >
              Fill on Behalf
            </Button>
          )}
          {form.status !== "PENDING" && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onViewResponse(form.id)}
            >
              View Response
            </Button>
          )}
          {form.status === "SUBMITTED" && (
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
      <div className="text-xs text-muted-foreground mt-0.5">
        {form.sentAt && <>Sent {fmtShortDateTime(form.sentAt)}</>}
        {form.submittedAt && <> · Submitted {fmtShortDateTime(form.submittedAt)}</>}
        {form.completedAt && <> · Completed {fmtShortDateTime(form.completedAt)}</>}
      </div>
    </div>
  );
}

// ----------------- Reschedule modal -----------------

export function RescheduleModal({
  appointment,
  customer,
  newStart,
  onClose,
  onConfirmed,
}: {
  appointment: Appointment | null;
  customer: Customer | null;
  newStart: Date | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const open = !!appointment && !!newStart;
  const a = appointment;
  const initialNs = newStart;
  const first = customer?.name.split(" ")[0] || a?.clientName?.split(" ")[0] || "there";

  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState("");
  const [showMsg, setShowMsg] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [step, setStep] = useState<"review" | "confirm">("review");

  // Initialize date/time when modal opens
  useEffect(() => {
    if (initialNs) {
      // Get clinic-local timezone date components
      const parts = zonedParts(initialNs);

      // Format as YYYY-MM-DD for HTML date input
      const dateStr = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
      const timeStr = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;

      setEditDate(dateStr);
      setEditTime(timeStr);
    }
  }, [initialNs]);

  // Build the actual new start time from date/time inputs, anchored to the clinic's timezone
  // (not the admin's browser timezone).
  const ns = useMemo(
    () => (editDate && editTime ? zonedDateTimeToUtc(editDate, editTime) : initialNs),
    [editDate, editTime, initialNs],
  );

  // Validation: Check if time is valid
  const getTimeError = (): string | null => {
    if (!ns) return null;

    const dayOfWeek = ns.getDay();
    const hours = ns.getHours();

    // Check for Sunday (dayOfWeek === 0)
    if (dayOfWeek === 0) {
      return "Cannot reschedule on Sundays — clinic is closed";
    }

    // Check for before 9 AM or after 7 PM (19:00)
    if (hours < 9) {
      return "Cannot reschedule before 9:00 AM";
    }
    if (hours >= 19) {
      return "Cannot reschedule after 7:00 PM";
    }

    return null;
  };

  const timeError = getTimeError();
  const isValidTime = !timeError;

  const defaultMsg =
    a && ns
      ? `Hi ${first} — Sofia here from Lumière. We've moved your ${a.treatment} to ${ns.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} at ${fmtTime(ns)}. The new confirmation link is below. Let me know if this doesn't work for you.`
      : "";

  // Reset message when appointment changes
  useEffect(() => {
    if (a && ns && msg === "" && step === "review") setMsg(defaultMsg);
  }, [a, ns, step, msg, defaultMsg]);

  const confirm = async () => {
    if (step === "review") {
      // Move to confirmation step
      setStep("confirm");
      return;
    }

    if (!a || !ns) {
      console.error("[Reschedule] Missing appointment or new time");
      toast.error("Missing appointment or new time");
      return;
    }

    if (!a.id) {
      console.error("[Reschedule] Appointment ID missing");
      toast.error("Cannot reschedule: appointment ID missing");
      return;
    }

    // Defense-in-depth only — every real entry point that opens this modal already hides itself
    // for past appointments, and the server rejects this same request with a 409 regardless.
    if (isAppointmentPast(a.end_time)) {
      toast.error("This appointment is in the past and can no longer be rescheduled.");
      return;
    }

    if (!customer && !a.clientName) {
      console.error("[Reschedule] Missing both customer and clientName");
      toast.error("Cannot identify customer");
      return;
    }

    setRescheduling(true);
    try {
      const newEnd = new Date(ns.getTime() + a.duration_minutes * 60000);

      // Update Google Calendar
      const res = await fetch("/api/calendar/reschedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: a.id,
          newStartTime: ns.toISOString(),
          newEndTime: newEnd.toISOString(),
        }),
      });

      if (!res.ok) {
        let errorMsg = "Failed to reschedule appointment";
        const errorData = await res.json().catch(() => null);
        if (errorData?.error) errorMsg = errorData.error;
        throw new Error(errorMsg);
      }

      await res.json();

      // Update local store
      store.upsertAppointment({
        ...a,
        start_time: ns.toISOString(),
        end_time: newEnd.toISOString(),
      });

      // Send notification
      if (notify && customer?.id) {
        store.addActivity({
          id: `a_resch_${Date.now()}`,
          timestamp: new Date().toISOString(),
          customer_id: customer.id,
          rule_id: "manual",
          channel: "WhatsApp",
          message_body: msg,
          status: "Sent",
          kind: "reschedule_notification",
        });
      }

      toast.success(
        `Appointment rescheduled. ${notify && customer ? `Notification sent to ${customer.name}.` : ""}`,
      );
      onConfirmed();
      setMsg("");
      setStep("review");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to reschedule appointment";
      console.error("[Reschedule] Error:", errorMsg, err);
      toast.error(errorMsg);
    } finally {
      setRescheduling(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setMsg("");
          setStep("review");
          setEditDate("");
          setEditTime("");
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "review" ? "Reschedule appointment?" : "Confirm reschedule?"}
          </DialogTitle>
        </DialogHeader>
        {a && ns && (customer || a.clientName) && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
                <div className="text-xs text-muted-foreground">Original</div>
                <div className="text-foreground">
                  <span className="font-medium">{customer?.name || a.clientName}</span> —{" "}
                  {a.treatment} —{" "}
                  {new Date(a.start_time).toLocaleDateString("en-US", {
                    timeZone: getDisplayTimezone(),
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  , {fmtTime(new Date(a.start_time))}
                </div>
              </div>
            </div>

            {step === "review" ? (
              <>
                <div className="space-y-3">
                  <Label className="text-sm font-medium">New appointment time</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="resch-date" className="text-xs text-muted-foreground">
                        Date
                      </Label>
                      <Input
                        id="resch-date"
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        disabled={rescheduling}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="resch-time" className="text-xs text-muted-foreground">
                        Time
                      </Label>
                      <Input
                        id="resch-time"
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        disabled={rescheduling}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  {timeError ? (
                    <div className="text-xs text-red-700 bg-red-50/50 border border-red-200/50 p-2 rounded flex items-start gap-2">
                      <span className="mt-0.5">⚠️</span>
                      <span>{timeError}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground bg-blue-50/50 border border-blue-200/50 p-2 rounded">
                      Will be: {customer?.name || a.clientName} — {a.treatment} —{" "}
                      {ns.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      , {fmtTime(ns)}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Label htmlFor="notify-resch" className="text-sm cursor-pointer">
                    Send automated reschedule notification via WhatsApp
                  </Label>
                  <Switch
                    id="notify-resch"
                    checked={notify}
                    onCheckedChange={setNotify}
                    disabled={rescheduling}
                  />
                </div>

                {notify && (
                  <Collapsible open={showMsg} onOpenChange={setShowMsg}>
                    <CollapsibleTrigger className="text-xs text-primary hover:underline flex items-center gap-1">
                      {showMsg ? "Hide" : "Show"} message preview{" "}
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${showMsg ? "rotate-180" : ""}`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <Textarea
                        value={msg}
                        onChange={(e) => setMsg(e.target.value)}
                        className="text-sm min-h-[100px]"
                        disabled={rescheduling}
                      />
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </>
            ) : (
              <div className="space-y-3 py-2">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground mb-2">New time:</div>
                  <div className="text-primary font-medium">
                    {customer?.name || a.clientName} — {a.treatment} —{" "}
                    {ns.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    , {fmtTime(ns)}
                  </div>
                </div>
                <div className="rounded-lg border border-amber-200/50 bg-amber-50/50 p-3">
                  <p className="text-sm font-medium text-amber-900 mb-2">
                    ⚠️ Reschedule will update the calendar
                  </p>
                  <p className="text-xs text-amber-800">
                    The appointment will be moved to the new date and time. The client will be
                    notified
                    {notify ? ` with the message: "${msg}"` : ""}.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (step === "confirm") {
                setStep("review");
              } else {
                onClose();
                setMsg("");
                setStep("review");
              }
            }}
            disabled={rescheduling}
          >
            {step === "confirm" ? "Back" : "Keep original time"}
          </Button>
          <Button
            variant={step === "review" ? "outline" : "default"}
            onClick={confirm}
            disabled={rescheduling || (step === "review" && !isValidTime)}
          >
            {rescheduling && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {step === "review" ? "Review changes" : "Confirm reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- Cancel modal -----------------

const CANCEL_MSG: Record<string, (first: string, treatment: string) => string> = {
  "Client requested": (f) =>
    `Hi ${f} — confirming we've cancelled your appointment. Thank you for letting us know — we'll be here whenever you're ready to rebook.`,
  "Clinic conflict": (f, t) =>
    `Hi ${f} — so sorry, we've had to cancel your ${t} due to a clinic conflict. We'd love to offer you a priority slot to rebook — tap here to choose a new time.`,
  "Practitioner unavailable": (f, t) =>
    `Hi ${f} — your ${t} has been cancelled because your practitioner is no longer available. We can rebook you with another team member or with the same practitioner next week. Reply with your preference.`,
  "No-show": (f) => `Hi ${f} — we missed you today. No worries — tap here to rebook in one tap.`,
  Other: (f) =>
    `Hi ${f} — your appointment has been cancelled. Reach out any time to schedule a new visit.`,
};

export function CancelModal({
  appointment,
  customer,
  onClose,
  onConfirmed,
}: {
  appointment: Appointment | null;
  customer: Customer | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const open = !!appointment;
  const [reason, setReason] = useState<string>("Client requested");
  const [notify, setNotify] = useState(true);
  const first = customer?.name.split(" ")[0] || "there";
  const t = appointment?.treatment || "appointment";
  const [msg, setMsg] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [step, setStep] = useState<"reason" | "confirm">("reason");

  // reset on open
  if (appointment && msg === "" && step === "reason") {
    setMsg(CANCEL_MSG[reason](first, t));
  }

  const setReasonAndMsg = (r: string) => {
    setReason(r);
    setMsg(CANCEL_MSG[r](first, t));
  };

  const confirm = async () => {
    if (step === "reason") {
      // Move to confirmation step
      setStep("confirm");
      return;
    }

    if (!appointment) {
      console.error("[Cancel] Missing appointment data");
      toast.error("Missing appointment data");
      return;
    }

    if (!appointment.id) {
      console.error("[Cancel] Appointment ID missing");
      toast.error("Cannot cancel: appointment ID missing");
      return;
    }

    // Defense-in-depth only — every real entry point that opens this modal already hides itself
    // for past appointments, and the server rejects this same request with a 409 regardless.
    if (isAppointmentPast(appointment.end_time)) {
      toast.error("This appointment is in the past and can no longer be cancelled.");
      return;
    }

    // Customer data is optional for cancellation - we can work with just clientName
    if (!customer && !appointment.clientName) {
      console.error("[Cancel] Missing both customer and clientName");
      toast.error("Cannot identify customer");
      return;
    }

    setCancelling(true);
    try {
      // Delete from Google Calendar
      const res = await fetch("/api/calendar/cancel", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: appointment.id }),
      });

      if (!res.ok) {
        let errorMsg = "Failed to cancel appointment";
        const errorData = await res.json().catch(() => null);
        if (errorData?.error) errorMsg = errorData.error;
        throw new Error(errorMsg);
      }

      await res.json();

      // Update local store
      store.upsertAppointment({
        ...appointment,
        status: "cancelled",
        notes: appointment.notes
          ? `${appointment.notes}\nCancelled: ${reason}`
          : `Cancelled: ${reason}`,
      });

      // Send cancellation notification
      if (notify && customer?.id) {
        store.addActivity({
          id: `a_cancel_${Date.now()}`,
          timestamp: new Date().toISOString(),
          customer_id: customer!.id,
          rule_id: "manual",
          channel: "WhatsApp",
          message_body: msg,
          status: "Sent",
          kind: "cancellation_notification",
        });
      }

      toast.success(`Appointment cancelled. ${notify ? "Message sent to client." : ""}`);
      onConfirmed();
      setMsg("");
      setStep("reason");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to cancel appointment";
      console.error("[Cancel] Error:", errorMsg, err);
      toast.error(errorMsg);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setMsg("");
          setStep("reason");
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "reason" ? "Cancel this appointment?" : "Confirm cancellation?"}
          </DialogTitle>
        </DialogHeader>
        {appointment && customer && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="font-medium">
                {customer.name} — {appointment.treatment}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {new Date(appointment.start_time).toLocaleDateString("en-US", {
                  timeZone: getDisplayTimezone(),
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
                , {fmtTime(new Date(appointment.start_time))}
              </div>
            </div>

            {step === "reason" ? (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Reason for cancellation
                  </Label>
                  <Select value={reason} onValueChange={setReasonAndMsg} disabled={cancelling}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(CANCEL_MSG).map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="notify-cancel" className="text-sm cursor-pointer">
                    Send automated cancellation message
                  </Label>
                  <Switch
                    id="notify-cancel"
                    checked={notify}
                    onCheckedChange={setNotify}
                    disabled={cancelling}
                  />
                </div>

                {notify && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Message preview
                    </Label>
                    <Textarea
                      value={msg}
                      onChange={(e) => setMsg(e.target.value)}
                      className="text-sm min-h-[100px]"
                      disabled={cancelling}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3 py-2">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive mb-2">
                    ⚠️ This action cannot be undone
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Once cancelled, this appointment will be removed from the calendar. The client
                    will be notified
                    {notify ? ` with the message: "${msg}"` : ""}.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (step === "confirm") {
                setStep("reason");
              } else {
                onClose();
                setMsg("");
                setStep("reason");
              }
            }}
            disabled={cancelling}
          >
            {step === "confirm" ? "Back" : "Keep appointment"}
          </Button>
          <Button
            variant={step === "reason" ? "outline" : "destructive"}
            onClick={confirm}
            disabled={cancelling}
          >
            {cancelling && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {step === "reason" ? "Next" : "Cancel appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- New appointment modal -----------------

interface ServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
  status: string;
}

const DEFAULT_TREATMENT_DURATION = 60;

export function NewAppointmentModal({
  open,
  onClose,
  onBooked,
  customers,
  practitioners,
  defaultStart,
}: {
  open: boolean;
  onClose: () => void;
  onBooked?: () => void;
  customers: Customer[];
  practitioners: Practitioner[];
  defaultStart: Date | null;
}) {
  const { can } = useCurrentUser();
  const canCreateCustomer = can("customers", "Create");
  const [customerId, setCustomerId] = useState<string>("");
  const [treatment, setTreatment] = useState<string>("");
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [date, setDate] = useState<string>(() => {
    const p = zonedParts(defaultStart || new Date());
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  });
  const [practitionerId, setPractitionerId] = useState<string>(practitioners[0]?.id || "");
  const [room, setRoom] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [modalPractitioners, setModalPractitioners] = useState<Practitioner[]>([]);
  const [clinicRooms, setClinicRooms] = useState<string[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const cust = customers.find((c) => c.id === customerId);

  // Load practitioners, rooms & services when modal opens (dashboard loads these async)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingMeta(true);
    Promise.all([
      fetch("/api/settings").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/services").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([data, servicesData]) => {
        if (cancelled) return;
        if (data) {
          if (Array.isArray(data.rooms) && data.rooms.length > 0) {
            setClinicRooms(data.rooms);
          }
          if (Array.isArray(data.team)) {
            setModalPractitioners(
              data.team
                .filter((p: { status?: string }) => p.status !== "Inactive")
                .map(
                  (p: {
                    id: string;
                    name: string;
                    role?: string;
                    color?: string;
                    qualifications?: string[];
                  }): Practitioner => ({
                    id: p.id,
                    name: p.name,
                    role: p.role ?? "",
                    color: p.color ?? "#6366f1",
                    avatar_initial: p.name?.charAt(0)?.toUpperCase() ?? "?",
                    qualifications: p.qualifications ?? [],
                  }),
                ),
            );
          }
        }
        if (Array.isArray(servicesData?.services)) {
          setServices(
            servicesData.services.map(
              (s: {
                id: string;
                name: string;
                durationMinutes?: number;
                status?: string;
              }): ServiceOption => ({
                id: s.id,
                name: s.name,
                durationMinutes: s.durationMinutes ?? DEFAULT_TREATMENT_DURATION,
                status: s.status ?? "Active",
              }),
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const practitionerList = useMemo(() => {
    if (modalPractitioners.length > 0) return modalPractitioners;
    return practitioners;
  }, [practitioners, modalPractitioners]);

  useEffect(() => {
    if (!open || practitionerList.length === 0) return;
    setPractitionerId((prev) =>
      prev && practitionerList.some((p) => p.id === prev) ? prev : practitionerList[0].id,
    );
  }, [open, practitionerList]);

  const prac = practitionerList.find((p) => p.id === practitionerId);

  // Only services this practitioner is qualified for — a practitioner with no qualifications
  // configured yet has none bookable, matching the Settings page's own "never book them for a
  // service they aren't qualified for" guarantee rather than silently allowing everything.
  const qualifiedServices = useMemo(() => {
    const active = services.filter((s) => s.status !== "Inactive");
    if (!prac) return active;
    return active.filter((s) => prac.qualifications.includes(s.id));
  }, [services, prac]);

  // Keep the selected treatment valid for the current practitioner — reset to their first
  // qualified service whenever the practitioner changes or their qualified list changes.
  useEffect(() => {
    if (qualifiedServices.length === 0) {
      setTreatment("");
      return;
    }
    if (!qualifiedServices.some((s) => s.name === treatment)) {
      setTreatment(qualifiedServices[0].name);
    }
  }, [qualifiedServices, treatment]);

  const selectedService = qualifiedServices.find((s) => s.name === treatment);

  useEffect(() => {
    if (clientMode !== "existing" || !cust) return;
    setClientName(cust.name ?? "");
    setClientPhone(cust.phone ?? "");
    setClientEmail(cust.email ?? "");
    if (cust.birthday) {
      setBirthday(birthdayToInputValue(cust.birthday));
    }
  }, [cust?.id, clientMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchClientMode = (mode: "existing" | "new") => {
    setClientMode(mode);
    if (mode === "new") {
      setCustomerId("");
      setSearch("");
      setClientName("");
      setClientPhone("");
      setClientEmail("");
      setBirthday("");
    }
  };

  // Reset when opening
  if (open && defaultStart) {
    const ds = defaultStart.toISOString().slice(0, 10);
    if (ds !== date) {
      setDate(ds);
    }
  }

  // Fetch available slots from Google Calendar (practitioner + room aware, 5-min buffer)
  useEffect(() => {
    if (!date || !practitionerId) return;

    setLoadingSlots(true);
    setSelectedSlotStart("");
    const dur = selectedService?.durationMinutes ?? DEFAULT_TREATMENT_DURATION;

    const params = new URLSearchParams({
      date,
      duration: String(dur),
      ...(prac?.name && { practitioners: prac.name }),
      ...(treatment && { treatment }),
    });

    fetch(`/api/calendar/slots?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        const slots: AvailableSlot[] = data.slots ?? [];
        setAvailableSlots(slots);
        if (slots.length > 0) {
          const first = slots[0];
          setSelectedSlotStart(first.startTime);
          setRoom(first.availableRooms?.[0] ?? clinicRooms[0] ?? "");
        } else {
          setRoom(clinicRooms[0] ?? "");
        }
      })
      .catch(() => {
        setAvailableSlots([]);
        setRoom(clinicRooms[0] ?? "");
      })
      .finally(() => setLoadingSlots(false));
  }, [date, treatment, practitionerId, prac, selectedService, clinicRooms]);
  const filteredCust = search
    ? customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : customers.slice(0, 6);

  const selectedSlot = availableSlots.find((s) => s.startTime === selectedSlotStart);
  const slotRooms = selectedSlot?.availableRooms ?? [];
  const roomOptions = selectedSlot && slotRooms.length > 0 ? slotRooms : clinicRooms;
  const roomSelectValue = selectedSlot && roomOptions.includes(room) ? room : undefined;

  const save = async (forceOverride = false) => {
    setWarnings(null);
    const resolvedName =
      clientMode === "new" ? clientName.trim() : (cust?.name ?? clientName.trim());

    if (clientMode === "existing" && !customerId) {
      toast.error("Please select a client or switch to New client");
      return;
    }
    if (clientMode === "new" && !resolvedName) {
      toast.error("Please enter the client's name");
      return;
    }
    if (!practitionerId) {
      toast.error("Please select a practitioner");
      return;
    }
    if (!treatment) {
      toast.error("Select a treatment this practitioner is qualified for");
      return;
    }
    if (!clientPhone.trim()) {
      toast.error("Phone number is required (same as chatbot booking)");
      return;
    }
    if (!clientEmail.trim() || !clientEmail.includes("@")) {
      toast.error("Valid email is required (same as chatbot booking)");
      return;
    }
    if (!isValidBirthdayInput(birthday)) {
      toast.error("Birthday is required (same as chatbot booking)");
      return;
    }
    if (!selectedSlot) {
      toast.error("Select an available time slot from the calendar");
      return;
    }
    if (!room || !slotRooms.includes(room)) {
      toast.error("Selected room is not available for this time slot");
      return;
    }

    const dur = selectedService?.durationMinutes ?? DEFAULT_TREATMENT_DURATION;
    const start = new Date(selectedSlot.startTime);
    const end = new Date(selectedSlot.endTime);

    setSaving(true);
    try {
      let bookedCustomerId = customerId;

      if (clientMode === "new") {
        const createRes = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: resolvedName,
            phone: clientPhone.trim(),
            email: clientEmail.trim(),
            birthday: normalizeBirthdayForStorage(birthday.trim()) ?? "",
            treatmentInterest: treatment,
            status: "Active",
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          toast.error(createData.error ?? "Could not create client");
          return;
        }
        bookedCustomerId = createData.customer?.id ?? "";
        store.addCustomer(createData.customer);
      }

      const res = await fetch("/api/calendar/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          clientName: resolvedName,
          clientContact: clientPhone.trim(),
          clientEmail: clientEmail.trim(),
          customer_id: bookedCustomerId || undefined,
          treatment,
          room,
          practitionerName: prac?.name ?? "",
          notes,
          sendConfirmation: notify,
          birthday: normalizeBirthdayForStorage(birthday.trim()),
          force: forceOverride,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "WARNINGS" && Array.isArray(data.warnings)) {
          // PRD §9: don't silently block — let the person reviewing decide whether to override.
          setWarnings(data.warnings);
          return;
        }
        toast.error(data.error ?? "Booking failed");
        return;
      }

      // Mirror to local store for immediate UI feedback
      store.upsertAppointment({
        id: data.id || `apt_new_${Date.now()}`,
        customer_id: bookedCustomerId,
        treatment,
        duration_minutes: dur,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        practitioner_id: practitionerId,
        room,
        status: "confirmed",
        source: "manual",
        notes,
        // Services carry no price field today — real synced appointments (fetched fresh from
        // Google Calendar) already always show $0 here too, so this isn't a new regression.
        price: 0,
        created_at: new Date().toISOString(),
        created_by: "Admin",
        reminder_status: { t_3day: false, t_1day: false, t_2hour: false },
      });

      if (notify && bookedCustomerId) {
        store.addActivity({
          id: `a_conf_${Date.now()}`,
          timestamp: new Date().toISOString(),
          customer_id: bookedCustomerId,
          rule_id: "manual",
          channel: "Email",
          message_body: `Booking confirmation email for ${treatment} on ${start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} at ${fmtTime(start)}.`,
          status: data.emailSent ? "Sent" : "Failed",
          kind: "confirmation",
        });
      }

      if (notify && data.emailSent) {
        toast.success("Appointment created — confirmation email sent.");
      } else if (notify && data.emailSkippedReason) {
        toast.success("Appointment created.", {
          description: data.emailSkippedReason,
        });
      } else {
        toast.success("Appointment created.");
      }
      onBooked?.();
      onClose();
      setCustomerId("");
      setClientName("");
      setClientPhone("");
      setClientEmail("");
      setClientMode("existing");
      setNotes("");
      setSearch("");
      setSelectedSlotStart("");
      setBirthday("");
      setWarnings(null);
    } catch {
      toast.error("Network error — could not save appointment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>New appointment</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          <div className="space-y-4 text-sm pb-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Client</Label>
              <div className="flex gap-2 mb-3">
                <Button
                  type="button"
                  size="sm"
                  variant={clientMode === "existing" ? "default" : "outline"}
                  className="h-8"
                  onClick={() => switchClientMode("existing")}
                >
                  Existing client
                </Button>
                {canCreateCustomer && (
                  <Button
                    type="button"
                    size="sm"
                    variant={clientMode === "new" ? "default" : "outline"}
                    className="h-8"
                    onClick={() => switchClientMode("new")}
                  >
                    New client
                  </Button>
                )}
              </div>

              {clientMode === "new" ? (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Full name *</Label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Jane Smith"
                    className="h-9"
                  />
                </div>
              ) : cust ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <div className="font-medium">{cust.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {cust.phone}
                      {cust.email ? ` · ${cust.email}` : " · No email on file"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setCustomerId("");
                      setClientName("");
                      setClientPhone("");
                      setClientEmail("");
                      setBirthday("");
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div>
                  <Input
                    placeholder="Search clients…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9"
                  />
                  <div className="mt-1 rounded-md border max-h-[140px] overflow-y-auto divide-y">
                    {filteredCust.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustomerId(c.id);
                          setSearch("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
                      >
                        <div className="font-medium text-sm">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.phone}</div>
                      </button>
                    ))}
                    {filteredCust.length === 0 && (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                        No matches
                        {canCreateCustomer && (
                          <>
                            {" "}
                            — try{" "}
                            <button
                              type="button"
                              className="text-primary underline"
                              onClick={() => switchClientMode("new")}
                            >
                              New client
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Phone *</Label>
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(512) 555-0199"
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Email *</Label>
                <Input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@email.com"
                  className="h-9"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Birthday *</Label>
              <Input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Treatment</Label>
                <Select
                  value={treatment || undefined}
                  onValueChange={setTreatment}
                  disabled={loadingMeta || qualifiedServices.length === 0}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue
                      placeholder={
                        loadingMeta
                          ? "Loading services…"
                          : qualifiedServices.length === 0
                            ? "Practitioner has no qualified services"
                            : "Select treatment"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {qualifiedServices.map((s) => (
                      <SelectItem key={s.id} value={s.name}>
                        {s.name} · {s.durationMinutes} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!loadingMeta && qualifiedServices.length === 0 && prac && (
                  <p className="text-xs text-destructive mt-1">
                    {prac.name} has no qualified services configured in Settings → Team.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Practitioner</Label>
                <Select
                  value={practitionerId || undefined}
                  onValueChange={setPractitionerId}
                  disabled={loadingMeta || practitionerList.length === 0}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue
                      placeholder={
                        loadingMeta
                          ? "Loading practitioners…"
                          : practitionerList.length === 0
                            ? "No practitioners configured"
                            : "Select practitioner"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {practitionerList.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Available slot{" "}
                  {loadingSlots && <span className="text-xs text-muted-foreground">checking…</span>}
                </Label>
                <Select
                  value={selectedSlotStart || undefined}
                  onValueChange={(v) => {
                    setSelectedSlotStart(v);
                    const slot = availableSlots.find((s) => s.startTime === v);
                    if (slot?.availableRooms?.[0]) setRoom(slot.availableRooms[0]);
                  }}
                  disabled={loadingSlots || loadingMeta || availableSlots.length === 0}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue
                      placeholder={
                        loadingSlots
                          ? "Loading slots…"
                          : availableSlots.length === 0
                            ? "No slots available"
                            : "Select a time"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSlots.map((slot) => (
                      <SelectItem key={slot.startTime} value={slot.startTime}>
                        {slot.displayTime}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!loadingSlots && availableSlots.length === 0 && (
                  <p className="text-xs text-destructive mt-1">
                    No open slots for this date, practitioner, and treatment (5-min buffer applied).
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Room</Label>
              {selectedSlot && slotRooms.length > 0 ? (
                <Select value={roomSelectValue} onValueChange={setRoom}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    {slotRooms.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground min-h-9 flex items-center">
                  {clinicRooms.length > 0
                    ? `${clinicRooms.join(", ")} — select a time slot first`
                    : "Select an available time slot first"}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Slots include a 5-minute buffer between appointments (e.g. 9:30 AM end → next at
                9:35 AM).
              </p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional internal notes…"
                className="min-h-[60px]"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-new" className="text-sm cursor-pointer">
                  Send confirmation email
                </Label>
                {notify && !clientEmail.trim() && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    Enter an email address to send confirmation.
                  </p>
                )}
              </div>
              <Switch id="notify-new" checked={notify} onCheckedChange={setNotify} />
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => save()} disabled={saving}>
            {saving ? "Checking availability…" : "Create appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Manual override (PRD §9) — never silently block or silently allow a rule-breaking booking */}
      <Dialog open={!!warnings} onOpenChange={(o) => !o && setWarnings(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>This booking breaks a rule</DialogTitle>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
            {(warnings ?? []).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setWarnings(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => save(true)} disabled={saving}>
              {saving ? "Booking…" : "Book anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
