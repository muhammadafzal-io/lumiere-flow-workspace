"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock } from "lucide-react";
import { AccessGate } from "@/components/rbac/AccessGate";
import { useCurrentUser } from "@/lib/current-user-context";

interface PendingBookingItem {
  token: string;
  eventId: string;
  phone: string;
  clientName: string | null;
  treatment: string | null;
  status: "pending" | "completed" | "expired";
  expiresAt: string;
  createdAt: string;
  deliveryChannel: "email" | "sms" | "chat_reply" | "none" | null;
  remindedAt: string | null;
  deliveryError: string | null;
}

function fmtTime(raw: string, timeZone: string) {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function displayStatus(item: PendingBookingItem): "pending" | "reminded" | "expired" {
  if (item.status === "expired") return "expired";
  return item.remindedAt ? "reminded" : "pending";
}

function statusClass(status: "pending" | "reminded" | "expired") {
  if (status === "expired") return "bg-destructive/10 text-destructive border-destructive/20";
  if (status === "reminded") return "bg-warning/15 text-warning-foreground border-warning/30";
  return "bg-info/10 text-info border-info/20";
}

export default function PendingBookingsPage() {
  const { timezone } = useCurrentUser();
  const tz = timezone ?? "America/Chicago";
  const [items, setItems] = useState<PendingBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDenied(null);
    try {
      const res = await fetch("/api/booking-completions");
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending bookings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const pendingCount = items.filter((i) => displayStatus(i) !== "expired").length;
  const expiredCount = items.filter((i) => displayStatus(i) === "expired").length;

  if (accessDenied) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-[1400px]">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Pending Bookings
        </h1>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Bookings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Voice bookings still waiting on the customer to finish their email/birthday via the
            completion link. Appointments here show as Pending on the main Calendar until then —
            this list is for following up, not approving.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="border rounded-lg px-3 py-2 bg-card">
          <div className="text-[11px] text-muted-foreground">Awaiting details</div>
          <div className="text-xl font-semibold">{pendingCount}</div>
        </div>
        <div className="border rounded-lg px-3 py-2 bg-card">
          <div className="text-[11px] text-muted-foreground">Expired — needs follow-up</div>
          <div className="text-xl font-semibold text-destructive">{expiredCount}</div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Booked</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Treatment</th>
                <th className="px-3 py-2 font-medium">Sent via</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2 font-medium">Delivery error</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Nothing waiting on a customer right now.
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item) => {
                  const status = displayStatus(item);
                  return (
                    <tr key={item.token} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {fmtTime(item.createdAt, tz)}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[140px] truncate">
                        {item.clientName ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{item.phone}</td>
                      <td className="px-3 py-2 text-xs max-w-[140px] truncate">
                        {item.treatment ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs capitalize">
                        {item.deliveryChannel ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border capitalize ${statusClass(status)}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {fmtTime(item.expiresAt, tz)}
                      </td>
                      <td className="px-3 py-2 text-xs text-destructive max-w-[220px] truncate">
                        {item.deliveryError ?? "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
