"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Download, Plus, MoreHorizontal, RefreshCw, Pencil, Loader2 } from "lucide-react";
import type { Customer } from "@/lib/types";
import { toast } from "sonner";

function statusPill(s: string) {
  const map: Record<string, string> = {
    Active: "bg-success/10 text-success border-success/20",
    Dormant: "bg-warning/15 text-warning-foreground border-warning/30",
    VIP: "bg-primary/10 text-primary border-primary/20",
    New: "bg-info/10 text-info border-info/20",
    "No-show": "bg-destructive/10 text-destructive border-destructive/20",
    Discard: "bg-muted text-muted-foreground border-border",
  };
  return `inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${map[s] ?? map["Discard"]}`;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-4 py-3">
            <div className="h-3 w-3 rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 rounded bg-muted w-28" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 rounded bg-muted w-24" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 rounded bg-muted w-32" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 rounded bg-muted w-20" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 rounded bg-muted w-8 ml-auto" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 rounded bg-muted w-12 ml-auto" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 rounded bg-muted w-20" />
          </td>
          <td className="px-4 py-3">
            <div className="h-5 rounded bg-muted w-14" />
          </td>
          <td className="px-2 py-3" />
        </tr>
      ))}
    </>
  );
}

interface AddCustomerForm {
  name: string;
  phone: string;
  email: string;
  birthday: string;
  status: string;
  notes: string;
  treatmentInterest: string;
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

const EMPTY_FORM: AddCustomerForm = {
  name: "",
  phone: "",
  email: "",
  birthday: "",
  status: "Active",
  notes: "",
  treatmentInterest: "",
};

function customerToEditForm(c: Customer): EditForm {
  return {
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    birthday: c.birthday ?? "",
    status: c.status,
    notes: c.notes ?? "",
    treatmentInterest: c.treatments.join(", "),
  };
}

function CustomerSheet({
  customer,
  onClose,
  onUpdated,
}: {
  customer: Customer | null;
  onClose: () => void;
  onUpdated: (updated: Customer) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setForm(customerToEditForm(customer));
      setEditMode(false);
    }
  }, [customer]);

  const field =
    (key: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!customer) return;
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: customer.id, ...form }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onUpdated(data.customer);
      setEditMode(false);
      toast.success("Customer updated");
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (customer) setForm(customerToEditForm(customer));
    setEditMode(false);
  };

  return (
    <Sheet open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        {customer && (
          <>
            <SheetHeader className="flex flex-row items-start justify-between pr-8">
              <SheetTitle className="text-xl">
                {editMode ? (
                  <Input
                    value={form.name}
                    onChange={field("name")}
                    className="text-xl font-semibold h-auto py-0.5 -ml-1"
                  />
                ) : (
                  customer.name
                )}
              </SheetTitle>
              {!editMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => setEditMode(true)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
            </SheetHeader>

            {/* ── Contact info ── */}
            {editMode ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input
                      value={form.phone}
                      onChange={field("phone")}
                      className="mt-1"
                      placeholder="+1 555 000 0000"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input
                      value={form.email}
                      onChange={field("email")}
                      className="mt-1"
                      placeholder="email@example.com"
                    />
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
                      onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
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
              <div className="mt-4 space-y-1 text-sm">
                {customer.email && <div className="text-muted-foreground">{customer.email}</div>}
                {customer.phone && <div className="text-muted-foreground">{customer.phone}</div>}
                {customer.birthday && (
                  <div className="text-muted-foreground">
                    Birthday{" "}
                    {isNaN(new Date(customer.birthday).getTime())
                      ? customer.birthday
                      : new Date(customer.birthday).toLocaleDateString()}
                  </div>
                )}
                <div className="pt-2">
                  <span className={statusPill(customer.status)}>{customer.status}</span>
                </div>
              </div>
            )}

            {/* ── Stats ── */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <div className="rounded-md border p-3">
                <div className="text-[11px] text-muted-foreground">Lifetime value</div>
                <div className="text-base font-semibold mt-0.5">
                  {customer.lifetime_value > 0
                    ? `$${customer.lifetime_value.toLocaleString()}`
                    : "—"}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-[11px] text-muted-foreground">Visits</div>
                <div className="text-base font-semibold mt-0.5">{customer.total_visits || "—"}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-[11px] text-muted-foreground">Last visit</div>
                <div className="text-base font-semibold mt-0.5">
                  {customer.last_visit ? new Date(customer.last_visit).toLocaleDateString() : "—"}
                </div>
              </div>
            </div>

            {/* ── Treatments ── */}
            {!editMode && customer.treatments.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Treatments
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

            {/* ── Tabs ── */}
            <Tabs defaultValue="visits" className="mt-5">
              <TabsList>
                <TabsTrigger value="visits">Visits</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="visits" className="mt-3">
                {customer.visits.length > 0 ? (
                  <div className="rounded-md border divide-y text-sm">
                    {customer.visits.slice(0, 12).map((v, i) => (
                      <div key={i} className="px-3 py-2 flex justify-between">
                        <span>{new Date(v.date).toLocaleDateString()}</span>
                        <span className="text-muted-foreground">{v.treatment}</span>
                        {v.spend > 0 && <span className="font-medium">${v.spend}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
                    No visit history available.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-3">
                {customer.payments.length > 0 ? (
                  <div className="rounded-md border divide-y text-sm">
                    {customer.payments.slice(0, 12).map((p, i) => (
                      <div key={i} className="px-3 py-2 flex justify-between">
                        <span>{new Date(p.date).toLocaleDateString()}</span>
                        <span className="text-muted-foreground">{p.method}</span>
                        <span className="font-medium">${p.amount}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
                    No payment history available.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="notes" className="mt-3">
                {editMode ? (
                  <Textarea
                    value={form.notes}
                    onChange={field("notes")}
                    placeholder="Notes about this customer…"
                    rows={5}
                    className="text-sm"
                  />
                ) : (
                  <div className="rounded-md border p-3 min-h-[80px] text-sm">
                    {customer.notes || <span className="text-muted-foreground">No notes yet.</span>}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* ── Edit actions ── */}
            {editMode && (
              <div className="flex gap-2 mt-6 pt-4 border-t">
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Save changes
                </Button>
                <Button variant="outline" onClick={cancel} disabled={saving}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [last, setLast] = useState("any");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [confirmCustomer, setConfirmCustomer] = useState<Customer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<AddCustomerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/customers?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCustomers(data.customers ?? []);
    } catch {
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (q && !`${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      if (!c.last_visit) return last === "any";
      const days = (Date.now() - new Date(c.last_visit).getTime()) / 86400000;
      if (last === "30") return days <= 30;
      if (last === "30-90") return days > 30 && days <= 90;
      if (last === "90") return days > 90;
      return true;
    });
  }, [customers, q, last]);

  const exportCsv = () => {
    const rows = [
      ["Name", "Phone", "Email", "Last visit", "Total visits", "LTV", "Status"],
      ...filtered.map((c) => [
        c.name,
        c.phone,
        c.email,
        c.last_visit,
        c.total_visits,
        c.lifetime_value,
        c.status,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const addCustomer = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCustomers((prev) => [data.customer, ...prev]);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      toast.success("Customer added");
    } catch {
      toast.error("Failed to add customer");
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomer = async () => {
    if (!confirmCustomer) return;
    const c = confirmCustomer;
    setConfirmCustomer(null);
    try {
      const res = await fetch(`/api/customers?id=${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCustomers((prev) => prev.filter((x) => x.id !== c.id));
      if (selected?.id === c.id) setSelected(null);
      toast.success("Customer deleted");
    } catch {
      toast.error("Failed to delete customer");
    }
  };

  const handleUpdated = (updated: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSelected(updated);
  };

  const activeCount = customers.filter((c) => c.status === "Active").length;
  const vipCount = customers.filter((c) => c.status === "VIP").length;
  const dormantCount = customers.filter((c) => c.status === "Dormant").length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {customers.length} total · {activeCount} active · {vipCount} VIP · {dormantCount}{" "}
            dormant
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchCustomers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add customer
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center rounded-lg border bg-card p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, email…"
            className="pl-9 h-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Dormant">Dormant</SelectItem>
            <SelectItem value="VIP">VIP</SelectItem>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="No-show">No-show</SelectItem>
          </SelectContent>
        </Select>
        <Select value={last} onValueChange={setLast}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any time</SelectItem>
            <SelectItem value="30">Within 30 days</SelectItem>
            <SelectItem value="30-90">30 – 90 days</SelectItem>
            <SelectItem value="90">90+ days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40 sticky top-0">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 w-8"></th>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">Phone</th>
                <th className="text-left font-medium px-4 py-2.5">Email</th>
                <th className="text-left font-medium px-4 py-2.5">Last visit</th>
                <th className="text-right font-medium px-4 py-2.5">Visits</th>
                <th className="text-right font-medium px-4 py-2.5">LTV</th>
                <th className="text-left font-medium px-4 py-2.5">Treatment</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <SkeletonRows />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm text-muted-foreground">
                    No customers match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.phone || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.email || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">{c.total_visits}</td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {c.lifetime_value > 0 ? `$${c.lifetime_value.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.treatments[0] || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={statusPill(c.status)}>{c.status}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelected(c)}>
                            View profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmCustomer(c);
                            }}
                            className="text-destructive"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer profile slide-over */}
      <CustomerSheet
        customer={selected}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
      />

      {/* Confirm delete dialog */}
      <Dialog open={!!confirmCustomer} onOpenChange={(o) => !o && setConfirmCustomer(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete customer?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{confirmCustomer?.name}</span> will be
            permanently deleted. This cannot be undone.
          </p>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setConfirmCustomer(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteCustomer}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add customer dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input
                className="mt-1.5"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input
                  className="mt-1.5"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 555 000 0000"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  className="mt-1.5"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Birthday</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={form.birthday}
                  onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="VIP">VIP</SelectItem>
                    <SelectItem value="Dormant">Dormant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Treatment interest</Label>
              <Input
                className="mt-1.5"
                value={form.treatmentInterest}
                onChange={(e) => setForm((f) => ({ ...f, treatmentInterest: e.target.value }))}
                placeholder="e.g. Botox, HydraFacial"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1.5"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this customer…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addCustomer} disabled={saving}>
              {saving ? "Saving…" : "Add customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
