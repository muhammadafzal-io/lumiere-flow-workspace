"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Loader2, Wand2 } from "lucide-react";
import { parseNaturalLanguage, generateCopy } from "@/lib/ai-parse";
import type { Rule, TriggerType, Channel, Treatment } from "@/lib/types";
import { toast } from "sonner";

const TRIGGER_TYPES: TriggerType[] = [
  "Inactivity",
  "Birthday",
  "Treatment-based",
  "Date-based",
  "No-show recovery",
];
const TREATMENTS: Treatment[] = [
  "Botox",
  "HydraFacial",
  "Laser",
  "Microneedling",
  "IV Drip",
  "Filler",
];

const EXAMPLES = [
  "Send a birthday greeting 7 days before with a $50 credit",
  "For clients who got Botox 3 months ago, send a touch-up reminder",
  "Run a Women's Day sale on March 8th — 25% off any facial",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Rule | null;
  onSaved?: (rule: Rule) => void;
}

export function RuleModal({ open, onOpenChange, editing, onSaved }: Props) {
  const [nl, setNl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("Inactivity");
  const [cfg, setCfg] = useState<Record<string, any>>({ days: 90 });
  const [channel, setChannel] = useState<Channel>("Discord");
  const [message, setMessage] = useState("");
  const [offer, setOffer] = useState("");

  // Real customers from Supabase
  const [customers, setCustomers] = useState<
    { id: string; name: string; last_visit: string; treatments: Treatment[] }[]
  >([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  useEffect(() => {
    setLoadingCustomers(true);
    fetch("/api/customers?limit=500")
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => {})
      .finally(() => setLoadingCustomers(false));
  }, []);

  // Textarea ref for inserting template tags at cursor
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const insertTag = (tag: string) => {
    const el = msgRef.current;
    if (!el) {
      setMessage((m) => m + tag);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + tag + message.slice(end);
    setMessage(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setTriggerType(editing.trigger_type);
        setCfg(editing.trigger_config);
        setChannel(editing.channel);
        setMessage(editing.message_template);
        setOffer(editing.offer_code || "");
        setParsed(true);
      } else {
        setNl("");
        setParsed(false);
        setName("");
        setTriggerType("Inactivity");
        setCfg({ days: 90 });
        setChannel("Discord");
        setMessage("");
        setOffer("");
      }
    }
  }, [open, editing]);

  const handleParse = (input?: string) => {
    const text = input ?? nl;
    if (!text.trim()) return;
    if (input) setNl(input);
    setParsing(true);
    setTimeout(() => {
      const p = parseNaturalLanguage(text);
      setName(p.name);
      setTriggerType(p.trigger_type);
      setCfg(p.trigger_config);
      setChannel(p.channel);
      setMessage(p.message_template);
      setOffer(p.offer_code || "");
      setParsing(false);
      setParsed(true);
      toast.success("AI parsed your rule");
    }, 1500);
  };

  // Live audience preview
  const audience = useMemo(() => {
    let pool = customers;
    if (triggerType === "Inactivity") {
      const days = Number(cfg.days || 90);
      const cutoff = Date.now() - days * 86400000;
      pool = pool.filter((c) => new Date(c.last_visit).getTime() < cutoff);
    } else if (triggerType === "Birthday") {
      pool = pool.slice(0, Math.round(pool.length / 12));
    } else if (triggerType === "Treatment-based") {
      const t = cfg.treatment;
      if (t && t !== "Any") pool = pool.filter((c) => c.treatments.includes(t));
    } else if (triggerType === "Date-based") {
      // all customers eligible
    } else if (triggerType === "No-show recovery") {
      pool = pool.slice(0, 6);
    }
    return pool;
  }, [customers, triggerType, cfg]);

  // Update copy when trigger changes (only if not user-edited beyond simple)
  useEffect(() => {
    if (!parsed) return;
  }, [triggerType, parsed]);

  const save = async (status: "active" | "draft") => {
    if (!name.trim()) {
      toast.error("Name your rule first");
      return;
    }

    const isEdit = !!editing?.id;

    try {
      const response = await fetch("/api/rule", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit && { recordId: editing.id }),
          ruleName: name,
          triggerType: triggerType,
          triggerConfig: cfg,
          channel: channel,
          messageTemplate: message,
          incentiveCode: offer,
          status: status === "active" ? "Active" : "Draft",
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${response.status}`);
      }

      const data = await response.json();
      toast.success(status === "active" ? "Rule activated" : "Rule saved as draft");
      onSaved?.(data.data);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save rule");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg">{editing ? "Edit rule" : "Create rule"}</DialogTitle>
        </DialogHeader>

        {/* AI Builder */}
        <div className="px-6 pb-4 border-b">
          <div className="rounded-lg border bg-accent/40 p-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Describe your rule in plain English
            </div>
            <div className="flex gap-2">
              <Textarea
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                placeholder="e.g., For customers who haven't visited in 6 months, send them 20% off full body laser"
                className="min-h-[60px] bg-background resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleParse();
                }}
              />
              <Button
                onClick={() => handleParse()}
                disabled={parsing || !nl.trim()}
                className="self-stretch"
              >
                {parsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleParse(ex)}
                  className="text-xs px-2.5 py-1 rounded-full border bg-background hover:bg-accent transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
            {parsing && <div className="mt-3 h-2 rounded shimmer bg-secondary" />}
            {parsed && !parsing && (
              <div className="mt-3 text-xs text-primary flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> AI parsed your rule — review and edit below.
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-5">
          <div>
            <Label>Rule name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
              placeholder="e.g., Birthday greeting"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Trigger type</Label>
              <Select
                value={triggerType}
                onValueChange={(v) => {
                  setTriggerType(v as TriggerType);
                  setCfg(defaultCfg(v as TriggerType));
                  setMessage(generateCopy(v as TriggerType, defaultCfg(v as TriggerType), offer));
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TriggerDetails t={triggerType} cfg={cfg} setCfg={setCfg} />
          </div>

          <div>
            <Label>Channel</Label>
            <RadioGroup
              value={channel}
              onValueChange={(v) => setChannel(v as Channel)}
              className="flex gap-4 mt-2"
            >
              {(["Discord", "Telegram", "WhatsApp"] as Channel[]).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value={c} /> {c}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label>Message preview</Label>
            <Textarea
              ref={msgRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1.5 min-h-[100px]"
              placeholder="Write your message or let AI generate it above…"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["{first_name}", "{last_treatment}", "{credit_code}"].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => insertTag(tag)}
                  title="Click to insert at cursor"
                  className="text-[11px] px-2 py-0.5 rounded-md bg-accent text-accent-foreground font-mono hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                >
                  {tag}
                </button>
              ))}
              <span className="text-[11px] text-muted-foreground self-center ml-1">
                click to insert
              </span>
            </div>
          </div>

          <div>
            <Label>
              Offer / incentive code{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              className="mt-1.5"
              placeholder="e.g., SPRING30"
            />
          </div>

          <div className="rounded-lg border bg-secondary/40 p-4">
            <div className="text-sm font-medium">Audience preview</div>
            {loadingCustomers ? (
              <div className="mt-2 space-y-2 animate-pulse">
                <div className="h-7 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-1/2 mt-3" />
                <div className="h-3 bg-muted rounded w-2/5" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-semibold mt-1 tracking-tight">
                  {audience.length} customers
                </div>
                <div className="mt-3 space-y-1.5">
                  {audience
                    .slice(0, 3)
                    .map((c: { id: string; name: string; last_visit: string }) => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">
                          {c.last_visit
                            ? `Last visit ${new Date(c.last_visit).toLocaleDateString()}`
                            : "No visits recorded"}
                        </span>
                      </div>
                    ))}
                  {audience.length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      No customers match — adjust the trigger settings.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2 bg-secondary/30">
          <Button variant="outline" onClick={() => save("draft")}>
            Save as draft
          </Button>
          <Button onClick={() => save("active")}>Activate rule</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function defaultCfg(t: TriggerType): Record<string, any> {
  switch (t) {
    case "Inactivity":
      return { days: 90 };
    case "Birthday":
      return { days_before: 7 };
    case "Treatment-based":
      return { treatment: "Botox", days_after: 14 };
    case "Date-based":
      return { date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) };
    case "No-show recovery":
      return { hours_after: 24 };
  }
}

function TriggerDetails({
  t,
  cfg,
  setCfg,
}: {
  t: TriggerType;
  cfg: Record<string, any>;
  setCfg: (c: Record<string, any>) => void;
}) {
  if (t === "Inactivity")
    return (
      <div>
        <Label>Days since last visit</Label>
        <Input
          type="number"
          value={cfg.days ?? 90}
          onChange={(e) => setCfg({ ...cfg, days: +e.target.value })}
          className="mt-1.5"
        />
      </div>
    );
  if (t === "Birthday")
    return (
      <div>
        <Label>Days before birthday</Label>
        <Input
          type="number"
          value={cfg.days_before ?? 7}
          onChange={(e) => setCfg({ ...cfg, days_before: +e.target.value })}
          className="mt-1.5"
        />
      </div>
    );
  if (t === "Treatment-based")
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Treatment</Label>
          <Select
            value={cfg.treatment || "Botox"}
            onValueChange={(v) => setCfg({ ...cfg, treatment: v })}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Any">Any</SelectItem>
              {TREATMENTS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Days after</Label>
          <Input
            type="number"
            value={cfg.days_after ?? 14}
            onChange={(e) => setCfg({ ...cfg, days_after: +e.target.value })}
            className="mt-1.5"
          />
        </div>
      </div>
    );
  if (t === "Date-based")
    return (
      <div>
        <Label>Send date</Label>
        <Input
          type="date"
          value={cfg.date || ""}
          onChange={(e) => setCfg({ ...cfg, date: e.target.value })}
          className="mt-1.5"
        />
      </div>
    );
  return (
    <div>
      <Label>Hours after no-show</Label>
      <Input
        type="number"
        value={cfg.hours_after ?? 24}
        onChange={(e) => setCfg({ ...cfg, hours_after: +e.target.value })}
        className="mt-1.5"
      />
    </div>
  );
}
