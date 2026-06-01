"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, X, RefreshCw, Loader2 } from "lucide-react";
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

  // Sync if parent re-fetches
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
            placeholder="e.g. Tue – Sat · 10am – 7pm"
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

  const sendTest = async () => {
    toast.info("Test message queued — check connected channels");
  };

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
              <div className="text-sm text-muted-foreground mt-0.5 capitalize">
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
      <Button variant="outline" onClick={sendTest}>
        Send test message
      </Button>
    </div>
  );
}

// ── Team tab ──────────────────────────────────────────────────────────────────
function TeamTab({ team, loading }: { team: TeamMember[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5">Email</th>
              <th className="text-left font-medium px-4 py-2.5">Role</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (team.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        No practitioners found. Add them to the{" "}
        <span className="font-medium text-foreground">Practitioners</span> table in Airtable.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground bg-muted/40">
          <tr>
            <th className="text-left font-medium px-4 py-2.5">Name</th>
            <th className="text-left font-medium px-4 py-2.5">Email</th>
            <th className="text-left font-medium px-4 py-2.5">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {team.map((m) => (
            <tr key={m.id}>
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
            </tr>
          ))}
        </tbody>
      </table>
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
          <TeamTab team={team} loading={loading} />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <BillingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
