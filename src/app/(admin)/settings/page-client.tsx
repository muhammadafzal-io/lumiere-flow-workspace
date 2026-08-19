"use client";

import { useCallback, useEffect, useState } from "react";
import { applyDiscount } from "@/lib/booking/offer-pricing";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Check, X, RefreshCw, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { ClientChannelsDashboard } from "@/components/ClientChannelsPanel";
import { AccessGate } from "@/components/rbac/AccessGate";
import { toast } from "sonner";

interface ClinicSettings {
  recordId: string | null;
  clinicName: string;
  timezone: string;
  address: string;
  businessHours: string;
  businessHoursSchedule: WeeklyHours;
}

interface ChannelStatus {
  connected: boolean;
  label: string;
}

/** Shared shape for Room.ClosedTimes / Equipment.ClosedTimes / Practitioner.TimeOff. */
interface ClosedTimeEntry {
  start: string;
  end: string;
  label?: string;
}

/** One start/end pair per weekday — used for both WorkingHours and Breaks. */
interface WeeklyHours {
  mon?: { start: string; end: string };
  tue?: { start: string; end: string };
  wed?: { start: string; end: string };
  thu?: { start: string; end: string };
  fri?: { start: string; end: string };
  sat?: { start: string; end: string };
  sun?: { start: string; end: string };
}

type WeekdayKey = keyof WeeklyHours;

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  specialty?: string;
  bio?: string;
  status?: string;
  qualifications?: string[];
  workingHours?: WeeklyHours | null;
  breaks?: WeeklyHours | null;
  timeOff?: ClosedTimeEntry[] | null;
}

interface RoomItem {
  id: string;
  name: string;
  type: string;
  cleanupMinutes: number;
  status: string;
  closedTimes: ClosedTimeEntry[] | null;
}

interface EquipmentItem {
  id: string;
  name: string;
  type: string;
  homeRoom: string | null;
  cleanupMinutes: number;
  status: string;
  closedTimes: ClosedTimeEntry[] | null;
}

type RoomRequirementRule =
  | { mode: "any_of_type"; roomType: string }
  | { mode: "specific"; roomIds: string[] };

interface EquipmentRequirementRule {
  equipmentIds: string[];
}

interface ServiceAddon {
  id?: string;
  name: string;
  description: string | null;
  price: number | null;
  durationMinutes: number;
  status: string;
}

interface ServiceOffer {
  id?: string;
  name: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

interface ServiceRequirement {
  id: string;
  kind: string;
  rule: any;
}

interface ServiceItem {
  id: string;
  name: string;
  durationMinutes: number;
  onlineBookable: boolean;
  requiresConsultation: boolean;
  minNoticeHours: number;
  maxAdvanceDays: number;
  waitlistCap: number | null;
  price: number | null;
  status: string;
  requirements: ServiceRequirement[];
  attachedFormIds: string[];
  addOns: ServiceAddon[];
  offers: ServiceOffer[];
  offerPrice: number | null;
}

interface AttachableForm {
  id: string;
  name: string;
  status: string;
}

interface SettingsData {
  clinic: ClinicSettings | null;
  channels: Record<string, ChannelStatus>;
  team: TeamMember[];
  rooms?: string[];
  equipment?: EquipmentItem[];
  services?: ServiceItem[];
}

const TIMEZONES = [
  // United States
  { value: "America/New_York", label: "Eastern Time (ET) — New York" },
  { value: "America/Chicago", label: "Central Time (CT) — Chicago" },
  { value: "America/Denver", label: "Mountain Time (MT) — Denver" },
  { value: "America/Phoenix", label: "Mountain Time, no DST — Phoenix" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT) — Los Angeles" },
  { value: "America/Anchorage", label: "Alaska Time — Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii Time — Honolulu" },
  // Canada
  { value: "America/Toronto", label: "Eastern Time — Toronto" },
  { value: "America/Winnipeg", label: "Central Time — Winnipeg" },
  { value: "America/Edmonton", label: "Mountain Time — Edmonton" },
  { value: "America/Vancouver", label: "Pacific Time — Vancouver" },
  { value: "America/Halifax", label: "Atlantic Time — Halifax" },
  { value: "America/St_Johns", label: "Newfoundland Time — St. John's" },
  // Latin America
  { value: "America/Mexico_City", label: "Central Time — Mexico City" },
  { value: "America/Bogota", label: "COT — Bogotá" },
  { value: "America/Lima", label: "PET — Lima" },
  { value: "America/Sao_Paulo", label: "BRT — São Paulo" },
  { value: "America/Argentina/Buenos_Aires", label: "ART — Buenos Aires" },
  { value: "America/Santiago", label: "CLT — Santiago" },
  // Europe
  { value: "Europe/London", label: "GMT/BST — London" },
  { value: "Europe/Lisbon", label: "WET — Lisbon" },
  { value: "Europe/Paris", label: "CET — Paris" },
  { value: "Europe/Berlin", label: "CET — Berlin" },
  { value: "Europe/Rome", label: "CET — Rome" },
  { value: "Europe/Madrid", label: "CET — Madrid" },
  { value: "Europe/Amsterdam", label: "CET — Amsterdam" },
  { value: "Europe/Stockholm", label: "CET — Stockholm" },
  { value: "Europe/Warsaw", label: "CET — Warsaw" },
  { value: "Europe/Athens", label: "EET — Athens" },
  { value: "Europe/Helsinki", label: "EET — Helsinki" },
  { value: "Europe/Istanbul", label: "TRT — Istanbul" },
  { value: "Europe/Moscow", label: "MSK — Moscow" },
  // Africa & Middle East
  { value: "Africa/Cairo", label: "EET — Cairo" },
  { value: "Africa/Lagos", label: "WAT — Lagos" },
  { value: "Africa/Nairobi", label: "EAT — Nairobi" },
  { value: "Africa/Johannesburg", label: "SAST — Johannesburg" },
  { value: "Asia/Riyadh", label: "AST — Riyadh" },
  { value: "Asia/Dubai", label: "GST — Dubai" },
  // Asia
  { value: "Asia/Karachi", label: "PKT — Karachi" },
  { value: "Asia/Kolkata", label: "IST — Mumbai / Kolkata" },
  { value: "Asia/Dhaka", label: "BST — Dhaka" },
  { value: "Asia/Bangkok", label: "ICT — Bangkok" },
  { value: "Asia/Singapore", label: "SGT — Singapore" },
  { value: "Asia/Shanghai", label: "CST — Beijing / Shanghai" },
  { value: "Asia/Tokyo", label: "JST — Tokyo" },
  { value: "Asia/Seoul", label: "KST — Seoul" },
  // Australia & Pacific
  { value: "Australia/Perth", label: "AWST — Perth" },
  { value: "Australia/Adelaide", label: "ACST — Adelaide" },
  { value: "Australia/Brisbane", label: "AEST, no DST — Brisbane" },
  { value: "Australia/Sydney", label: "AEST — Sydney" },
  { value: "Pacific/Auckland", label: "NZST — Auckland" },
  // UTC
  { value: "UTC", label: "UTC" },
];

const DEFAULT_BUSINESS_HOURS: WeeklyHours = {
  mon: { start: "09:00", end: "19:00" },
  tue: { start: "09:00", end: "19:00" },
  wed: { start: "09:00", end: "19:00" },
  thu: { start: "09:00", end: "19:00" },
  fri: { start: "09:00", end: "19:00" },
  sat: { start: "09:00", end: "19:00" },
};

const DEFAULT_CLINIC: ClinicSettings = {
  recordId: null,
  clinicName: "",
  timezone: "America/Chicago",
  address: "",
  businessHours: "",
  businessHoursSchedule: DEFAULT_BUSINESS_HOURS,
};

const PRESET_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

const ROLES = [
  "Practitioner",
  "Esthetician",
  "Nurse",
  "Injector",
  "Admin",
  "Front Desk",
  "Manager",
];

const SPECIALTIES = [
  "Botox",
  "HydraFacial",
  "Laser",
  "Microneedling",
  "IV Drip",
  "Filler",
  "Chemical Peel",
  "Waxing",
];

function parseSpecialties(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatSpecialties(arr: string[]): string {
  return arr.join(", ");
}

function ClinicTab({
  initial,
  onSaved,
}: {
  initial: ClinicSettings;
  onSaved: (updated: ClinicSettings) => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const field = (key: keyof ClinicSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const updated = { ...form, recordId: data.recordId ?? form.recordId };
      onSaved(updated);
      toast.success("Clinic info saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Clinic name</Label>
          <Input value={form.clinicName} onChange={field("clinicName")} className="mt-1.5" />
        </div>
        <div>
          <Label>Timezone</Label>
          <Select
            value={form.timezone}
            onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
          >
            <SelectTrigger className="mt-1.5 w-full">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {!TIMEZONES.some((tz) => tz.value === form.timezone) && form.timezone && (
                <SelectItem value={form.timezone}>{form.timezone} (unrecognized)</SelectItem>
              )}
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Every booking, business-hours check, and the AI's sense of "today" run in this timezone.
          </p>
        </div>
        <div className="col-span-2">
          <Label>Address</Label>
          <Input value={form.address} onChange={field("address")} className="mt-1.5" />
        </div>
        <div className="col-span-2">
          <Label>Business hours</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            The clinic's own open days/hours — the booking engine and AI both check this directly; a
            day left off is closed. A practitioner without their own working hours set for a day
            defaults to being busy the clinic's full hours that day.
          </p>
          <WeeklyHoursEditor
            value={form.businessHoursSchedule}
            onChange={(v) => setForm((f) => ({ ...f, businessHoursSchedule: v }))}
          />
        </div>
      </div>
      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        Save changes
      </Button>
    </div>
  );
}

function ChannelsTab({ channels }: { channels: Record<string, ChannelStatus> }) {
  const entries = Object.entries(channels);

  return (
    <div className="space-y-4">
      <ClientChannelsDashboard />
      <div className="pt-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Integration status
        </h3>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground text-center">
          No channel configuration found.
        </div>
      ) : (
        entries.map(([key, ch]) => (
          <div
            key={key}
            className="rounded-lg border bg-card p-5 flex items-center justify-between"
          >
            <div>
              <div className="font-medium">{ch.label}</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {ch.connected ? "Configured via environment" : "Not configured"}
              </div>
            </div>
            {ch.connected ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-success/10 text-success border border-success/20">
                <Check className="h-3 w-3" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground border">
                <X className="h-3 w-3" />
                Not connected
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}

const WEEKDAYS: { key: WeekdayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

/** Repeatable start/end/label rows — used for Room/Equipment ClosedTimes and Practitioner TimeOff. */
function ClosedTimesEditor({
  value,
  onChange,
}: {
  value: ClosedTimeEntry[];
  onChange: (entries: ClosedTimeEntry[]) => void;
}) {
  const update = (i: number, patch: Partial<ClosedTimeEntry>) =>
    onChange(value.map((entry, idx) => (idx === i ? { ...entry, ...patch } : entry)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { start: "", end: "", label: "" }]);

  return (
    <div className="space-y-2">
      {value.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="datetime-local"
            value={entry.start}
            onChange={(e) => update(i, { start: e.target.value })}
            className="h-9 text-xs"
          />
          <span className="text-xs text-muted-foreground flex-shrink-0">to</span>
          <Input
            type="datetime-local"
            value={entry.end}
            onChange={(e) => update(i, { end: e.target.value })}
            className="h-9 text-xs"
          />
          <Input
            placeholder="Reason (optional)"
            value={entry.label ?? ""}
            onChange={(e) => update(i, { label: e.target.value })}
            className="h-9 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={() => remove(i)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add closed period
      </Button>
    </div>
  );
}

/** Per-weekday start/end editor — reused for both WorkingHours and Breaks. */
function WeeklyHoursEditor({
  value,
  onChange,
}: {
  value: WeeklyHours;
  onChange: (v: WeeklyHours) => void;
}) {
  const setDay = (key: WeekdayKey, patch: { start?: string; end?: string } | null) => {
    if (patch === null) {
      const rest = { ...value };
      delete rest[key];
      onChange(rest);
      return;
    }
    onChange({
      ...value,
      [key]: { start: value[key]?.start ?? "09:00", end: value[key]?.end ?? "17:00", ...patch },
    });
  };

  return (
    <div className="space-y-1.5">
      {WEEKDAYS.map(({ key, label }) => {
        const day = value[key];
        return (
          <div key={key} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDay(key, day ? null : {})}
              className={`w-14 flex-shrink-0 text-xs px-2 py-1.5 rounded-md border text-center transition-colors ${
                day
                  ? "bg-primary/10 border-primary/30 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-primary/20"
              }`}
            >
              {label}
            </button>
            {day ? (
              <>
                <Input
                  type="time"
                  value={day.start}
                  onChange={(e) => setDay(key, { start: e.target.value })}
                  className="h-8 w-28 text-xs"
                />
                <span className="text-xs text-muted-foreground flex-shrink-0">to</span>
                <Input
                  type="time"
                  value={day.end}
                  onChange={(e) => setDay(key, { end: e.target.value })}
                  className="h-8 w-28 text-xs"
                />
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Off</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PractitionerDialog({
  open,
  editing,
  services,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: TeamMember | null;
  services: ServiceItem[];
  onClose: () => void;
  onSaved: (member: TeamMember) => void;
}) {
  const blank = {
    name: "",
    email: "",
    role: "",
    color: PRESET_COLORS[0],
    specialties: [] as string[],
    bio: "",
    qualifications: [] as string[],
    workingHours: {} as WeeklyHours,
    breaks: {} as WeeklyHours,
    timeOff: [] as ClosedTimeEntry[],
  };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(
      editing
        ? {
            name: editing.name,
            email: editing.email,
            role: editing.role,
            color: editing.color,
            specialties: parseSpecialties(editing.specialty),
            bio: editing.bio ?? "",
            qualifications: editing.qualifications ?? [],
            workingHours: editing.workingHours ?? {},
            breaks: editing.breaks ?? {},
            timeOff: editing.timeOff ?? [],
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, open]);

  const toggleSpecialty = (s: string) =>
    setForm((f) => ({
      ...f,
      specialties: f.specialties.includes(s)
        ? f.specialties.filter((x) => x !== s)
        : [...f.specialties, s],
    }));

  const toggleQualification = (serviceId: string) =>
    setForm((f) => ({
      ...f,
      qualifications: f.qualifications.includes(serviceId)
        ? f.qualifications.filter((x) => x !== serviceId)
        : [...f.qualifications, serviceId],
    }));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        specialty: formatSpecialties(form.specialties),
      };
      const res = await fetch(
        "/api/practitioners",
        editing
          ? {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: editing.id, ...payload }),
            }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      onSaved(data.practitioner);
      if (editing) {
        toast.success("Practitioner updated");
      } else if (!form.email.trim()) {
        toast.success("Practitioner added");
      } else if (data.emailSent) {
        toast.success("Practitioner added — welcome email sent");
      } else {
        toast.error(
          `Practitioner added, but the welcome email could not be sent${data.emailError ? ` (${data.emailError})` : ""}.`,
        );
      }
      onClose();
    } catch {
      toast.error("Failed to save practitioner");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit team member" : "Add team member"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto pl-1 pr-4 flex-1">
          {/* Name */}
          <div>
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1.5"
              placeholder="Full name"
            />
          </div>

          {/* Email */}
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="mt-1.5"
              placeholder="name@clinic.com"
            />
          </div>

          {/* Role — dropdown to prevent typos */}
          <div>
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Specialties — multi-select checkboxes */}
          <div>
            <Label>Specialties</Label>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {SPECIALTIES.map((s) => {
                const checked = form.specialties.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSpecialty(s)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                      checked
                        ? "bg-primary/10 border-primary/30 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                        checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                      }`}
                    >
                      {checked && <Check className="h-2.5 w-2.5 text-white" />}
                    </span>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bio */}
          <div>
            <Label>Bio</Label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              className="mt-1.5 w-full px-3 py-2 border rounded-md text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Short description of the practitioner"
              rows={3}
            />
          </div>

          {/* Qualifications — services this person is allowed to perform */}
          <div>
            <Label>Qualifications</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Services this practitioner is allowed to perform. The bot will never book them for a
              service they aren't qualified for.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {services.map((s) => {
                const checked = form.qualifications.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleQualification(s.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                      checked
                        ? "bg-primary/10 border-primary/30 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                        checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                      }`}
                    >
                      {checked && <Check className="h-2.5 w-2.5 text-white" />}
                    </span>
                    {s.name}
                  </button>
                );
              })}
              {services.length === 0 && (
                <p className="text-xs text-muted-foreground col-span-2">
                  No services configured yet — add some in the Services tab.
                </p>
              )}
            </div>
          </div>

          {/* Working hours */}
          <div>
            <Label>Working hours</Label>
            <p className="text-xs text-muted-foreground mb-2">Days and times this person works.</p>
            <WeeklyHoursEditor
              value={form.workingHours}
              onChange={(workingHours) => setForm((f) => ({ ...f, workingHours }))}
            />
          </div>

          {/* Breaks */}
          <div>
            <Label>Breaks</Label>
            <p className="text-xs text-muted-foreground mb-2">
              E.g. a lunch break. The bot will not book over a break.
            </p>
            <WeeklyHoursEditor
              value={form.breaks}
              onChange={(breaks) => setForm((f) => ({ ...f, breaks }))}
            />
          </div>

          {/* Time off */}
          <div>
            <Label>Time off</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Holidays and vacation. The bot will not book during time off.
            </p>
            <ClosedTimesEditor
              value={form.timeOff}
              onChange={(timeOff) => setForm((f) => ({ ...f, timeOff }))}
            />
          </div>

          {/* Calendar color */}
          <div>
            <Label>Calendar color</Label>
            <div className="flex gap-2 mt-1.5 flex-wrap items-center">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: form.color === c ? "#fff" : "transparent",
                    outline: form.color === c ? `2px solid ${c}` : "none",
                  }}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-7 w-7 rounded-full cursor-pointer border border-border"
                title="Custom color"
              />
              <span className="text-xs text-muted-foreground ml-1">Used in calendar view</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {editing ? "Save changes" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamTab({
  team,
  loading,
  onAdd,
  onEdit,
  onStatusChange,
}: {
  team: TeamMember[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (m: TeamMember) => void;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
  const [confirmMember, setConfirmMember] = useState<TeamMember | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const active = team.filter((m) => (m.status ?? "Active") === "Active");
  const inactive = team.filter((m) => (m.status ?? "Active") !== "Active");

  const handleDeactivate = async () => {
    if (!confirmMember) return;
    const id = confirmMember.id;
    setConfirmMember(null);
    setActionId(id);
    try {
      const res = await fetch("/api/practitioners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "Inactive" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to deactivate team member");
      }
      onStatusChange(id, "Inactive");
      toast.success("Team member deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate team member");
    } finally {
      setActionId(null);
    }
  };

  const handleReactivate = async (m: TeamMember) => {
    setActionId(m.id);
    try {
      const res = await fetch("/api/practitioners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, status: "Active" }),
      });
      if (!res.ok) throw new Error();
      onStatusChange(m.id, "Active");
      toast.success(`${m.name} reactivated`);
    } catch {
      toast.error("Failed to reactivate team member");
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5">Role</th>
              <th className="text-left font-medium px-4 py-2.5">Specialties</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td className="px-4 py-3">
                  <div className="h-3 bg-muted rounded w-32" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-5 bg-muted rounded w-20" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-3 bg-muted rounded w-28" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-5 bg-muted rounded w-16" />
                </td>
                <td className="px-4 py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const MemberRow = ({ m, isInactive }: { m: TeamMember; isInactive?: boolean }) => (
    <tr key={m.id} className={`group ${isInactive ? "opacity-60" : ""}`}>
      <td className="px-4 py-3 font-medium">
        <div className="flex items-center gap-2.5">
          <span
            className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: isInactive ? "#94a3b8" : m.color }}
          >
            {m.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <div className="leading-tight">{m.name}</div>
            {m.email && <div className="text-xs text-muted-foreground font-normal">{m.email}</div>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-[11px] px-2 py-0.5 rounded-md border bg-secondary">
          {m.role || "Staff"}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {m.specialty
          ? parseSpecialties(m.specialty).map((s) => (
              <span
                key={s}
                className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary/80 border border-primary/20 text-[10px] font-medium"
              >
                {s}
              </span>
            ))
          : "—"}
      </td>
      <td className="px-4 py-3">
        {isInactive ? (
          <span className="text-[11px] px-2 py-0.5 rounded-md border bg-muted text-muted-foreground">
            Away
          </span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded-md border bg-success/10 text-success border-success/20">
            Active
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          {isInactive ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleReactivate(m)}
              disabled={actionId === m.id}
            >
              {actionId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reactivate"}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(m)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmMember(m)}
                disabled={actionId === m.id}
                title="Deactivate"
              >
                {actionId === m.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {active.length} active · {inactive.length} inactive
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add team member
        </Button>
      </div>

      {active.length === 0 && inactive.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          No team members yet.{" "}
          <button onClick={onAdd} className="text-primary underline underline-offset-2">
            Add the first one.
          </button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">Role</th>
                <th className="text-left font-medium px-4 py-2.5">Specialties</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.map((m) => (
                <MemberRow key={m.id} m={m} />
              ))}
              {showInactive && inactive.map((m) => <MemberRow key={m.id} m={m} isInactive />)}
            </tbody>
          </table>
          {inactive.length > 0 && (
            <div className="border-t px-4 py-2.5">
              <button
                onClick={() => setShowInactive((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showInactive ? "Hide" : "Show"} {inactive.length} inactive member
                {inactive.length > 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirm deactivate dialog */}
      <Dialog open={!!confirmMember} onOpenChange={(o) => !o && setConfirmMember(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate team member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{confirmMember?.name}</span> will be
            marked as inactive and removed from appointment scheduling. You can reactivate them any
            time.
          </p>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setConfirmMember(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoomsTab({ rooms, onSaved }: { rooms: RoomItem[]; onSaved: (rooms: RoomItem[]) => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [active, setActive] = useState<RoomItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<RoomItem>>({
    type: "Treatment",
    status: "Active",
    cleanupMinutes: 0,
    closedTimes: [],
  });

  useEffect(() => {
    if (active) {
      setForm({ ...active, closedTimes: active.closedTimes ?? [] });
    } else {
      setForm({ type: "Treatment", status: "Active", cleanupMinutes: 0, closedTimes: [] });
    }
  }, [active]);

  const startAdd = () => {
    setActive(null);
    setDialogOpen(true);
  };

  const editItem = (item: RoomItem) => {
    setActive(item);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.name.trim()) {
      toast.error("Room name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        Name: form.name,
        Type: form.type ?? "Treatment",
        CleanupMinutes: form.cleanupMinutes ?? 0,
        Status: form.status || "Active",
        ClosedTimes: form.closedTimes ?? [],
      } as any;

      const method = active ? "PATCH" : "POST";
      if (active) payload.id = active.id;

      const res = await fetch("/api/settings/rooms", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      const item = json.room as RoomItem;
      onSaved(
        active
          ? rooms.map((r) => (r.id === item.id ? item : r))
          : [...rooms, item].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDialogOpen(false);
      toast.success(`Room ${active ? "updated" : "added"}`);
    } catch {
      toast.error("Failed to save room");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: RoomItem) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      const res = await fetch(`/api/settings/rooms?id=${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onSaved(rooms.filter((r) => r.id !== item.id));
      toast.success("Room deleted");
    } catch {
      toast.error("Failed to delete room");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Clinic rooms</h3>
          <p className="text-sm text-muted-foreground">
            Rooms available for appointments. Services pick their room requirement from here.
          </p>
        </div>
        <Button onClick={startAdd} variant="outline">
          <Plus className="mr-2 h-4 w-4" /> Add room
        </Button>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Cleanup (min)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-3">{item.name}</td>
                <td className="px-4 py-3">{item.type}</td>
                <td className="px-4 py-3">{item.cleanupMinutes}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => editItem(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeItem(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No rooms configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{active ? "Edit room" : "Add room"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto pl-1 pr-1 flex-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Room 3, VIP Suite"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  onValueChange={(value) => setForm((f) => ({ ...f, type: value }))}
                  value={form.type ?? "Treatment"}
                >
                  <SelectTrigger className="w-full h-9 mt-1.5">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Treatment">Treatment</SelectItem>
                    <SelectItem value="Consultation">Consultation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cleanup minutes</Label>
                <Input
                  type="number"
                  value={String(form.cleanupMinutes ?? 0)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cleanupMinutes: Number(e.target.value) }))
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  onValueChange={(value) => setForm((f) => ({ ...f, status: value }))}
                  value={form.status ?? "Active"}
                >
                  <SelectTrigger className="w-full h-9 mt-1.5">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Closed times</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Dates or times this room is unavailable (deep clean, repairs).
              </p>
              <ClosedTimesEditor
                value={form.closedTimes ?? []}
                onChange={(closedTimes) => setForm((f) => ({ ...f, closedTimes }))}
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EquipmentTab({
  equipment,
  rooms,
  onSaved,
}: {
  equipment: EquipmentItem[];
  rooms: string[];
  onSaved: (equipment: EquipmentItem[]) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [active, setActive] = useState<EquipmentItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<EquipmentItem>>({
    type: "Mobile",
    status: "Active",
    cleanupMinutes: 0,
    closedTimes: [],
  });

  useEffect(() => {
    if (active) {
      setForm({ ...active, closedTimes: active.closedTimes ?? [] });
    } else {
      setForm({ type: "Mobile", status: "Active", cleanupMinutes: 0, closedTimes: [] });
    }
  }, [active]);

  const startAdd = () => {
    setActive(null);
    setDialogOpen(true);
  };

  const editItem = (item: EquipmentItem) => {
    setActive(item);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.name.trim()) {
      toast.error("Equipment name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        Name: form.name,
        Type: form.type,
        HomeRoom: form.homeRoom || null,
        CleanupMinutes: form.cleanupMinutes ?? 0,
        Status: form.status || "Active",
        ClosedTimes: form.closedTimes ?? [],
      } as any;

      const method = active ? "PATCH" : "POST";
      if (active) payload.id = active.id;

      const res = await fetch("/api/settings/equipment", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      const item = json.equipment as EquipmentItem;
      onSaved(
        active
          ? equipment.map((eq) => (eq.id === item.id ? item : eq))
          : [...equipment, item].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDialogOpen(false);
      toast.success(`Equipment ${active ? "updated" : "added"}`);
    } catch {
      toast.error("Failed to save equipment");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: EquipmentItem) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      const res = await fetch(`/api/settings/equipment?id=${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onSaved(equipment.filter((eq) => eq.id !== item.id));
      toast.success("Equipment deleted");
    } catch {
      toast.error("Failed to delete equipment");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Equipment inventory</h3>
          <p className="text-sm text-muted-foreground">
            Manage installed and mobile equipment used for services.
          </p>
        </div>
        <Button onClick={startAdd} variant="outline">
          <Plus className="mr-2 h-4 w-4" /> Add equipment
        </Button>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Home room</th>
              <th className="px-4 py-3">Cleanup (min)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-3">{item.name}</td>
                <td className="px-4 py-3">{item.type}</td>
                <td className="px-4 py-3">{item.homeRoom || "—"}</td>
                <td className="px-4 py-3">{item.cleanupMinutes}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => editItem(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeItem(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {equipment.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No equipment configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{active ? "Edit equipment" : "Add equipment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto pl-1 pr-1 flex-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  onValueChange={(value) => setForm((f) => ({ ...f, type: value }))}
                  value={form.type ?? "Mobile"}
                >
                  <SelectTrigger className="w-full h-9 mt-1.5">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mobile">Mobile</SelectItem>
                    <SelectItem value="Installed">Installed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === "Installed" && (
                <div>
                  <Label>Home room</Label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Installed equipment is fixed in one room — a service that needs it automatically
                    needs this room too.
                  </p>
                  <Select
                    onValueChange={(value) =>
                      setForm((f) => ({ ...f, homeRoom: value === "none" ? null : value }))
                    }
                    value={form.homeRoom ?? "none"}
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {rooms.map((room) => (
                        <SelectItem key={room} value={room}>
                          {room}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Cleanup minutes</Label>
                <Input
                  type="number"
                  value={String(form.cleanupMinutes ?? 0)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cleanupMinutes: Number(e.target.value) }))
                  }
                  className="mt-1.5"
                />
                {form.type === "Mobile" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Use disposable attachments? Set this to 0 — there's nothing to clean, so it's
                    free to move to the next room right away.
                  </p>
                )}
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  onValueChange={(value) => setForm((f) => ({ ...f, status: value }))}
                  value={form.status ?? "Active"}
                >
                  <SelectTrigger className="w-full h-9 mt-1.5">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Closed times</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Maintenance windows or downtime for this piece of equipment.
              </p>
              <ClosedTimesEditor
                value={form.closedTimes ?? []}
                onChange={(closedTimes) => setForm((f) => ({ ...f, closedTimes }))}
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save equipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServicesTab({
  services,
  equipment,
  rooms,
  onSaved,
}: {
  services: ServiceItem[];
  equipment: EquipmentItem[];
  rooms: RoomItem[];
  onSaved: (services: ServiceItem[]) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [active, setActive] = useState<ServiceItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ServiceItem>>({
    durationMinutes: 60,
    onlineBookable: true,
    requiresConsultation: false,
    minNoticeHours: 0,
    maxAdvanceDays: 365,
    waitlistCap: null,
    price: null,
    status: "Active",
  });
  const [roomRequirement, setRoomRequirement] = useState<RoomRequirementRule | null>(null);
  const [equipmentRequirements, setEquipmentRequirements] = useState<EquipmentRequirementRule[]>(
    [],
  );
  const [attachedFormIds, setAttachedFormIds] = useState<string[]>([]);
  const [availableForms, setAvailableForms] = useState<AttachableForm[]>([]);
  const [addOns, setAddOns] = useState<ServiceAddon[]>([]);
  const [offers, setOffers] = useState<ServiceOffer[]>([]);

  useEffect(() => {
    fetch("/api/forms")
      .then((r) => (r.ok ? r.json() : { forms: [] }))
      .then((json) =>
        setAvailableForms(
          (json.forms ?? []).filter((f: AttachableForm) => f.status !== "Inactive"),
        ),
      )
      .catch(() => setAvailableForms([]));
  }, []);

  useEffect(() => {
    if (active) {
      setForm(active);
      const roomReq = (active.requirements ?? []).find((r) => r.kind === "room");
      setRoomRequirement(roomReq ? (roomReq.rule as RoomRequirementRule) : null);
      setEquipmentRequirements(
        (active.requirements ?? [])
          .filter((r) => r.kind === "equipment")
          .map((r) => r.rule as EquipmentRequirementRule),
      );
      setAttachedFormIds(active.attachedFormIds ?? []);
      setAddOns(active.addOns ?? []);
      setOffers(active.offers ?? []);
    } else {
      setForm({
        durationMinutes: 60,
        onlineBookable: true,
        requiresConsultation: false,
        minNoticeHours: 0,
        maxAdvanceDays: 365,
        waitlistCap: null,
        price: null,
        status: "Active",
      });
      setRoomRequirement(null);
      setEquipmentRequirements([]);
      setAttachedFormIds([]);
      setAddOns([]);
      setOffers([]);
    }
  }, [active]);

  const startAdd = () => {
    setActive(null);
    setDialogOpen(true);
  };

  const editItem = (item: ServiceItem) => {
    setActive(item);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.name.trim()) {
      toast.error("Service name is required");
      return;
    }

    // POST/PATCH don't return the newly (re)written requirement rows' real ids, so this local
    // copy — used only to optimistically update the list without a refetch — gets a client-side
    // placeholder id. It's replaced by the real id the next time this list is fetched from GET.
    const requirements: ServiceRequirement[] = [
      ...(roomRequirement
        ? [{ id: crypto.randomUUID(), kind: "room", rule: roomRequirement }]
        : []),
      ...equipmentRequirements
        .filter((r) => r.equipmentIds.length > 0)
        .map((rule) => ({ id: crypto.randomUUID(), kind: "equipment", rule })),
    ];
    setSaving(true);
    try {
      const payload = {
        Name: form.name,
        DurationMinutes: form.durationMinutes ?? 60,
        OnlineBookable: form.onlineBookable ?? true,
        RequiresConsultation: form.requiresConsultation ?? false,
        MinNoticeHours: form.minNoticeHours ?? 0,
        MaxAdvanceDays: form.maxAdvanceDays ?? 365,
        WaitlistCap: form.waitlistCap ?? null,
        Price: form.price ?? null,
        Status: form.status ?? "Active",
        requirements,
        attachedFormIds,
        addOns: addOns.filter((a) => a.name.trim()),
        offers: offers.filter((o) => o.name.trim()),
      } as any;

      const method = active ? "PATCH" : "POST";
      if (active) payload.id = active.id;

      const res = await fetch("/api/settings/services", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to save service");
      }
      const json = await res.json();
      const item = json.service as ServiceItem;
      onSaved(
        active
          ? services.map((svc) =>
              svc.id === item.id ? { ...item, requirements, attachedFormIds } : svc,
            )
          : [...services, { ...item, requirements, attachedFormIds }].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
      );
      setDialogOpen(false);
      toast.success(`Service ${active ? "updated" : "added"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: ServiceItem) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      const res = await fetch(`/api/settings/services?id=${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onSaved(services.filter((svc) => svc.id !== item.id));
      toast.success("Service deleted");
    } catch {
      toast.error("Failed to delete service");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Services catalog</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage services, including resource requirements.
          </p>
        </div>
        <Button onClick={startAdd} variant="outline">
          <Plus className="mr-2 h-4 w-4" /> Add service
        </Button>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Offer</th>
              <th className="px-4 py-3">Requirements</th>
              <th className="px-4 py-3">Forms</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-3">{item.name}</td>
                <td className="px-4 py-3">{item.durationMinutes} min</td>
                <td className="px-4 py-3">{item.price != null ? `$${item.price}` : "—"}</td>
                <td className="px-4 py-3">
                  {item.offerPrice != null ? (
                    <span className="text-primary font-medium">${item.offerPrice}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">{item.requirements?.length ?? 0}</td>
                <td className="px-4 py-3">{item.attachedFormIds?.length ?? 0}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => editItem(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeItem(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {services.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No services configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{active ? "Edit service" : "Add service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto pl-1 pr-1 flex-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={String(form.durationMinutes ?? 60)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Min notice (hours)</Label>
                <Input
                  type="number"
                  value={String(form.minNoticeHours ?? 0)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, minNoticeHours: Number(e.target.value) }))
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Max advance (days)</Label>
                <Input
                  type="number"
                  value={String(form.maxAdvanceDays ?? 365)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxAdvanceDays: Number(e.target.value) }))
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Waitlist cap</Label>
                <Input
                  type="number"
                  placeholder="Default (5)"
                  value={form.waitlistCap == null ? "" : String(form.waitlistCap)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      waitlistCap: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Max people waiting per date for this service. Leave blank for the default.
                </p>
              </div>
              <div>
                <Label>Price ($)</Label>
                <Input
                  type="number"
                  placeholder="Not set"
                  value={form.price == null ? "" : String(form.price)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      price: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Rate Card price — the base price offers below discount from.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 h-9">
                <Label className="mb-0">Online bookable</Label>
                <Switch
                  checked={form.onlineBookable ?? true}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, onlineBookable: checked }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 h-9">
                <Label className="mb-0">Requires consultation</Label>
                <Switch
                  checked={form.requiresConsultation ?? false}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, requiresConsultation: checked }))
                  }
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  onValueChange={(value) => setForm((f) => ({ ...f, status: value }))}
                  value={form.status ?? "Active"}
                >
                  <SelectTrigger className="w-full h-9 mt-1.5">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <Label>Room requirement</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Done in any available room, a specific room, or a short list of allowed rooms.
              </p>
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant={roomRequirement?.mode === "any_of_type" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRoomRequirement({ mode: "any_of_type", roomType: "Treatment" })}
                >
                  Any room of a type
                </Button>
                <Button
                  type="button"
                  variant={roomRequirement?.mode === "specific" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRoomRequirement({ mode: "specific", roomIds: [] })}
                >
                  Specific room(s)
                </Button>
                {roomRequirement && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRoomRequirement(null)}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {roomRequirement?.mode === "any_of_type" && (
                <Select
                  value={roomRequirement.roomType}
                  onValueChange={(value) =>
                    setRoomRequirement({ mode: "any_of_type", roomType: value })
                  }
                >
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Room type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Treatment">Treatment</SelectItem>
                    <SelectItem value="Consultation">Consultation</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {roomRequirement?.mode === "specific" && (
                <div className="grid grid-cols-2 gap-1.5">
                  {rooms.map((r) => {
                    const checked = roomRequirement.roomIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() =>
                          setRoomRequirement({
                            mode: "specific",
                            roomIds: checked
                              ? roomRequirement.roomIds.filter((id) => id !== r.id)
                              : [...roomRequirement.roomIds, r.id],
                          })
                        }
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                          checked
                            ? "bg-primary/10 border-primary/30 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                        }`}
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                            checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                          }`}
                        >
                          {checked && <Check className="h-2.5 w-2.5 text-white" />}
                        </span>
                        {r.name}
                      </button>
                    );
                  })}
                  {rooms.length === 0 && (
                    <p className="text-xs text-muted-foreground col-span-2">
                      No rooms configured yet — add some in the Rooms tab.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label>Equipment requirements</Label>
                  <p className="text-xs text-muted-foreground">
                    Optional. Each row needs one of the selected machines (e.g. "Laser A or Laser
                    B").
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEquipmentRequirements((r) => [...r, { equipmentIds: [] }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-3">
                {equipmentRequirements.map((req, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Needs 1 of:</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          setEquipmentRequirements((r) => r.filter((_, idx) => idx !== i))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {equipment.map((eq) => {
                        const checked = req.equipmentIds.includes(eq.id);
                        return (
                          <button
                            key={eq.id}
                            type="button"
                            onClick={() =>
                              setEquipmentRequirements((rows) =>
                                rows.map((row, idx) =>
                                  idx === i
                                    ? {
                                        equipmentIds: checked
                                          ? row.equipmentIds.filter((id) => id !== eq.id)
                                          : [...row.equipmentIds, eq.id],
                                      }
                                    : row,
                                ),
                              )
                            }
                            className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                              checked
                                ? "bg-primary/10 border-primary/30 text-primary font-medium"
                                : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                            }`}
                          >
                            <span
                              className={`h-3.5 w-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                                checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                              }`}
                            >
                              {checked && <Check className="h-2.5 w-2.5 text-white" />}
                            </span>
                            {eq.name}{" "}
                            <span className="text-muted-foreground text-xs">({eq.type})</span>
                          </button>
                        );
                      })}
                      {equipment.length === 0 && (
                        <p className="text-xs text-muted-foreground col-span-2">
                          No equipment configured yet — add some in the Equipment tab.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {equipmentRequirements.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No equipment required for this service.
                  </p>
                )}
              </div>
            </div>
            <div className="border-t pt-4">
              <Label className="mb-2 block">Required forms</Label>
              <p className="text-xs text-muted-foreground mb-2">
                In-house forms built in the Forms section. Clients see these tied to this service.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {availableForms.map((f) => {
                  const checked = attachedFormIds.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        setAttachedFormIds((ids) =>
                          checked ? ids.filter((id) => id !== f.id) : [...ids, f.id],
                        )
                      }
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                        checked
                          ? "bg-primary/10 border-primary/30 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`h-3.5 w-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                          checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}
                      >
                        {checked && <Check className="h-2.5 w-2.5 text-white" />}
                      </span>
                      {f.name}
                    </button>
                  );
                })}
                {availableForms.length === 0 && (
                  <p className="text-xs text-muted-foreground col-span-2">
                    No forms created yet — add some in the Forms section.
                  </p>
                )}
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label>Add-ons</Label>
                  <p className="text-xs text-muted-foreground">
                    Optional upsells the AI can offer when a client books this service (e.g. "LED
                    Light Therapy").
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setAddOns((rows) => [
                      ...rows,
                      {
                        name: "",
                        description: null,
                        price: null,
                        durationMinutes: 0,
                        status: "Active",
                      },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-3">
                {addOns.map((addon, i) => (
                  <div key={addon.id ?? i} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Add-on name"
                          value={addon.name}
                          onChange={(e) =>
                            setAddOns((rows) =>
                              rows.map((r, idx) =>
                                idx === i ? { ...r, name: e.target.value } : r,
                              ),
                            )
                          }
                        />
                        <Input
                          placeholder="Description (optional)"
                          value={addon.description ?? ""}
                          onChange={(e) =>
                            setAddOns((rows) =>
                              rows.map((r, idx) =>
                                idx === i ? { ...r, description: e.target.value || null } : r,
                              ),
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-2"
                        onClick={() => setAddOns((rows) => rows.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div>
                        <Label className="text-xs">Price ($)</Label>
                        <Input
                          type="number"
                          placeholder="Optional"
                          value={addon.price ?? ""}
                          onChange={(e) =>
                            setAddOns((rows) =>
                              rows.map((r, idx) =>
                                idx === i
                                  ? {
                                      ...r,
                                      price: e.target.value === "" ? null : Number(e.target.value),
                                    }
                                  : r,
                              ),
                            )
                          }
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Extra duration (min)</Label>
                        <Input
                          type="number"
                          value={String(addon.durationMinutes ?? 0)}
                          onChange={(e) =>
                            setAddOns((rows) =>
                              rows.map((r, idx) =>
                                idx === i ? { ...r, durationMinutes: Number(e.target.value) } : r,
                              ),
                            )
                          }
                          className="mt-1"
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border px-3 h-9">
                        <Label className="mb-0 text-xs">Active</Label>
                        <Switch
                          checked={addon.status !== "Inactive"}
                          onCheckedChange={(checked) =>
                            setAddOns((rows) =>
                              rows.map((r, idx) =>
                                idx === i ? { ...r, status: checked ? "Active" : "Inactive" } : r,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {addOns.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No add-ons configured for this service.
                  </p>
                )}
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label>Offers</Label>
                  <p className="text-xs text-muted-foreground">
                    Discounts off this service&apos;s Rate Card price above. The AI only mentions an
                    offer while it&apos;s ON and within its scheduled window, if set.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOffers((rows) => [
                      ...rows,
                      {
                        name: "",
                        discountType: "percentage",
                        discountValue: 0,
                        enabled: true,
                        startsAt: null,
                        endsAt: null,
                      },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-3">
                {offers.map((offerRow, i) => {
                  const preview =
                    form.price != null
                      ? applyDiscount(form.price, offerRow.discountType, offerRow.discountValue)
                      : null;
                  return (
                    <div key={offerRow.id ?? i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Input
                          placeholder="Offer name (e.g. Summer Special)"
                          value={offerRow.name}
                          onChange={(e) =>
                            setOffers((rows) =>
                              rows.map((r, idx) =>
                                idx === i ? { ...r, name: e.target.value } : r,
                              ),
                            )
                          }
                          className="flex-1"
                        />
                        <div className="flex items-center gap-2 ml-2">
                          <Switch
                            checked={offerRow.enabled}
                            onCheckedChange={(checked) =>
                              setOffers((rows) =>
                                rows.map((r, idx) => (idx === i ? { ...r, enabled: checked } : r)),
                              )
                            }
                          />
                          <span className="text-xs text-muted-foreground w-6">
                            {offerRow.enabled ? "ON" : "OFF"}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setOffers((rows) => rows.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 items-end">
                        <div>
                          <Label className="text-xs">Discount type</Label>
                          <Select
                            value={offerRow.discountType}
                            onValueChange={(value) =>
                              setOffers((rows) =>
                                rows.map((r, idx) =>
                                  idx === i
                                    ? { ...r, discountType: value as "percentage" | "fixed" }
                                    : r,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="w-full h-9 mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">Percentage</SelectItem>
                              <SelectItem value="fixed">Fixed ($)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">
                            {offerRow.discountType === "percentage"
                              ? "Discount (%)"
                              : "Discount ($)"}
                          </Label>
                          <Input
                            type="number"
                            value={String(offerRow.discountValue)}
                            onChange={(e) =>
                              setOffers((rows) =>
                                rows.map((r, idx) =>
                                  idx === i ? { ...r, discountValue: Number(e.target.value) } : r,
                                ),
                              )
                            }
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Starts (optional)</Label>
                          <Input
                            type="datetime-local"
                            value={offerRow.startsAt ?? ""}
                            onChange={(e) =>
                              setOffers((rows) =>
                                rows.map((r, idx) =>
                                  idx === i ? { ...r, startsAt: e.target.value || null } : r,
                                ),
                              )
                            }
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Ends (optional)</Label>
                          <Input
                            type="datetime-local"
                            value={offerRow.endsAt ?? ""}
                            onChange={(e) =>
                              setOffers((rows) =>
                                rows.map((r, idx) =>
                                  idx === i ? { ...r, endsAt: e.target.value || null } : r,
                                ),
                              )
                            }
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {form.price == null
                          ? "Set a Price above to preview the offer price."
                          : `Offer price: $${preview} (rate card $${form.price})`}
                      </p>
                    </div>
                  );
                })}
                {offers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No offers configured for this service.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Current plan</div>
          <div className="text-xl font-semibold mt-0.5">Lumière Pro</div>
          <div className="text-sm text-muted-foreground mt-1">$149 / month · billed monthly</div>
        </div>
        <Button variant="outline">Manage plan</Button>
      </div>
      <div className="border-t mt-5 pt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground text-xs">Next invoice</div>
          <div className="font-medium mt-0.5">July 1, 2026</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Payment method</div>
          <div className="font-medium mt-0.5">Visa •• 4242</div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [roomsList, setRoomsList] = useState<RoomItem[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setAccessDenied(null);
    try {
      const res = await fetch("/api/settings");
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEquipment = useCallback(async () => {
    setEquipmentLoading(true);
    try {
      const res = await fetch("/api/settings/equipment");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setEquipment(json.equipment ?? []);
    } catch {
      toast.error("Failed to load equipment");
    } finally {
      setEquipmentLoading(false);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    setServicesLoading(true);
    try {
      const res = await fetch("/api/settings/services");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setServices(json.services ?? []);
    } catch {
      toast.error("Failed to load services");
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const res = await fetch("/api/settings/rooms");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRoomsList(json.rooms ?? []);
    } catch {
      toast.error("Failed to load rooms");
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchSettings(), fetchEquipment(), fetchServices(), fetchRooms()]);
  }, [fetchSettings, fetchEquipment, fetchServices, fetchRooms]);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setDialogOpen(true);
  };

  const handleSaved = (member: TeamMember) => {
    setData((d) => {
      if (!d) return d;
      const exists = d.team.some((m) => m.id === member.id);
      return {
        ...d,
        team: exists ? d.team.map((m) => (m.id === member.id ? member : m)) : [...d.team, member],
      };
    });
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    setData(
      (d) =>
        d && { ...d, team: d.team.map((m) => (m.id === id ? { ...m, status: newStatus } : m)) },
    );
  };

  const clinic = data?.clinic ?? DEFAULT_CLINIC;
  const channels = data?.channels ?? {};
  const team = data?.team ?? [];

  if (accessDenied) {
    return (
      <div className="space-y-5 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage clinic, rooms, channels, team and billing.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchSettings} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Tabs defaultValue="clinic">
        <TabsList>
          <TabsTrigger value="clinic">Clinic info</TabsTrigger>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic" className="mt-4">
          {loading ? (
            <div className="rounded-lg border bg-card p-6 space-y-4 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="h-3 bg-muted rounded w-20 mb-2" />
                  <div className="h-9 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (
            <ClinicTab
              initial={clinic}
              onSaved={(updated) => setData((d) => d && { ...d, clinic: updated })}
            />
          )}
        </TabsContent>

        <TabsContent value="rooms" className="mt-4">
          {roomsLoading ? (
            <div className="rounded-lg border bg-card p-6 space-y-4 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          ) : (
            <RoomsTab rooms={roomsList} onSaved={(rooms) => setRoomsList(rooms)} />
          )}
        </TabsContent>

        <TabsContent value="equipment" className="mt-4">
          {equipmentLoading ? (
            <div className="rounded-lg border bg-card p-6 space-y-4 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          ) : (
            <EquipmentTab
              equipment={equipment}
              rooms={roomsList.filter((r) => r.status === "Active").map((r) => r.name)}
              onSaved={(eq) => setEquipment(eq)}
            />
          )}
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          {servicesLoading ? (
            <div className="rounded-lg border bg-card p-6 space-y-4 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          ) : (
            <ServicesTab
              services={services}
              equipment={equipment}
              rooms={roomsList}
              onSaved={(servicesData) => setServices(servicesData)}
            />
          )}
        </TabsContent>

        <TabsContent value="channels" className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-card p-5 animate-pulse">
                  <div className="h-4 bg-muted rounded w-32 mb-2" />
                  <div className="h-3 bg-muted rounded w-48" />
                </div>
              ))}
            </div>
          ) : (
            <ChannelsTab channels={channels} />
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <TeamTab
            team={team}
            loading={loading}
            onAdd={openAdd}
            onEdit={openEdit}
            onStatusChange={handleStatusChange}
          />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <BillingTab />
        </TabsContent>
      </Tabs>

      <PractitionerDialog
        open={dialogOpen}
        editing={editing}
        services={services}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
