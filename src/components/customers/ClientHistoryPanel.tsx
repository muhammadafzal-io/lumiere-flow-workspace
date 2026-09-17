"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  History,
  MessageSquareQuote,
  StickyNote,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/lib/current-user-context";
import {
  APPOINTMENT_STATE_LABELS,
  buildClientHistory,
  type AppointmentState,
  type BriefSource,
  type HistoryAppointment,
} from "@/lib/customers/appointment-brief";
import { RequiredFormRow } from "@/components/forms/RequiredFormRow";
import { ClientNotesPanel } from "@/components/customers/ClientNotesPanel";

const PAST_PREVIEW = 10;
const FORMS_PREVIEW = 5;

const STATE_PILL: Record<AppointmentState, string> = {
  pending: "bg-warning/15 text-warning-foreground border-warning/30",
  upcoming: "bg-info/10 text-info border-info/20",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-success/10 text-success border-success/20",
  past: "bg-muted text-muted-foreground border-border",
};

export function AppointmentStatePill({ state }: { state: AppointmentState }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border whitespace-nowrap ${STATE_PILL[state]}`}
    >
      {APPOINTMENT_STATE_LABELS[state]}
    </span>
  );
}

function useFormatters() {
  const { timezone } = useCurrentUser();
  return useMemo(() => {
    const timeZone = timezone ?? undefined;
    const valid = (iso: string | null | undefined) => {
      if (!iso) return null;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    return {
      dateTime: (iso: string | null | undefined) =>
        valid(iso)?.toLocaleString(undefined, {
          timeZone,
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }) ?? "—",
      date: (iso: string | null | undefined) =>
        valid(iso)?.toLocaleDateString(undefined, {
          timeZone,
          month: "short",
          day: "numeric",
          year: "numeric",
        }) ?? "—",
    };
  }, [timezone]);
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5 flex items-center gap-1.5">
      {icon}
      {children}
    </h3>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-2 min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold mt-0.5 text-sm tabular-nums break-words">{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-3 py-4 text-sm text-muted-foreground">{children}</div>
  );
}

function formsSummary(a: HistoryAppointment): string {
  const forms = a.event.requiredForms ?? [];
  if (forms.length === 0) return "—";
  const done = forms.filter((f) => f.status !== "PENDING").length;
  return `${done}/${forms.length} submitted`;
}

/**
 * The client's combined history — every past service, treatments, practitioners, forms, notes,
 * feedback and activity — opened with one click from the customer profile's Appointments tab.
 * Built entirely from the already-loaded profile, plus the client's notes.
 */
export function ClientHistoryPanel({
  source,
  matchedBy,
  markingFormId,
  onViewResponse,
  onMarkComplete,
  onFillOnBehalf,
}: {
  source: BriefSource;
  matchedBy: "id" | "phone" | "name" | "unmatched";
  markingFormId: string | null;
  onViewResponse: (formId: string) => void;
  onMarkComplete: (formId: string) => void;
  onFillOnBehalf: (formId: string) => void;
}) {
  const fmt = useFormatters();
  const [showAllPast, setShowAllPast] = useState(false);
  const [showAllForms, setShowAllForms] = useState(false);

  const history = useMemo(() => buildClientHistory(source), [source]);

  const eventLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const e of [...source.appointments.upcoming, ...source.appointments.past]) {
      labels.set(e.id, `${e.treatment || "appointment"} on ${fmt.date(e.startTime)}`);
    }
    return labels;
  }, [source, fmt]);

  const { overview } = history;
  const pastShown = showAllPast ? history.past : history.past.slice(0, PAST_PREVIEW);
  const formsShown = showAllForms ? history.forms : history.forms.slice(0, FORMS_PREVIEW);

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-6">
      {(overview.pendingDetails > 0 || history.pendingForms > 0 || matchedBy === "name") && (
        <div className="space-y-2">
          {overview.pendingDetails > 0 && (
            <Alert>
              {overview.pendingDetails} booking(s) still waiting for the client&apos;s name, email
              and date of birth.
            </Alert>
          )}
          {history.pendingForms > 0 && (
            <Alert>{history.pendingForms} required form(s) not submitted yet.</Alert>
          )}
          {matchedBy === "name" && (
            <Alert>
              History was matched by name only, so it may include another client with the same name.
            </Alert>
          )}
        </div>
      )}

      {/* Client overview */}
      <section>
        <SectionTitle>Client overview</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <Tile label="Visits" value={String(overview.visits)} />
          <Tile label="Appointments" value={String(overview.totalAppointments)} />
          <Tile label="Marked complete" value={String(overview.markedComplete)} />
          <Tile label="Cancelled" value={String(overview.cancelled)} />
          <Tile label="No-shows" value="Not tracked" />
          <Tile label="Client since" value={fmt.date(overview.clientSince)} />
          <Tile label="Last activity" value={fmt.date(overview.lastActivity)} />
          <Tile label="Last treatment" value={overview.lastTreatment || "—"} />
          <Tile label="Last practitioner" value={history.lastPractitioner || "—"} />
          <Tile
            label="Next appointment"
            value={
              overview.nextAppointment
                ? `${fmt.date(overview.nextAppointment.event.startTime)} · ${overview.nextAppointment.event.treatment || "Appointment"}`
                : "None booked"
            }
          />
        </div>
      </section>

      {/* Past services */}
      <section>
        <SectionTitle icon={<History className="h-3 w-3" />}>
          All past services ({history.past.length})
        </SectionTitle>
        {history.past.length === 0 ? (
          <Empty>No past services on record.</Empty>
        ) : (
          <>
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Practitioner</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="whitespace-nowrap">Booked via</TableHead>
                    <TableHead>Forms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastShown.map((a) => (
                    <TableRow key={a.event.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {fmt.dateTime(a.event.startTime)}
                      </TableCell>
                      <TableCell className="min-w-[10rem]">
                        <div className="font-medium">{a.event.treatment || "Appointment"}</div>
                        {a.event.notes && (
                          <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words max-w-xs">
                            {a.event.notes}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {a.event.practitioner || "Unassigned"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{a.event.room || "—"}</TableCell>
                      <TableCell>
                        <AppointmentStatePill state={a.state} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {a.bookedVia ? capitalize(a.bookedVia) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formsSummary(a)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {history.past.length > PAST_PREVIEW && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 -ml-2"
                onClick={() => setShowAllPast((v) => !v)}
              >
                {showAllPast ? "Show fewer" : `Show all ${history.past.length}`}
              </Button>
            )}
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Treatment history */}
        <section>
          <SectionTitle>Treatment history</SectionTitle>
          {history.treatments.length === 0 ? (
            <Empty>No treatments on record.</Empty>
          ) : (
            <div className="rounded-md border bg-card divide-y text-sm">
              {history.treatments.map((t) => (
                <div key={t.name} className="px-3 py-2.5 flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium break-words">{t.name}</div>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      Last {fmt.date(t.lastDate)} · {t.lastPractitioner || "Unassigned"}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                    {t.count} time{t.count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Practitioners */}
        <section>
          <SectionTitle icon={<Users className="h-3 w-3" />}>Practitioners</SectionTitle>
          {history.practitioners.length === 0 ? (
            <Empty>No practitioners on record.</Empty>
          ) : (
            <div className="rounded-md border bg-card divide-y text-sm">
              {history.practitioners.map((p) => (
                <div key={p.name} className="px-3 py-2.5 flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium break-words">
                      {p.name}
                      {p.name === history.lastPractitioner && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Last seen
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      Last {fmt.date(p.lastDate)}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                    {p.count} appointment{p.count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Practitioner notes */}
        <section>
          <SectionTitle icon={<StickyNote className="h-3 w-3" />}>Practitioner notes</SectionTitle>
          <ClientNotesPanel clientId={source.customer.id} eventLabels={eventLabels} />
          {source.customer.notes && (
            <div className="mt-3 rounded-md border bg-card px-3 py-2.5 text-sm">
              <div className="text-[11px] font-medium text-muted-foreground mb-1">
                General note on the client record
              </div>
              <p className="whitespace-pre-wrap break-words">{source.customer.notes}</p>
            </div>
          )}
        </section>

        {/* Forms */}
        <section>
          <SectionTitle icon={<ClipboardList className="h-3 w-3" />}>
            Forms ({history.forms.length})
          </SectionTitle>
          {history.forms.length === 0 ? (
            <Empty>No required forms for this client&apos;s bookings.</Empty>
          ) : (
            <>
              <div className="rounded-md border bg-card divide-y text-sm">
                {formsShown.map(({ form, event }) => (
                  <RequiredFormRow
                    key={form.id}
                    form={form}
                    subtitle={`${event.treatment || "Appointment"} · ${fmt.dateTime(event.startTime)}`}
                    marking={markingFormId === form.id}
                    onViewResponse={onViewResponse}
                    onMarkComplete={onMarkComplete}
                    onFillOnBehalf={onFillOnBehalf}
                  />
                ))}
              </div>
              {history.forms.length > FORMS_PREVIEW && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 -ml-2"
                  onClick={() => setShowAllForms((v) => !v)}
                >
                  {showAllForms ? "Show fewer" : `Show all ${history.forms.length}`}
                </Button>
              )}
            </>
          )}
          {history.lastFormSent && (
            <p className="text-xs text-muted-foreground mt-2">
              Last form sent: {history.lastFormSent.form.formName} on{" "}
              {fmt.dateTime(history.lastFormSent.form.sentAt)}
            </p>
          )}
        </section>

        {/* Feedback */}
        <section>
          <SectionTitle icon={<MessageSquareQuote className="h-3 w-3" />}>Feedback</SectionTitle>
          {history.reviews.length === 0 ? (
            <Empty>No feedback recorded.</Empty>
          ) : (
            <div className="rounded-md border bg-card divide-y text-sm">
              {history.reviews.map((r) => (
                <div key={r.id} className="px-3 py-2.5">
                  <div className="text-xs text-muted-foreground">
                    {capitalize(r.sentiment.toLowerCase())} · review request{" "}
                    {r.status.toLowerCase()} · {fmt.date(r.createdAt)}
                    {eventLabels.get(r.appointmentId) && ` · ${eventLabels.get(r.appointmentId)}`}
                  </div>
                  {r.feedback && (
                    <p className="mt-1 whitespace-pre-wrap break-words">“{r.feedback}”</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Cancellations */}
        <section>
          <SectionTitle>Cancellations</SectionTitle>
          {history.cancellations.length === 0 ? (
            <Empty>No cancellations recorded.</Empty>
          ) : (
            <div className="rounded-md border bg-card divide-y text-sm">
              {history.cancellations.map((c) => (
                <div key={c.id} className="px-3 py-2.5">
                  <div className="break-words">{c.details}</div>
                  <div className="text-muted-foreground text-xs mt-0.5">
                    Cancelled {fmt.dateTime(c.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent activity */}
        <section className="lg:col-span-2">
          <SectionTitle>Recent activity</SectionTitle>
          {history.recentActivity.length === 0 ? (
            <Empty>No activity recorded yet.</Empty>
          ) : (
            <>
              <div className="rounded-md border bg-card divide-y text-sm">
                {history.recentActivity.map((t) => (
                  <div key={t.id} className="px-3 py-2.5">
                    <div className="break-words">{t.details}</div>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      {t.eventType} · {t.platform} · {fmt.dateTime(t.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                The Timeline tab has the full history.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground flex items-start gap-2">
      <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
