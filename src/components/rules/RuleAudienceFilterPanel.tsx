"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, X } from "lucide-react";
import {
  applyVisitRangePreset,
  defaultRuleAudienceFilters,
  type RuleAudienceFilters,
} from "@/lib/rules/audience-config";

interface Props {
  filters: RuleAudienceFilters;
  onChange: (filters: RuleAudienceFilters) => void;
  activeCount: number;
  ruleMinVisits?: number;
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
      fetch(`/api/rule/suggestions?field=${suggestField}&q=${encodeURIComponent(input)}`)
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
                onClick={() => {
                  if (suggestField === "visit_range") onAdd(s);
                  else if (!values.includes(s)) onAdd(s);
                  setInput("");
                  setOpen(false);
                }}
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

export function RuleAudienceFilterPanel({ filters, onChange, activeCount, ruleMinVisits }: Props) {
  const set = (patch: Partial<RuleAudienceFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-col h-full border-r bg-card/50">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <span className="text-sm font-semibold">Audience filters</span>
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
            {ruleMinVisits != null && (
              <p className="text-xs text-muted-foreground">
                Rule requires ≥ <strong>{ruleMinVisits}</strong> visits
              </p>
            )}
            <TypeaheadFilter
              label="Quick ranges"
              suggestField="visit_range"
              placeholder="Type range…"
              values={[]}
              onAdd={(v) => onChange(applyVisitRangePreset(filters, v))}
              onRemove={() => {}}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Min visits</Label>
                <Input
                  type="number"
                  className="h-8 mt-1 text-sm"
                  value={filters.visit_min ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!raw) {
                      set({ visit_min: undefined });
                      return;
                    }
                    const n = Number(raw);
                    set({ visit_min: n < 1 ? 1 : n });
                  }}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max visits</Label>
                <Input
                  type="number"
                  className="h-8 mt-1 text-sm"
                  value={filters.visit_max ?? ""}
                  onChange={(e) =>
                    set({ visit_max: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
            <ChevronDown className="h-3.5 w-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <TypeaheadFilter
              label=""
              suggestField="status"
              placeholder="Type status…"
              values={filters.status ?? []}
              onAdd={(v) => set({ status: [...(filters.status ?? []), v] })}
              onRemove={(v) => set({ status: (filters.status ?? []).filter((x) => x !== v) })}
            />
          </CollapsibleContent>
        </Collapsible>

        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Treatment
            <ChevronDown className="h-3.5 w-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <TypeaheadFilter
              label=""
              suggestField="treatment"
              placeholder="Type treatment…"
              values={filters.treatment ?? []}
              onAdd={(v) => set({ treatment: [...(filters.treatment ?? []), v] })}
              onRemove={(v) => set({ treatment: (filters.treatment ?? []).filter((x) => x !== v) })}
            />
          </CollapsibleContent>
        </Collapsible>

        <div>
          <Label className="text-xs text-muted-foreground">Last visit</Label>
          <Select
            value={filters.last_visit ?? "any"}
            onValueChange={(v) => set({ last_visit: v as RuleAudienceFilters["last_visit"] })}
          >
            <SelectTrigger className="h-8 mt-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time</SelectItem>
              <SelectItem value="7">Within 7 days (last week)</SelectItem>
              <SelectItem value="30">Within 30 days</SelectItem>
              <SelectItem value="30-90">30–90 days ago</SelectItem>
              <SelectItem value="90">90+ days ago</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Has email</Label>
          <Select
            value={filters.has_email === false ? "no" : "yes"}
            onValueChange={(v) => set({ has_email: v === "yes" })}
          >
            <SelectTrigger className="h-8 mt-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes (required to send)</SelectItem>
              <SelectItem value="no">Any</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-4 py-3 border-t">
        <button
          type="button"
          onClick={() => onChange(defaultRuleAudienceFilters())}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Clear filters {activeCount > 0 ? `(${activeCount})` : ""}
        </button>
      </div>
    </div>
  );
}
