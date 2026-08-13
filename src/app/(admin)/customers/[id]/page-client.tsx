"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Pencil, CheckCheck, Hourglass, Inbox } from "lucide-react";
import { toast } from "sonner";
import type { Customer } from "@/lib/types";
import type { CalendarEvent, RequiredFormStatus } from "@/types";
import type {
  CustomerStatistics,
  PractitionerSummary,
  TimelineEntry,
  TreatmentSummary,
} from "@/lib/customers/profile";
import type { EmailSendLogEntry } from "@/lib/integrations/email-send-log-types";
import type { FollowupSendEntry } from "@/lib/retention/followup-sends";
import { birthdayToInputValue, formatBirthdayDisplay } from "@/lib/birthday";
import { statusPillClass } from "@/lib/customers/status-pill";
import { AccessGate } from "@/components/rbac/AccessGate";
import { useCurrentUser } from "@/lib/current-user-context";
import { FormResponseDialog } from "@/components/forms/FormResponseDialog";
import { StaffFillFormDialog } from "@/components/forms/StaffFillFormDialog";

interface CustomerProfileResponse {
  customer: Customer;
  statistics: CustomerStatistics;
  appointments: {
    upcoming: CalendarEvent[];
    past: CalendarEvent[];
    lookbackDays: number;
    truncated: boolean;
  };
  treatments: TreatmentSummary[];
  practitioners: PractitionerSummary[];
  communications: { emails: EmailSendLogEntry[]; followups: FollowupSendEntry[]; total: number };
  timeline: TimelineEntry[];
  meta: { matchedBy: "id" | "phone" | "name" | "unmatched"; generatedAt: string };
}

interface EditForm {
  name: string;
  phone: string;
  email: string;
  birthday: string;
  status: string;
  notes: string;
  treatmentInterest: string;
}

function toEditForm(c: Customer): EditForm {
  return {
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    birthday: birthdayToInputValue(c.birthday),
    status: c.status,
    notes: c.notes ?? "",
    treatmentInterest: c.treatments.join(", "),
  };
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

const FORM_STATUS_PRIORITY: Record<RequiredFormStatus["status"], number> = {
  PENDING: 0,
  SUBMITTED: 1,
  COMPLETED: 2,
};

function RequiredFormRow({
  form,
  treatment,
  startTime,
  marking,
  onViewResponse,
  onMarkComplete,
  onFillOnBehalf,
}: {
  form: RequiredFormStatus;
  treatment: string;
  startTime: string;
  marking: boolean;
  onViewResponse: (formId: string) => void;
  onMarkComplete: (formId: string) => void;
  onFillOnBehalf: (formId: string) => void;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{form.formName}</div>
          <div className="text-muted-foreground text-xs mt-0.5">
            {treatment} · {formatDateTime(startTime)}
          </div>
        </div>
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
      <div className="text-muted-foreground text-xs mt-1">
        {form.sentAt && <>Sent {formatDateTime(form.sentAt)}</>}
        {form.submittedAt && <> · Submitted {formatDateTime(form.submittedAt)}</>}
        {form.completedAt && <> · Completed {formatDateTime(form.completedAt)}</>}
      </div>
    </div>
  );
}

export default function CustomerProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const { can } = useCurrentUser();
  const canUpdate = can("customers", "Update");

  const [profile, setProfile] = useState<CustomerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewingResponseId, setViewingResponseId] = useState<string | null>(null);
  const [markingFormId, setMarkingFormId] = useState<string | null>(null);
  const [fillingFormId, setFillingFormId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/customers/${id}/profile`);
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setProfile(data);
    } catch {
      toast.error("Failed to load customer profile");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    if (!profile) return;
    setForm(toEditForm(profile.customer));
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setForm(null);
  };

  const field =
    (key: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  const save = async () => {
    if (!form || !profile) return;
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: profile.customer.id, ...form }),
      });
      if (!res.ok) throw new Error();
      toast.success("Customer updated");
      setEditMode(false);
      setForm(null);
      void load();
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const markFormComplete = async (formId: string) => {
    setMarkingFormId(formId);
    try {
      const res = await fetch(`/api/required-forms/${formId}/complete`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      const completedAt = new Date().toISOString();
      setProfile((prev) => {
        if (!prev) return prev;
        const patch = (events: typeof prev.appointments.upcoming) =>
          events.map((e) => ({
            ...e,
            requiredForms: (e.requiredForms ?? []).map((f) =>
              f.id === formId ? { ...f, status: "COMPLETED" as const, completedAt } : f,
            ),
          }));
        return {
          ...prev,
          appointments: {
            ...prev.appointments,
            upcoming: patch(prev.appointments.upcoming),
            past: patch(prev.appointments.past),
          },
        };
      });
      toast.success("Form marked as completed");
    } catch {
      toast.error("Failed to update form status");
    } finally {
      setMarkingFormId(null);
    }
  };

  const handleFilledOnBehalf = (formId: string, submittedAt: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const patch = (events: typeof prev.appointments.upcoming) =>
        events.map((e) => ({
          ...e,
          requiredForms: (e.requiredForms ?? []).map((f) =>
            f.id === formId ? { ...f, status: "SUBMITTED" as const, submittedAt } : f,
          ),
        }));
      return {
        ...prev,
        appointments: {
          ...prev.appointments,
          upcoming: patch(prev.appointments.upcoming),
          past: patch(prev.appointments.past),
        },
      };
    });
    toast.success("Form submitted on the client's behalf");
  };

  if (accessDenied) {
    return (
      <div className="space-y-5">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4 mr-1" /> Customers
          </Link>
        </Button>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="space-y-5">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4 mr-1" /> Customers
          </Link>
        </Button>
        <EmptyState>Customer not found.</EmptyState>
      </div>
    );
  }

  const {
    customer,
    statistics,
    appointments,
    treatments,
    practitioners,
    communications,
    timeline,
    meta,
  } = profile;

  // Flattens every required form across every booking (upcoming + past) into one list — the
  // per-booking breakdown lives on the appointment itself (AppointmentSlideOver), this view is
  // the customer-centric rollup asked for separately. Pending forms surface first so staff see
  // what's outstanding without scanning past completed ones.
  const requiredFormsFlat = [...appointments.upcoming, ...appointments.past]
    .flatMap((a) => (a.requiredForms ?? []).map((f) => ({ appointment: a, form: f })))
    .sort((a, b) => {
      const priority = FORM_STATUS_PRIORITY[a.form.status] - FORM_STATUS_PRIORITY[b.form.status];
      if (priority !== 0) return priority;
      return (
        new Date(b.appointment.startTime).getTime() - new Date(a.appointment.startTime).getTime()
      );
    });

  return (
    <>
      <div className="space-y-5">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4 mr-1" /> Customers
          </Link>
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            {editMode && form ? (
              <>
                <Input
                  value={form.name}
                  onChange={field("name")}
                  className="text-2xl font-semibold h-auto py-1 -ml-1 w-auto"
                />
                {meta.matchedBy === "name" &&
                  !form.phone.trim() &&
                  form.name.trim() !== customer.name.trim() && (
                    <p className="text-xs text-warning-foreground bg-warning/10 border border-warning/30 rounded-md px-2.5 py-1.5 mt-2 max-w-md">
                      This customer has no phone on file, so their appointment/treatment history is
                      currently linked by name only. Renaming them will disconnect that existing
                      history (it stays matched to &quot;{customer.name}&quot;, not the new name) —
                      add a phone number below to avoid this.
                    </p>
                  )}
              </>
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap text-sm text-muted-foreground">
              <span className={statusPillClass(customer.status)}>{customer.status}</span>
              {customer.phone && <span>{customer.phone}</span>}
              {customer.email && <span>{customer.email}</span>}
              {customer.birthday && (
                <span>Birthday {formatBirthdayDisplay(customer.birthday)}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!editMode && canUpdate && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            )}
            {editMode && (
              <>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Save changes
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatTile label="Total visits" value={String(statistics.totalVisits)} />
          <StatTile label="Last visit" value={formatDateTime(statistics.lastVisit)} />
          <StatTile label="Upcoming" value={String(statistics.upcomingCount)} />
          <StatTile label="Lifetime value" value="$0" hint="Not tracked yet" />
        </div>

        {meta.matchedBy === "name" && (
          <p className="text-xs text-muted-foreground">
            This customer has no phone number on file — appointment history below was matched by
            name, which may be less reliable than a phone match.
          </p>
        )}
        {meta.matchedBy === "unmatched" && (
          <p className="text-xs text-muted-foreground">
            No calendar appointments could be matched to this customer (no phone on file and no name
            match found).
          </p>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="treatments">Treatments</TabsTrigger>
            <TabsTrigger value="practitioners">Practitioners</TabsTrigger>
            <TabsTrigger value="communications">Communications</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {editMode && form ? (
              <div className="rounded-lg border bg-card p-4 space-y-3 max-w-xl">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input value={form.phone} onChange={field("phone")} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input value={form.email} onChange={field("email")} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Birthday</Label>
                    <Input
                      type="date"
                      value={form.birthday}
                      onChange={field("birthday")}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm((f) => (f ? { ...f, status: v } : f))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="VIP">VIP</SelectItem>
                        <SelectItem value="Dormant">Dormant</SelectItem>
                        <SelectItem value="No-show">No-show</SelectItem>
                        <SelectItem value="Discard">Discard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Treatment interest</Label>
                  <Input
                    value={form.treatmentInterest}
                    onChange={field("treatmentInterest")}
                    className="mt-1"
                    placeholder="e.g. Botox, HydraFacial"
                  />
                </div>
              </div>
            ) : (
              <>
                {customer.treatments.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Treatment interest
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {customer.treatments.map((t) => (
                        <span
                          key={t}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-accent border text-accent-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Next appointment
                  </div>
                  {appointments.upcoming.length > 0 ? (
                    <div className="rounded-md border p-3 text-sm max-w-md">
                      <div className="font-medium">{appointments.upcoming[0].treatment}</div>
                      <div className="text-muted-foreground mt-0.5">
                        {formatDateTime(appointments.upcoming[0].startTime)} with{" "}
                        {appointments.upcoming[0].practitioner || "unassigned"}
                      </div>
                    </div>
                  ) : (
                    <EmptyState>No upcoming appointments.</EmptyState>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Notes
                  </div>
                  <div className="rounded-md border p-3 text-sm max-w-xl min-h-[60px]">
                    {customer.notes || <span className="text-muted-foreground">No notes yet.</span>}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* Appointments */}
          <TabsContent value="appointments" className="mt-4 space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Upcoming
              </div>
              {appointments.upcoming.length > 0 ? (
                <div className="rounded-md border divide-y text-sm">
                  {appointments.upcoming.map((a) => (
                    <div key={a.id} className="px-3 py-2.5 flex justify-between items-center">
                      <div>
                        <div className="font-medium">{a.treatment}</div>
                        <div className="text-muted-foreground text-xs mt-0.5">
                          {a.practitioner || "unassigned"} · {a.room || "—"}
                        </div>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatDateTime(a.startTime)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>No upcoming appointments.</EmptyState>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Past
              </div>
              {appointments.past.length > 0 ? (
                <>
                  <div className="rounded-md border divide-y text-sm">
                    {appointments.past.map((a) => (
                      <div key={a.id} className="px-3 py-2.5 flex justify-between items-center">
                        <div>
                          <div className="font-medium">{a.treatment}</div>
                          <div className="text-muted-foreground text-xs mt-0.5">
                            {a.practitioner || "unassigned"} · {a.room || "—"}
                          </div>
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatDateTime(a.startTime)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {appointments.truncated && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Showing the last {appointments.lookbackDays} days — there may be earlier
                      visits not shown here.
                    </p>
                  )}
                </>
              ) : (
                <EmptyState>No past appointments recorded.</EmptyState>
              )}
            </div>
          </TabsContent>

          {/* Forms */}
          <TabsContent value="forms" className="mt-4">
            {requiredFormsFlat.length > 0 ? (
              <div className="rounded-md border divide-y text-sm">
                {requiredFormsFlat.map(({ appointment, form }) => (
                  <RequiredFormRow
                    key={form.id}
                    form={form}
                    treatment={appointment.treatment}
                    startTime={appointment.startTime}
                    marking={markingFormId === form.id}
                    onViewResponse={setViewingResponseId}
                    onMarkComplete={markFormComplete}
                    onFillOnBehalf={setFillingFormId}
                  />
                ))}
              </div>
            ) : (
              <EmptyState>No required forms for this customer&apos;s bookings.</EmptyState>
            )}
          </TabsContent>

          {/* Treatments */}
          <TabsContent value="treatments" className="mt-4">
            {treatments.length > 0 ? (
              <div className="rounded-md border divide-y text-sm">
                {treatments.map((t) => (
                  <div key={t.name} className="px-3 py-2.5 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      {t.source === "interest" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          interested, not yet visited
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs text-right">
                      {t.visitCount > 0 && <div>{t.visitCount} visit(s)</div>}
                      {t.lastDate && <div>Last: {formatDateTime(t.lastDate)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No treatment history yet.</EmptyState>
            )}
          </TabsContent>

          {/* Practitioners */}
          <TabsContent value="practitioners" className="mt-4">
            {practitioners.length > 0 ? (
              <div className="rounded-md border divide-y text-sm">
                {practitioners.map((p) => (
                  <div key={p.name} className="px-3 py-2.5 flex justify-between items-center">
                    <span className="font-medium">{p.name}</span>
                    <div className="text-muted-foreground text-xs text-right">
                      <div>{p.visitCount} visit(s)</div>
                      <div>Last: {formatDateTime(p.lastDate)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No practitioner history yet.</EmptyState>
            )}
          </TabsContent>

          {/* Communications */}
          <TabsContent value="communications" className="mt-4">
            {communications.total > 0 ? (
              <div className="rounded-md border divide-y text-sm">
                {[...communications.emails]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((e) => (
                    <div key={e.id} className="px-3 py-2.5 flex justify-between items-center gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.subject || e.category}</div>
                        <div className="text-muted-foreground text-xs mt-0.5">
                          {e.category} · {e.status}
                        </div>
                      </div>
                      <div className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatDateTime(e.createdAt)}
                      </div>
                    </div>
                  ))}
                {communications.followups.map((f) => (
                  <div key={f.id} className="px-3 py-2.5 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">Follow-up: {f.treatment || "—"}</div>
                      <div className="text-muted-foreground text-xs mt-0.5">{f.status}</div>
                    </div>
                    <div className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatDateTime(f.sentAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No communications sent yet.</EmptyState>
            )}
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline" className="mt-4">
            {timeline.length > 0 ? (
              <div className="rounded-md border divide-y text-sm">
                {timeline.map((t) => (
                  <div key={t.id} className="px-3 py-2.5 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.details}</div>
                      <div className="text-muted-foreground text-xs mt-0.5">
                        {t.eventType} · {t.platform}
                      </div>
                    </div>
                    <div className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatDateTime(t.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No activity recorded yet.</EmptyState>
            )}
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-4">
            {editMode && form ? (
              <Textarea
                value={form.notes}
                onChange={field("notes")}
                placeholder="Notes about this customer…"
                rows={8}
                className="max-w-2xl"
              />
            ) : (
              <div className="rounded-md border p-4 min-h-[120px] text-sm max-w-2xl">
                {customer.notes || <span className="text-muted-foreground">No notes yet.</span>}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
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
