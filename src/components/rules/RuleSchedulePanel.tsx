"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Clock, Loader2 } from "lucide-react";
import type { Rule } from "@/lib/types";
import type { RuleAudienceFilters } from "@/lib/rules/audience-config";
import {
  DEFAULT_RULE_SCHEDULE,
  parseRuleSchedule,
  scheduleSummary,
  type RuleScheduleConfig,
} from "@/lib/rules/schedule-config";
import { toast } from "sonner";

interface Props {
  rule: Rule;
  filters: RuleAudienceFilters;
  onSaved: () => void;
}

export function RuleSchedulePanel({ rule, filters, onSaved }: Props) {
  const [schedule, setSchedule] = useState<RuleScheduleConfig>(() =>
    parseRuleSchedule(rule.trigger_config?.schedule),
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setSchedule(parseRuleSchedule(rule.trigger_config?.schedule));
  }, [rule]);

  const save = async () => {
    setSaving(true);
    try {
      const triggerConfig = {
        ...rule.trigger_config,
        audience_filters: filters,
        schedule,
      };
      const res = await fetch("/api/rule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: rule.id,
          ruleName: rule.name,
          status:
            rule.status === "active" ? "Active" : rule.status === "paused" ? "Paused" : "Draft",
          triggerType: rule.trigger_type,
          triggerConfig,
          channel: rule.channel,
          messageTemplate: rule.message_template,
          incentiveCode: rule.offer_code ?? "",
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success(
        schedule.enabled ? "Auto-send schedule saved" : "Schedule disabled — manual send only",
      );
      onSaved();
    } catch {
      toast.error("Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setTesting(true);
    try {
      const res = await fetch(`/api/rule/${rule.id}/run-scheduled`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      const r = data.results?.[0];
      const sent = r?.send?.sent ?? 0;
      toast.success(`Auto-send test: ${sent} email(s) sent`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test run failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" />
            Auto-send schedule
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Saves current audience filters and sends automatically on the interval you choose.
          </p>
        </div>
        <Switch
          checked={schedule.enabled}
          onCheckedChange={(v) => setSchedule((s) => ({ ...s, enabled: v }))}
        />
      </div>

      {schedule.enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Interval</Label>
            <Select
              value={schedule.interval}
              onValueChange={(v) =>
                setSchedule((s) => ({
                  ...s,
                  interval: v as RuleScheduleConfig["interval"],
                }))
              }
            >
              <SelectTrigger className="h-8 mt-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Once</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Time (CT)</Label>
            <Input
              type="time"
              className="h-8 mt-1 text-sm"
              value={schedule.run_at ?? "09:00"}
              onChange={(e) => setSchedule((s) => ({ ...s, run_at: e.target.value }))}
            />
          </div>
          {schedule.interval === "weekly" && (
            <div>
              <Label className="text-xs text-muted-foreground">Day of week</Label>
              <Select
                value={String(schedule.day_of_week ?? 1)}
                onValueChange={(v) => setSchedule((s) => ({ ...s, day_of_week: Number(v) }))}
              >
                <SelectTrigger className="h-8 mt-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                    <SelectItem key={d} value={String(i)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {schedule.interval === "monthly" && (
            <div>
              <Label className="text-xs text-muted-foreground">Day of month</Label>
              <Input
                type="number"
                min={1}
                max={28}
                className="h-8 mt-1 text-sm"
                value={schedule.day_of_month ?? 1}
                onChange={(e) =>
                  setSchedule((s) => ({ ...s, day_of_month: Number(e.target.value) }))
                }
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Send mode</Label>
            <Select
              value={schedule.send_mode ?? "once_per_client"}
              onValueChange={(v) =>
                setSchedule((s) => ({
                  ...s,
                  send_mode: v as RuleScheduleConfig["send_mode"],
                }))
              }
            >
              <SelectTrigger className="h-8 mt-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once_per_client">Once per client (no duplicates)</SelectItem>
                <SelectItem value="all_eligible">Every run — full audience</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{scheduleSummary(schedule)}</p>
      {schedule.last_auto_run_at && (
        <p className="text-xs text-muted-foreground">
          Last auto-run: {new Date(schedule.last_auto_run_at).toLocaleString()}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Save schedule
        </Button>
        {schedule.enabled && (
          <Button size="sm" variant="outline" onClick={runNow} disabled={testing}>
            {testing && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Test auto-send now
          </Button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        When enabled, a daily check runs once each day (around 9 AM America/Chicago time) and sends
        any rule whose scheduled time has passed for that day — so a time set for later in the day
        goes out at the next day&apos;s check, not at the exact minute chosen. Each client receives
        at most one send per rule when &quot;Once per client&quot; is selected.
      </p>
    </div>
  );
}
