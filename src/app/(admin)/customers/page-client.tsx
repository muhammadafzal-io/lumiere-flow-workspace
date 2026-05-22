"use client";

import { useMemo, useState } from "react";
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
import { Search, Download, Plus, MoreHorizontal } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Customer } from "@/lib/types";

function statusPill(s: string) {
  const map: Record<string, string> = {
    Active: "bg-success/10 text-success border-success/20",
    Dormant: "bg-warning/15 text-warning-foreground border-warning/30",
    VIP: "bg-primary/10 text-primary border-primary/20",
    New: "bg-info/10 text-info border-info/20",
  };
  return `inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${map[s]}`;
}

function UpcomingAppointmentsForCustomer({ customerId }: { customerId: string }) {
  const appointments = useStore((s) => s.appointments);
  const practitioners = useStore((s) => s.practitioners);
  const upcoming = appointments
    .filter(
      (a) =>
        a.customer_id === customerId &&
        new Date(a.start_time).getTime() >= Date.now() &&
        a.status !== "cancelled",
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .slice(0, 5);
  if (upcoming.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Upcoming appointments
      </h3>
      <div className="rounded-md border divide-y text-sm">
        {upcoming.map((a) => {
          const p = practitioners.find((x) => x.id === a.practitioner_id);
          const start = new Date(a.start_time);
          return (
            <div key={a.id} className="px-3 py-2 flex items-center gap-3">
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: p?.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{a.treatment}</div>
                <div className="text-xs text-muted-foreground">
                  {start.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground capitalize">{a.status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const customers = useStore((s) => s.customers);
  const activity = useStore((s) => s.activity);
  const rules = useStore((s) => s.rules);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [last, setLast] = useState("any");
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (q && !`${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      if (status !== "all" && c.status !== status) return false;
      const days = (Date.now() - new Date(c.last_visit).getTime()) / 86400000;
      if (last === "30") return days <= 30;
      if (last === "30-90") return days > 30 && days <= 90;
      if (last === "90") return days > 90;
      return true;
    });
  }, [customers, q, status, last]);

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

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {customers.length} customers · {customers.filter((c) => c.status === "VIP").length} VIP
            · {customers.filter((c) => c.status === "Dormant").length} dormant
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            Add customer
          </Button>
        </div>
      </div>

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
                <th className="text-left font-medium px-4 py-2.5">Last treatment</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => (
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
                  <td className="px-4 py-2.5 text-muted-foreground">{c.phone}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(c.last_visit).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">{c.total_visits}</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    ${c.lifetime_value.toLocaleString()}
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
                        <DropdownMenuItem>Send message</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm text-muted-foreground">
                    No customers match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-xl">{selected.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-1 text-sm">
                <div className="text-muted-foreground">{selected.email}</div>
                <div className="text-muted-foreground">{selected.phone}</div>
                <div className="text-muted-foreground">
                  Birthday {new Date(selected.birthday).toLocaleDateString()}
                </div>
                <div className="pt-2">
                  <span className={statusPill(selected.status)}>{selected.status}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-5">
                <div className="rounded-md border p-3">
                  <div className="text-[11px] text-muted-foreground">Lifetime value</div>
                  <div className="text-base font-semibold mt-0.5">
                    ${selected.lifetime_value.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[11px] text-muted-foreground">Visits</div>
                  <div className="text-base font-semibold mt-0.5">{selected.total_visits}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[11px] text-muted-foreground">Last visit</div>
                  <div className="text-base font-semibold mt-0.5">
                    {new Date(selected.last_visit).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <UpcomingAppointmentsForCustomer customerId={selected.id} />
              <Tabs defaultValue="visits" className="mt-5">
                <TabsList>
                  <TabsTrigger value="visits">Visits</TabsTrigger>
                  <TabsTrigger value="payments">Payments</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="messages">Messages</TabsTrigger>
                </TabsList>
                <TabsContent value="visits" className="mt-3">
                  <div className="rounded-md border divide-y text-sm">
                    {selected.visits.slice(0, 12).map((v, i) => (
                      <div key={i} className="px-3 py-2 flex justify-between">
                        <span>{new Date(v.date).toLocaleDateString()}</span>
                        <span className="text-muted-foreground">{v.treatment}</span>
                        <span className="font-medium">${v.spend}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="payments" className="mt-3">
                  <div className="rounded-md border divide-y text-sm">
                    {selected.payments.slice(0, 12).map((p, i) => (
                      <div key={i} className="px-3 py-2 flex justify-between">
                        <span>{new Date(p.date).toLocaleDateString()}</span>
                        <span className="text-muted-foreground">{p.method}</span>
                        <span className="font-medium">${p.amount}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="notes" className="mt-3 text-sm">
                  <div className="rounded-md border p-3 min-h-[80px]">
                    {selected.notes || <span className="text-muted-foreground">No notes yet.</span>}
                  </div>
                </TabsContent>
                <TabsContent value="messages" className="mt-3">
                  <div className="rounded-md border divide-y text-sm">
                    {activity
                      .filter((a) => a.customer_id === selected.id)
                      .map((a) => {
                        const r = rules.find((x) => x.id === a.rule_id);
                        return (
                          <div key={a.id} className="px-3 py-2">
                            <div className="flex justify-between">
                              <span className="font-medium">{r?.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(a.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {a.channel} · {a.status}
                            </div>
                          </div>
                        );
                      })}
                    {activity.filter((a) => a.customer_id === selected.id).length === 0 && (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No automated messages sent.
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
