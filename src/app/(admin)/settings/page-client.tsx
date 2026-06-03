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
}

interface SettingsData {
  clinic: ClinicSettings | null;
  channels: Record<string, ChannelStatus>;
  team: TeamMember[];
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
  const blank = { name: "", email: "", role: "", color: PRESET_COLORS[0] };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(
      editing
        ? { name: editing.name, email: editing.email, role: editing.role, color: editing.color }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, open]);

  const field = (key: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        "/api/practitioners",
        editing
          ? {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: editing.id, ...form }),
            }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form),
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit team member" : "Add team member"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={field("name")} className="mt-1.5" />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={field("email")}
              className="mt-1.5"
              placeholder="name@clinic.com"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Input
              value={form.role}
              onChange={field("role")}
              className="mt-1.5"
              placeholder="e.g. Injector, Esthetician, Admin"
            />
          </div>
          <div>
            <Label>Calendar color</Label>
            <div className="flex gap-2 mt-1.5 flex-wrap">
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
  onDelete,
}: {
  team: TeamMember[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (m: TeamMember) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmMember, setConfirmMember] = useState<TeamMember | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!confirmMember) return;
    const id = confirmMember.id;
    setConfirmMember(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/practitioners?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDelete(id);
      toast.success("Team member removed");
    } catch {
      toast.error("Failed to delete team member");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5">Email</th>
              <th className="text-left font-medium px-4 py-2.5">Role</th>
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
                  <div className="h-3 bg-muted rounded w-40" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-5 bg-muted rounded w-20" />
                </td>
                <td className="px-4 py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add team member
        </Button>
      </div>

      {team.length === 0 ? (
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
                <th className="text-left font-medium px-4 py-2.5">Email</th>
                <th className="text-left font-medium px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {team.map((m) => (
                <tr key={m.id} className="group">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                      {m.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.email || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] px-2 py-0.5 rounded-md border bg-secondary">
                      {m.role || "Staff"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
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
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setConfirmMember(m)}
                        disabled={deletingId === m.id}
                      >
                        {deletingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm delete dialog */}
      <Dialog open={!!confirmMember} onOpenChange={(o) => !o && setConfirmMember(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove team member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{confirmMember?.name}</span> will be
            permanently removed from the team. This cannot be undone.
          </p>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setConfirmMember(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  const handleDelete = (id: string) => {
    setData((d) => d && { ...d, team: d.team.filter((m) => m.id !== id) });
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
            Manage clinic, channels, team and billing.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchSettings} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Tabs defaultValue="clinic">
        <TabsList>
          <TabsTrigger value="clinic">Clinic info</TabsTrigger>
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
            onDelete={handleDelete}
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
