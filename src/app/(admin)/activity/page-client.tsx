"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import type { Activity } from "@/lib/types";

function statusPill(s: string) {
  const map: Record<string, string> = {
    Delivered: "bg-muted text-muted-foreground border-border",
    Opened: "bg-info/10 text-info border-info/20",
    Replied: "bg-success/10 text-success border-success/20",
    Failed: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return `inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${map[s]}`;
}

export default function ActivityPage() {
  const activity = useStore((s) => s.activity);
  const customers = useStore((s) => s.customers);
  const rules = useStore((s) => s.rules);
  const [rule, setRule] = useState("all");
  const [status, setStatus] = useState("all");
  const [channel, setChannel] = useState("all");
  const [open, setOpen] = useState<Activity | null>(null);

  const cMap = new Map(customers.map((c) => [c.id, c]));
  const rMap = new Map(rules.map((r) => [r.id, r]));

  const filtered = useMemo(
    () =>
      activity.filter(
        (a) =>
          (rule === "all" || a.rule_id === rule) &&
          (status === "all" || a.status === status) &&
          (channel === "all" || a.channel === channel),
      ),
    [activity, rule, status, channel],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every automated message sent in the last 30 days.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center rounded-lg border bg-card p-3">
        <Select value={rule} onValueChange={setRule}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Rule" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rules</SelectItem>
            {rules.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Delivered">Delivered</SelectItem>
            <SelectItem value="Opened">Opened</SelectItem>
            <SelectItem value="Replied">Replied</SelectItem>
            <SelectItem value="Failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="WhatsApp">WhatsApp</SelectItem>
            <SelectItem value="Email">Email</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} messages</div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Timestamp</th>
                <th className="text-left font-medium px-4 py-2.5">Customer</th>
                <th className="text-left font-medium px-4 py-2.5">Rule</th>
                <th className="text-left font-medium px-4 py-2.5">Channel</th>
                <th className="text-left font-medium px-4 py-2.5">Preview</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-right font-medium px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {new Date(a.timestamp).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{cMap.get(a.customer_id)?.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{rMap.get(a.rule_id)?.name}</td>
                  <td className="px-4 py-2.5">{a.channel}</td>
                  <td className="px-4 py-2.5 text-muted-foreground max-w-[320px] truncate">
                    {a.message_body.slice(0, 60)}
                    {a.message_body.length > 60 ? "…" : ""}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={statusPill(a.status)}>{a.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setOpen(a)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Message detail</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-4">
              <div className="text-sm grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Customer</div>
                  <div className="font-medium">{cMap.get(open.customer_id)?.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Rule</div>
                  <div className="font-medium">{rMap.get(open.rule_id)?.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Channel</div>
                  <div>{open.channel}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Sent</div>
                  <div>{new Date(open.timestamp).toLocaleString()}</div>
                </div>
              </div>
              <div className="rounded-lg border bg-secondary/40 p-4 text-sm whitespace-pre-wrap">
                {open.message_body}
              </div>
              {open.reply && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Customer reply</div>
                  <div className="rounded-lg border bg-accent/40 p-4 text-sm">{open.reply}</div>
                </div>
              )}
              <div>
                <span className={statusPill(open.status)}>{open.status}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
