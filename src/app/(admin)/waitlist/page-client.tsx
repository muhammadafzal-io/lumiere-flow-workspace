"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Loader2, CalendarSearch, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { AccessGate } from "@/components/rbac/AccessGate";

type WaitlistStatus = "Waiting" | "Contacted" | "Booked" | "Cancelled";

interface WaitlistEntry {
  id: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  treatment: string;
  preferredDate: string;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  preferredPractitionerName: string | null;
  flexibility: string | null;
  status: WaitlistStatus;
  notes: string | null;
  createdAt: string;
}

const STATUS_OPTIONS: WaitlistStatus[] = ["Waiting", "Contacted", "Booked", "Cancelled"];

const STATUS_PILL: Record<WaitlistStatus, string> = {
  Waiting: "bg-warning/15 text-warning-foreground border-warning/30",
  Contacted: "bg-info/10 text-info border-info/20",
  Booked: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-muted text-muted-foreground border-border",
};

function statusPillClass(status: WaitlistStatus): string {
  return `inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${STATUS_PILL[status]}`;
}

function formatDate(iso: string): string {
  // preferred_date is a plain date (YYYY-MM-DD) — parse as local, not UTC, so it never
  // displays a day off from what was actually saved.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatPreferred(entry: WaitlistEntry): string {
  const date = formatDate(entry.preferredDate);
  if (!entry.preferredTimeStart) return date;
  const start = formatTime(entry.preferredTimeStart);
  if (!entry.preferredTimeEnd) return `${date} · ${start}`;
  return `${date} · ${start}–${formatTime(entry.preferredTimeEnd)}`;
}

interface AddForm {
  clientName: string;
  phone: string;
  email: string;
  treatment: string;
  preferredDate: string;
  preferredTimeStart: string;
  preferredTimeEnd: string;
  preferredPractitionerName: string;
  flexibility: string;
  notes: string;
}

const BLANK_FORM: AddForm = {
  clientName: "",
  phone: "",
  email: "",
  treatment: "",
  preferredDate: "",
  preferredTimeStart: "",
  preferredTimeEnd: "",
  preferredPractitionerName: "",
  flexibility: "",
  notes: "",
};

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);
  const [statusFilter, setStatusFilter] = useState<WaitlistStatus | "all">("Waiting");
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AddForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async (status: WaitlistStatus | "all") => {
    setLoading(true);
    setAccessDenied(null);
    try {
      const url = status === "all" ? "/api/waitlist" : `/api/waitlist?status=${status}`;
      const res = await fetch(url);
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error();
      const json = await res.json();
      setEntries(json.entries ?? []);
    } catch {
      toast.error("Failed to load waitlist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEntries(statusFilter);
  }, [fetchEntries, statusFilter]);

  const changeStatus = async (id: string, status: WaitlistStatus) => {
    try {
      const res = await fetch(`/api/waitlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Marked ${status}`);
      void fetchEntries(statusFilter);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const checkNow = async (entry: WaitlistEntry) => {
    setCheckingId(entry.id);
    try {
      const params = new URLSearchParams({ date: entry.preferredDate, treatment: entry.treatment });
      if (entry.preferredPractitionerName) {
        params.set("practitioners", entry.preferredPractitionerName);
      }
      const res = await fetch(`/api/calendar/slots?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const count = json.slots?.length ?? 0;
      if (count === 0) {
        toast.info(
          `Still nothing open on ${formatDate(entry.preferredDate)} for ${entry.treatment}.`,
        );
      } else {
        toast.success(
          `${count} open slot${count === 1 ? "" : "s"} on ${formatDate(entry.preferredDate)} for ${entry.treatment} — worth reaching out.`,
        );
      }
    } catch {
      toast.error("Couldn't check availability");
    } finally {
      setCheckingId(null);
    }
  };

  const startAdd = () => {
    setForm(BLANK_FORM);
    setDialogOpen(true);
  };

  const field =
    (key: keyof AddForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (
      !form.clientName.trim() ||
      !form.phone.trim() ||
      !form.treatment.trim() ||
      !form.preferredDate
    ) {
      toast.error("Client name, phone, treatment, and preferred date are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: form.clientName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          treatment: form.treatment.trim(),
          preferredDate: form.preferredDate,
          preferredTimeStart: form.preferredTimeStart || undefined,
          preferredTimeEnd: form.preferredTimeEnd || undefined,
          preferredPractitionerName: form.preferredPractitionerName.trim() || undefined,
          flexibility: form.flexibility.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to add to waitlist");
      }
      toast.success("Added to waitlist");
      setDialogOpen(false);
      void fetchEntries(statusFilter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to waitlist");
    } finally {
      setSaving(false);
    }
  };

  if (accessDenied) {
    return (
      <div className="space-y-5 max-w-5xl">
        <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Requests for a slot that wasn&apos;t available — from the AI agent or added by hand for
            a phone call or walk-in.
          </p>
        </div>
        <Button onClick={startAdd}>
          <Plus className="h-4 w-4 mr-1.5" /> Add to waitlist
        </Button>
      </div>

      <Select
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as WaitlistStatus | "all")}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Treatment</th>
              <th className="px-4 py-3">Preferred</th>
              <th className="px-4 py-3">Practitioner</th>
              <th className="px-4 py-3">Flexibility</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{entry.clientName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                    {entry.clientPhone && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {entry.clientPhone}
                      </div>
                    )}
                    {entry.clientEmail && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {entry.clientEmail}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">{entry.treatment}</td>
                <td className="px-4 py-3">{formatPreferred(entry)}</td>
                <td className="px-4 py-3">{entry.preferredPractitionerName || "No preference"}</td>
                <td className="px-4 py-3 max-w-[220px] truncate" title={entry.flexibility ?? ""}>
                  {entry.flexibility || "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={statusPillClass(entry.status)}>{entry.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      disabled={checkingId === entry.id}
                      onClick={() => checkNow(entry)}
                    >
                      {checkingId === entry.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CalendarSearch className="h-3 w-3 mr-1" />
                      )}
                      Check now
                    </Button>
                    <Select
                      value={entry.status}
                      onValueChange={(v) => changeStatus(entry.id, v as WaitlistStatus)}
                    >
                      <SelectTrigger className="h-7 w-28 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No waitlist entries for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add to waitlist</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Full name</Label>
                <Input value={form.clientName} onChange={field("clientName")} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={field("phone")} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Email (optional)</Label>
              <Input value={form.email} onChange={field("email")} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Treatment</Label>
              <Input value={form.treatment} onChange={field("treatment")} className="mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Preferred date</Label>
                <Input
                  type="date"
                  value={form.preferredDate}
                  onChange={field("preferredDate")}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Time (optional)</Label>
                <Input
                  type="time"
                  value={form.preferredTimeStart}
                  onChange={field("preferredTimeStart")}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Until (optional)</Label>
                <Input
                  type="time"
                  value={form.preferredTimeEnd}
                  onChange={field("preferredTimeEnd")}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Preferred practitioner (optional)</Label>
              <Input
                value={form.preferredPractitionerName}
                onChange={field("preferredPractitionerName")}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Flexibility (optional)</Label>
              <Textarea
                placeholder="e.g. also open Saturday morning, any time that day works"
                value={form.flexibility}
                onChange={field("flexibility")}
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={form.notes} onChange={field("notes")} className="mt-1" rows={2} />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to waitlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
