"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Check, X, RefreshCw, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ClinicSettings {
  recordId: string | null;
  clinicName: string;
  timezone: string;
  address: string;
  businessHours: string;
}

interface ChannelStatus {
  connected: boolean;
  label: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  specialty?: string;
  bio?: string;
  status?: string;
}

interface SettingsData {
  clinic: ClinicSettings | null;
  channels: Record<string, ChannelStatus>;
  team: TeamMember[];
  rooms?: string[];
}

const DEFAULT_CLINIC: ClinicSettings = {
  recordId: null,
  clinicName: "",
  timezone: "America/Chicago",
  address: "",
  businessHours: "",
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
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function formatSpecialties(arr: string[]): string {
  return arr.join(", ");
}

// ── Clinic tab ────────────────────────────────────────────────────────────────
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
          <Input value={form.timezone} onChange={field("timezone")} className="mt-1.5" />
        </div>
        <div className="col-span-2">
          <Label>Address</Label>
          <Input value={form.address} onChange={field("address")} className="mt-1.5" />
        </div>
        <div className="col-span-2">
          <Label>Business hours</Label>
          <Input
            value={form.businessHours}
            onChange={field("businessHours")}
            className="mt-1.5"
            placeholder="e.g. Mon–Sat · 9am – 7pm"
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

// ── Channels tab ──────────────────────────────────────────────────────────────
function ChannelsTab({ channels }: { channels: Record<string, ChannelStatus> }) {
  const entries = Object.entries(channels);

  return (
    <div className="space-y-4">
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

// ── Practitioner dialog ───────────────────────────────────────────────────────
function PractitionerDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: TeamMember | null;
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
      toast.success(editing ? "Practitioner updated" : "Practitioner added");
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

        <div className="space-y-4 py-2 overflow-y-auto pr-4 flex-1">
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

// ── Team tab ──────────────────────────────────────────────────────────────────
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
        body: JSON.stringify({ id, status: "Away" }),
      });
      if (!res.ok) throw new Error();
      onStatusChange(id, "Away");
      toast.success("Team member deactivated");
    } catch {
      toast.error("Failed to deactivate team member");
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
                <td className="px-4 py-3"><div className="h-3 bg-muted rounded w-32" /></td>
                <td className="px-4 py-3"><div className="h-5 bg-muted rounded w-20" /></td>
                <td className="px-4 py-3"><div className="h-3 bg-muted rounded w-28" /></td>
                <td className="px-4 py-3"><div className="h-5 bg-muted rounded w-16" /></td>
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
            {m.email && (
              <div className="text-xs text-muted-foreground font-normal">{m.email}</div>
            )}
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
              {actionId === m.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Reactivate"
              )}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit(m)}
              >
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
              {active.map((m) => <MemberRow key={m.id} m={m} />)}
              {showInactive && inactive.map((m) => <MemberRow key={m.id} m={m} isInactive />)}
            </tbody>
          </table>
          {inactive.length > 0 && (
            <div className="border-t px-4 py-2.5">
              <button
                onClick={() => setShowInactive((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showInactive ? "Hide" : "Show"} {inactive.length} inactive member{inactive.length > 1 ? "s" : ""}
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
            marked as inactive and removed from appointment scheduling. You can reactivate them any time.
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

// ── Rooms tab ────────────────────────────────────────────────────────────────
function RoomsTab({
  rooms,
  onSaved,
}: {
  rooms: string[];
  onSaved: (rooms: string[]) => void;
}) {
  const [form, setForm] = useState<string[]>(rooms);
  const [saving, setSaving] = useState(false);
  const [newRoom, setNewRoom] = useState("");

  useEffect(() => {
    setForm(rooms);
  }, [rooms]);

  const addRoom = () => {
    if (newRoom.trim() && !form.includes(newRoom.trim())) {
      const updated = [...form, newRoom.trim()].sort();
      setForm(updated);
      setNewRoom("");
    }
  };

  const removeRoom = (room: string) => {
    setForm(form.filter((r) => r !== room));
  };

  const save = async () => {
    if (form.length === 0) {
      toast.error("At least one room is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: form }),
      });
      if (!res.ok) throw new Error();
      onSaved(form);
      toast.success("Rooms updated");
    } catch {
      toast.error("Failed to save rooms");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-medium mb-3">Clinic Rooms</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Define which rooms are available for appointments. Rooms must be unique and will be used across the booking system.
        </p>

        {form.length > 0 && (
          <div className="mb-4">
            <label className="text-xs text-muted-foreground block mb-2">Active rooms</label>
            <div className="space-y-2">
              {form.map((room) => (
                <div key={room} className="flex items-center justify-between bg-muted/40 px-3 py-2 rounded-md">
                  <span className="text-sm font-medium">{room}</span>
                  <button
                    onClick={() => removeRoom(room)}
                    className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 pt-3 border-t">
          <label className="text-xs text-muted-foreground block">Add new room</label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Room 3, VIP Suite, Laser Room"
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRoom()}
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addRoom}
              disabled={!newRoom.trim() || form.includes(newRoom.trim())}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setForm(rooms)} disabled={saving}>
          Reset
        </Button>
        <Button onClick={save} disabled={saving || JSON.stringify(form) === JSON.stringify(rooms)}>
          {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Save rooms
        </Button>
      </div>
    </div>
  );
}

// ── Billing tab ───────────────────────────────────────────────────────────────
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

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
    setData((d) =>
      d && { ...d, team: d.team.map((m) => m.id === id ? { ...m, status: newStatus } : m) },
    );
  };

  const clinic = data?.clinic ?? DEFAULT_CLINIC;
  const channels = data?.channels ?? {};
  const team = data?.team ?? [];

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
          {loading ? (
            <div className="rounded-lg border bg-card p-6 space-y-4 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          ) : (
            <RoomsTab
              rooms={data?.rooms ?? ["Room 1", "Room 2"]}
              onSaved={(rooms) => setData((d) => d && { ...d, rooms })}
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
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
