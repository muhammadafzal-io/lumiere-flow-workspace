"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { useAccountData } from "@/lib/account/use-account-data";
import {
  PageHeader,
  AccountCard,
  AccountEmpty,
  AccountError,
  AccountLoading,
  PrimaryButton,
} from "@/components/account/AccountUI";
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

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  price: number | null;
  requiresConsultation: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  color: string;
  qualifications: string[];
}

interface Slot {
  startTime: string;
  endTime: string;
  practitioner: string | null;
}

interface Profile {
  name: string;
  phone: string;
  email: string;
  birthday: string;
}

const ANY = "__any__";

const toDateInput = (d: Date) => d.toLocaleDateString("en-CA");
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * Book an appointment — laid out exactly like the admin portal's "New appointment" form: the
 * client's details on top, then treatment + practitioner, date + available slot, notes, and one
 * button. The same fields in the same order, so a client and the front desk are looking at the
 * same thing.
 *
 * What differs is only what a client must not choose: they are always the client (details come
 * from their own profile, read-only here — edit them under Profile), rooms are assigned by the
 * clinic, and the confirmation email always goes to the address on file. Every rule still lives in
 * the engine: slots come from the same availability check, the booking goes through the same
 * endpoint the chat uses, and a refusal shows the clinic's own wording.
 */
/** A detail that's already on the client's profile is locked here (read-only) so the booking, the
 * confirmation and the calendar all carry exactly what the clinic has on file; a detail still
 * missing is left open to fill in. Changing a locked one is done under Profile, which then updates
 * the calendar as well. */
const LOCKED = "cursor-not-allowed bg-muted/60 text-muted-foreground";

export default function AccountBookPage() {
  const router = useRouter();
  const profileResult = useAccountData<{ profile: Profile }>("/api/account/profile");
  const profile = profileResult.data?.profile ?? null;

  const [services, setServices] = useState<Service[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [practitionerId, setPractitionerId] = useState<string>(ANY);
  const [treatment, setTreatment] = useState("");
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotStart, setSlotStart] = useState("");
  const [notes, setNotes] = useState("");
  // The client's details, all editable — seeded once from their profile.
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshSlots, setRefreshSlots] = useState(0);
  const [booked, setBooked] = useState<{
    treatment: string;
    startTime: string;
    requiresApproval: boolean;
    emailedTo: string | null;
  } | null>(null);

  useEffect(() => {
    if (!profile || seeded) return;
    setClientName(profile.name ?? "");
    setClientPhone(profile.phone ?? "");
    setClientEmail(profile.email ?? "");
    setBirthday(profile.birthday?.slice(0, 10) ?? "");
    setSeeded(true);
  }, [profile, seeded]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/account/services").then((r) => (r.ok ? r.json() : Promise.reject(r))),
      fetch("/api/account/practitioners").then((r) => (r.ok ? r.json() : Promise.reject(r))),
    ])
      .then(([s, t]) => {
        if (cancelled) return;
        setServices(s.services ?? []);
        setTeam(t.practitioners ?? []);
      })
      .catch(() => !cancelled && setMetaError("We couldn't load our treatments."))
      .finally(() => !cancelled && setLoadingMeta(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const practitioner = team.find((p) => p.id === practitionerId) ?? null;

  // Only treatments this practitioner is qualified for — the same rule the admin form applies.
  // "Any practitioner" leaves the whole bookable menu open and lets the engine match someone.
  const qualifiedServices = useMemo(
    () =>
      practitioner ? services.filter((s) => practitioner.qualifications.includes(s.id)) : services,
    [services, practitioner],
  );

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

  // Available slots for the chosen day, treatment and (optionally) practitioner.
  useEffect(() => {
    if (!date || !treatment) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSlotStart("");
    const params = new URLSearchParams({ date, treatment });
    if (practitioner) params.set("practitioner", practitioner.name);
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
  }, [date, treatment, practitioner, refreshSlots]);

  const selectedSlot = slots.find((s) => s.startTime === slotStart);

  const confirm = async () => {
    setError(null);
    if (!treatment) return setError("Pick a treatment first.");
    if (!clientName.trim()) return setError("Please enter your name.");
    if (!clientPhone.trim()) return setError("Phone number is required.");
    if (!clientEmail.trim() || !clientEmail.includes("@"))
      return setError("A valid email is required for your confirmation.");
    if (!birthday) return setError("Birthday is required.");
    if (!selectedSlot) return setError("Select an available time slot.");

    setSaving(true);
    try {
      const res = await fetch("/api/account/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatment,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          practitionerName: practitioner?.name ?? selectedSlot.practitioner ?? undefined,
          notes: notes.trim() || undefined,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientEmail: clientEmail.trim(),
          birthday,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "We couldn't book that time.");
      setBooked({
        treatment: json.appointment.treatment,
        startTime: json.appointment.startTime,
        requiresApproval: json.appointment.requiresApproval,
        emailedTo: json.emailedTo ?? null,
      });
    } catch (err) {
      // Usually "that slot just went" — refresh the list rather than leave a dead end.
      setError(err instanceof Error ? err.message : "We couldn't book that time.");
      setRefreshSlots((n) => n + 1);
    } finally {
      setSaving(false);
    }
  };

  if (booked) {
    return (
      <div>
        <PageHeader eyebrow="All set" title="You're booked" />
        <AccountCard className="mx-auto max-w-lg space-y-4 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 ring-8 ring-success/5">
            <Check className="h-6 w-6 text-success" />
          </div>
          <div>
            <div className="font-serif text-xl font-medium text-foreground">{booked.treatment}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {new Date(booked.startTime).toLocaleString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {booked.requiresApproval
              ? "Our head practitioner will review this booking, and we'll be in touch."
              : "Your booking is confirmed."}{" "}
            {booked.emailedTo
              ? `We've emailed a confirmation to ${booked.emailedTo} — check it for anything we need from you beforehand.`
              : "Check your account for anything we need from you beforehand."}
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <PrimaryButton onClick={() => router.push("/account/appointments")}>
              My appointments
            </PrimaryButton>
          </div>
        </AccountCard>
      </div>
    );
  }

  if (loadingMeta || profileResult.loading) return <AccountLoading rows={3} />;
  if (metaError) return <AccountError message={metaError} />;
  if (services.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Book" title="Book an appointment" />
        <AccountEmpty
          title="Nothing bookable online yet"
          body="Please contact the clinic and we'll find you a time."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Book"
        title="Book an appointment"
        subtitle="Choose a treatment, a day and a time — we check the real calendar."
      />

      <AccountCard className="max-w-2xl p-5 sm:p-7">
        <div className="space-y-4 text-sm">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Full name *</Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Jane Smith"
              readOnly={!!profile?.name}
              className={`h-9 ${profile?.name ? LOCKED : ""}`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Phone *</Label>
              <Input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="(512) 555-0199"
                inputMode="tel"
                readOnly={!!profile?.phone}
                className={`h-9 ${profile?.phone ? LOCKED : ""}`}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Email *</Label>
              <Input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="you@email.com"
                readOnly={!!profile?.email}
                className={`h-9 ${profile?.email ? LOCKED : ""}`}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Birthday *</Label>
            <Input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              readOnly={!!profile?.birthday}
              className={`h-9 ${profile?.birthday ? LOCKED : ""}`}
            />
          </div>

          {(profile?.name || profile?.phone || profile?.email || profile?.birthday) && (
            <p className="-mt-1 text-xs text-muted-foreground">
              Details already on file are locked here. To change them, update your{" "}
              <Link href="/account/profile" className="text-primary underline">
                profile
              </Link>{" "}
              — it updates your calendar bookings too.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Treatment</Label>
              <Select
                value={treatment || undefined}
                onValueChange={setTreatment}
                disabled={qualifiedServices.length === 0}
              >
                <SelectTrigger className="h-9">
                  <SelectValue
                    placeholder={
                      qualifiedServices.length === 0
                        ? "No treatments for this practitioner"
                        : "Select treatment"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {qualifiedServices.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name} · {s.durationMinutes} min
                      {s.price != null ? ` · $${s.price}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedService?.requiresConsultation && (
                <p className="mt-1 text-xs text-muted-foreground">Consultation first.</p>
              )}
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Practitioner</Label>
              <Select value={practitionerId} onValueChange={setPractitionerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select practitioner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any available</SelectItem>
                  {team.map((p) => (
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
                      {!practitioner && slot.practitioner ? ` · ${slot.practitioner}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingSlots && slots.length === 0 && treatment && (
                <p className="mt-1 text-xs text-destructive">
                  No open slots for this date and treatment — try another day.
                </p>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything we should know beforehand? (optional)"
              maxLength={500}
              rows={3}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {clientEmail.includes("@")
              ? `A confirmation email will be sent to ${clientEmail}.`
              : "Add your email to receive a confirmation."}
          </p>

          {error && <AccountError message={error} />}

          <PrimaryButton onClick={confirm} disabled={saving || !selectedSlot} className="w-full">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {saving ? "Booking…" : "Book appointment"}
          </PrimaryButton>
        </div>
      </AccountCard>
    </div>
  );
}
