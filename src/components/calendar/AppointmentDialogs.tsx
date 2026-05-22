"use client";

import { useState } from "react";
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
  User as UserIcon,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  Bell,
  CheckCheck,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Appointment,
  Practitioner,
  Customer,
  Treatment,
  AppointmentStatus,
} from "@/lib/types";
import { TREATMENT_DURATIONS, TREATMENT_PRICES } from "@/lib/seed";
import { store } from "@/lib/store";
import { fmtTimeRange, fmtTime, practitionerById } from "@/lib/calendar-utils";

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
}: {
  appointment: Appointment | null;
  customer: Customer | null;
  practitioners: Practitioner[];
  onClose: () => void;
  onReschedule: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
}) {
  const open = !!appointment;
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
  const isPast = end.getTime() < Date.now();

  const markComplete = () => {
    store.upsertAppointment({ ...a, status: "completed" });
    toast.success("Appointment marked complete");
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg leading-tight">
                {customer?.name || "Client"}
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
          {/* Appointment details */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
              Appointment
            </h3>
            <div className="rounded-lg border bg-card divide-y">
              <Row
                icon={<CalendarIcon className="h-3.5 w-3.5" />}
                label="Date"
                value={start.toLocaleDateString(undefined, {
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
              <Row label="Practitioner" value={prac?.name || "—"} swatch={prac?.color} />
              <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Room" value={a.room} />
              <Row label="Price" value={`$${a.price.toLocaleString()}`} />
              <Row
                label="Source"
                value={
                  a.source === "ai_booked"
                    ? `Booked by AI on ${new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${fmtTime(new Date(a.created_at))}`
                    : `Manually booked${a.created_by ? ` by ${a.created_by}` : ""} on ${new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                }
              />
            </div>
          </section>

          {/* Client snapshot */}
          {customer && (
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
                      {new Date(customer.last_visit).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <a href={`/customers`} className="block mt-3 text-xs text-primary hover:underline">
                  View full profile →
                </a>
              </div>
            </section>
          )}

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

          {/* Notes */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
              Notes
            </h3>
            <Textarea
              defaultValue={a.notes}
              placeholder="Add a note about this appointment…"
              className="min-h-[80px]"
              onBlur={(e) => {
                if (e.target.value !== a.notes) {
                  store.upsertAppointment({ ...a, notes: e.target.value });
                }
              }}
            />
          </section>
        </div>

        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t px-6 py-3 flex items-center justify-end gap-2">
          {a.status !== "completed" && a.status !== "cancelled" && (
            <>
              <Button variant="outline" size="sm" onClick={() => onReschedule(a)}>
                Reschedule
              </Button>
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
            <Button size="sm" onClick={markComplete}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark complete
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
        {when.toLocaleString(undefined, {
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
  const ns = newStart;
  const first = customer?.name.split(" ")[0] || "there";
  const defaultMsg =
    a && ns
      ? `Hi ${first} — Sofia here from Lumière. We've moved your ${a.treatment} to ${ns.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} at ${fmtTime(ns)}. The new confirmation link is below. Let me know if this doesn't work for you.`
      : "";
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState(defaultMsg);
  const [showMsg, setShowMsg] = useState(false);

  // Reset message when appointment changes
  if (a && ns && msg === "") setMsg(defaultMsg);

  const confirm = () => {
    if (!a || !ns || !customer) return;
    const newEnd = new Date(ns.getTime() + a.duration_minutes * 60000);
    store.upsertAppointment({ ...a, start_time: ns.toISOString(), end_time: newEnd.toISOString() });
    if (notify) {
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
      `Appointment rescheduled. ${notify ? `Notification sent to ${customer.name}.` : ""}`,
    );
    onConfirmed();
    setMsg("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setMsg("");
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule appointment?</DialogTitle>
        </DialogHeader>
        {a && ns && customer && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
                <div className="text-xs text-muted-foreground">Original</div>
                <div className="text-foreground">
                  <span className="font-medium">{customer.name}</span> — {a.treatment} —{" "}
                  {new Date(a.start_time).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  , {fmtTime(new Date(a.start_time))}
                </div>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
                <div className="text-xs text-muted-foreground">New</div>
                <div className="text-primary font-medium">
                  {customer.name} — {a.treatment} —{" "}
                  {ns.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  , {fmtTime(ns)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify-resch" className="text-sm cursor-pointer">
                Send automated reschedule notification via WhatsApp
              </Label>
              <Switch id="notify-resch" checked={notify} onCheckedChange={setNotify} />
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
                  />
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              setMsg("");
            }}
          >
            Cancel
          </Button>
          <Button onClick={confirm}>Confirm reschedule</Button>
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

  // reset on open
  if (appointment && msg === "") setMsg(CANCEL_MSG[reason](first, t));

  const setReasonAndMsg = (r: string) => {
    setReason(r);
    setMsg(CANCEL_MSG[r](first, t));
  };

  const confirm = () => {
    if (!appointment || !customer) return;
    store.upsertAppointment({
      ...appointment,
      status: "cancelled",
      notes: appointment.notes
        ? `${appointment.notes}\nCancelled: ${reason}`
        : `Cancelled: ${reason}`,
    });
    if (notify) {
      store.addActivity({
        id: `a_cancel_${Date.now()}`,
        timestamp: new Date().toISOString(),
        customer_id: customer.id,
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
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setMsg("");
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel this appointment?</DialogTitle>
        </DialogHeader>
        {appointment && customer && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="font-medium">
                {customer.name} — {appointment.treatment}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {new Date(appointment.start_time).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
                , {fmtTime(new Date(appointment.start_time))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Reason for cancellation
              </Label>
              <Select value={reason} onValueChange={setReasonAndMsg}>
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
              <Switch id="notify-cancel" checked={notify} onCheckedChange={setNotify} />
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
                />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              setMsg("");
            }}
          >
            Keep appointment
          </Button>
          <Button variant="destructive" onClick={confirm}>
            Confirm cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- New appointment modal -----------------

const TREATMENTS_LIST: Treatment[] = [
  "Botox",
  "HydraFacial",
  "Laser",
  "Microneedling",
  "IV Drip",
  "Filler",
];

export function NewAppointmentModal({
  open,
  onClose,
  customers,
  practitioners,
  defaultStart,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  practitioners: Practitioner[];
  defaultStart: Date | null;
}) {
  const [customerId, setCustomerId] = useState<string>("");
  const [treatment, setTreatment] = useState<Treatment>("HydraFacial");
  const [date, setDate] = useState<string>(() =>
    (defaultStart || new Date()).toISOString().slice(0, 10),
  );
  const [time, setTime] = useState<string>(() => {
    const d = defaultStart || new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [practitionerId, setPractitionerId] = useState<string>(practitioners[0]?.id || "");
  const [room, setRoom] = useState<string>("Room 1");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [search, setSearch] = useState("");

  // Reset when opening
  if (open && defaultStart) {
    const ds = defaultStart.toISOString().slice(0, 10);
    if (ds !== date && time === "00:00") {
      setDate(ds);
      setTime(
        `${String(defaultStart.getHours()).padStart(2, "0")}:${String(defaultStart.getMinutes()).padStart(2, "0")}`,
      );
    }
  }

  const cust = customers.find((c) => c.id === customerId);
  const filteredCust = search
    ? customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : customers.slice(0, 6);

  const save = () => {
    if (!customerId) {
      toast.error("Please select a client");
      return;
    }
    const dur = TREATMENT_DURATIONS[treatment];
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + dur * 60000);
    const id = `apt_new_${Date.now()}`;
    store.upsertAppointment({
      id,
      customer_id: customerId,
      treatment,
      duration_minutes: dur,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      practitioner_id: practitionerId,
      room,
      status: "confirmed",
      source: "manual",
      notes,
      price: TREATMENT_PRICES[treatment],
      created_at: new Date().toISOString(),
      created_by: "Sofia",
      reminder_status: { t_3day: false, t_1day: false, t_2hour: false },
    });
    if (notify && cust) {
      store.addActivity({
        id: `a_conf_${Date.now()}`,
        timestamp: new Date().toISOString(),
        customer_id: cust.id,
        rule_id: "manual",
        channel: "WhatsApp",
        message_body: `Hi ${cust.name.split(" ")[0]} — your ${treatment} is confirmed for ${start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} at ${fmtTime(start)}. See you soon.`,
        status: "Sent",
        kind: "confirmation",
      });
    }
    toast.success(`Appointment created.${notify ? " Confirmation sent." : ""}`);
    onClose();
    // reset
    setCustomerId("");
    setNotes("");
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Client</Label>
            {cust ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <div className="font-medium">{cust.name}</div>
                  <div className="text-xs text-muted-foreground">{cust.phone}</div>
                </div>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setCustomerId("")}
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
                <div className="mt-1 rounded-md border max-h-[180px] overflow-y-auto divide-y">
                  {filteredCust.map((c) => (
                    <button
                      key={c.id}
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
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Treatment</Label>
              <Select value={treatment} onValueChange={(v) => setTreatment(v as Treatment)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TREATMENTS_LIST.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t} · {TREATMENT_DURATIONS[t]} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Practitioner</Label>
              <Select value={practitionerId} onValueChange={setPractitionerId}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {practitioners.map((p) => (
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

          <div className="grid grid-cols-3 gap-3">
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
              <Label className="text-xs text-muted-foreground mb-1.5 block">Time</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                step={1800}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Room</Label>
              <Select value={room} onValueChange={setRoom}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Room 1">Room 1</SelectItem>
                  <SelectItem value="Room 2">Room 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <Label htmlFor="notify-new" className="text-sm cursor-pointer">
              Send confirmation to client
            </Label>
            <Switch id="notify-new" checked={notify} onCheckedChange={setNotify} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Create appointment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
