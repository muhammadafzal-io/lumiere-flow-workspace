"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, X } from "lucide-react";
import type { AudienceFilters, FilterFieldDef, RetentionFlowKey } from "@/lib/retention/audience-config";
import { applyVisitRangePreset, defaultFiltersForFlow, filtersForFlow } from "@/lib/retention/audience-config";

interface Props {
  flow: RetentionFlowKey;
  filters: AudienceFilters;
  onChange: (filters: AudienceFilters) => void;
  activeCount: number;
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-destructive">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function TypeaheadFilter({
  label,
  placeholder,
  suggestField,
  values,
  onAdd,
  onRemove,
}: {
  label: string;
  placeholder?: string;
  suggestField: "status" | "treatment" | "visit_range";
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(
        `/api/retention/audience/suggestions?field=${suggestField}&q=${encodeURIComponent(input)}`,
      )
        .then((r) => r.json())
        .then((d) => setSuggestions(d.suggestions ?? []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [input, suggestField]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (v: string) => {
    if (!values.includes(v)) onAdd(v);
    setInput("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {values.map((v) => (
          <Chip key={v} label={v} onRemove={() => onRemove(v)} />
        ))}
      </div>
      <div className="relative">
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md py-1 max-h-40 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onClick={() => pick(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AudienceFilterPanel({ flow, filters, onChange, activeCount }: Props) {
  const fields = filtersForFlow(flow);

  const set = useCallback(
    (patch: Partial<AudienceFilters>) => onChange({ ...filters, ...patch }),
    [filters, onChange],
  );

  const clearAll = () => {
    onChange(defaultFiltersForFlow(flow));
  };

  const renderField = (field: FilterFieldDef) => {
    if (field.key === "status") {
      return (
        <TypeaheadFilter
          key={field.key}
          label={field.label}
          placeholder={field.placeholder}
          suggestField="status"
          values={filters.status ?? []}
          onAdd={(v) => set({ status: [...(filters.status ?? []), v] })}
          onRemove={(v) => set({ status: (filters.status ?? []).filter((x) => x !== v) })}
        />
      );
    }
    if (field.key === "treatment") {
      return (
        <TypeaheadFilter
          key={field.key}
          label={field.label}
          placeholder={field.placeholder}
          suggestField="treatment"
          values={filters.treatment ?? []}
          onAdd={(v) => set({ treatment: [...(filters.treatment ?? []), v] })}
          onRemove={(v) => set({ treatment: (filters.treatment ?? []).filter((x) => x !== v) })}
        />
      );
    }
    if (field.key === "visit_min" || field.key === "visit_max") {
      return null;
    }

    if (field.type === "number") {
      const key = field.key as keyof AudienceFilters;
      return (
        <div key={field.key}>
          <Label className="text-xs text-muted-foreground">{field.label}</Label>
          <Input
            type="number"
            className="h-8 mt-1 text-sm"
            placeholder={field.placeholder}
            value={(filters[key] as number | undefined) ?? ""}
            onChange={(e) =>
              set({ [key]: e.target.value ? Number(e.target.value) : undefined } as Partial<AudienceFilters>)
            }
          />
        </div>
      );
    }

    if (field.type === "date") {
      return (
        <div key={field.key}>
          <Label className="text-xs text-muted-foreground">{field.label}</Label>
          <Input
            type="date"
            className="h-8 mt-1 text-sm"
            value={filters.noshow_date ?? ""}
            onChange={(e) => set({ noshow_date: e.target.value || undefined })}
          />
        </div>
      );
    }

    if (field.type === "select" && field.options) {
      const key = field.key as keyof AudienceFilters;
      let value = "any";
      if (key === "last_visit") value = filters.last_visit ?? "any";
      else if (key === "has_email")
        value = filters.has_email === true ? "yes" : filters.has_email === false ? "no" : "any";
      else if (key === "has_contact")
        value = filters.has_contact === true ? "yes" : filters.has_contact === false ? "no" : "any";
      else if (key === "reminder_window") value = filters.reminder_window ?? "any";
      else if (key === "credit_not_sent") value = filters.credit_not_sent ? "yes" : "any";
      else if (key === "reactivation_step")
        value =
          filters.reactivation_step?.length === 1
            ? String(filters.reactivation_step[0])
            : "any";

      return (
        <div key={field.key}>
          <Label className="text-xs text-muted-foreground">{field.label}</Label>
          <Select
            value={value}
            onValueChange={(v) => {
              if (key === "last_visit") set({ last_visit: v as AudienceFilters["last_visit"] });
              else if (key === "has_email")
                set({ has_email: v === "yes" ? true : v === "no" ? false : undefined });
              else if (key === "has_contact")
                set({ has_contact: v === "yes" ? true : v === "no" ? false : undefined });
              else if (key === "reminder_window")
                set({ reminder_window: v as AudienceFilters["reminder_window"] });
              else if (key === "credit_not_sent") set({ credit_not_sent: v === "yes" });
              else if (key === "reactivation_step")
                set({ reactivation_step: v === "any" ? undefined : [Number(v)] });
            }}
          >
            <SelectTrigger className="h-8 mt-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    return null;
  };

  const visitFields = fields.filter((f) => f.key === "visit_min" || f.key === "visit_max");

  return (
    <div className="flex flex-col h-full border-r bg-card/50">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <span className="text-sm font-semibold">Filters</span>
        {activeCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {activeCount}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Visit count
            <ChevronDown className="h-3.5 w-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-2">
            <TypeaheadFilter
              label="Quick ranges"
              suggestField="visit_range"
              placeholder="Type range…"
              values={[]}
              onAdd={(v) => onChange(applyVisitRangePreset(filters, v))}
              onRemove={() => {}}
            />
            <div className="grid grid-cols-2 gap-2">
              {visitFields.map((f) => renderField(f))}
            </div>
            {(filters.visit_min != null || filters.visit_max != null) && (
              <div className="flex flex-wrap gap-1">
                {filters.visit_min != null && (
                  <Chip
                    label={`≥ ${filters.visit_min} visits`}
                    onRemove={() => set({ visit_min: undefined })}
                  />
                )}
                {filters.visit_max != null && (
                  <Chip
                    label={`≤ ${filters.visit_max} visits`}
                    onRemove={() => set({ visit_max: undefined })}
                  />
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {fields
          .filter((f) => f.key !== "visit_min" && f.key !== "visit_max")
          .map((field) => (
            <Collapsible key={field.key} defaultOpen={!!field.flowOnly}>
              <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {field.label}
                <ChevronDown className="h-3.5 w-3.5" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">{renderField(field)}</CollapsibleContent>
            </Collapsible>
          ))}
      </div>

      <div className="px-4 py-3 border-t">
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Clear filters {activeCount > 0 ? `(${activeCount})` : ""}
        </button>
      </div>
    </div>
  );
}
