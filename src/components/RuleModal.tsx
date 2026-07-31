"use client";

import { useEffect, useRef, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Sparkles, Loader2, Wand2, RefreshCw } from "lucide-react";
import { generateCopy } from "@/lib/ai-parse";
import { DEFAULT_BIRTHDAY_RULE_TEMPLATE } from "@/lib/credits/birthday-code";
import { formatLastVisit } from "@/lib/customers/last-visit";
import type { Rule, TriggerType, Channel, Treatment, CampaignRewardType } from "@/lib/types";
import { RULE_CHANNELS, normalizeRuleChannel } from "@/lib/types";
import type { RuleAudienceRow } from "@/lib/rules/audience-config";
import { toast } from "sonner";

const TRIGGER_TYPES: TriggerType[] = [
  "Visit count",
  "Inactivity",
  "Birthday",
  "Treatment-based",
  "Date-based",
  "No-show recovery",
  "Custom",
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
  "Send a $50 discount to clients who visited more than 5 times",
  "Send a birthday greeting 7 days before with a $50 credit",
  "For clients who got Botox 3 months ago, send a touch-up reminder",
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
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("Inactivity");
  const [cfg, setCfg] = useState<Record<string, any>>({ days: 90 });
  const [channel, setChannel] = useState<Channel>("Email");
  const [message, setMessage] = useState("");
  const [offer, setOffer] = useState("");
  const [offerType, setOfferType] = useState<CampaignRewardType>("credit");
  const [offerAmount, setOfferAmount] = useState(50);
  const [allowCustomPromoCode, setAllowCustomPromoCode] = useState(false);

  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewEligible, setPreviewEligible] = useState(0);
  const [previewRows, setPreviewRows] = useState<RuleAudienceRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Textarea ref for inserting template tags at cursor
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const templateTags =
    triggerType === "Birthday"
      ? ["{first_name}", "{birthday_token}", "{credit_code}"]
      : ["{first_name}", "{last_treatment}", "{credit_code}", "{offer_amount}", "{offer_summary}"];

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
      fetch("/api/rule/parse")
        .then((r) => r.json())
        .then((d) => setAiReady(!!d.configured))
        .catch(() => setAiReady(false));
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setTriggerType(editing.trigger_type);
        setCfg(editing.trigger_config);
        setChannel(normalizeRuleChannel(editing.channel));
        setMessage(editing.message_template);
        setOffer(editing.offer_code || "");
        setOfferType(editing.trigger_config?.offer_type === "discount" ? "discount" : "credit");
        const amt = Number(editing.trigger_config?.offer_amount);
        setOfferAmount(Number.isFinite(amt) && amt > 0 ? amt : 50);
        setAllowCustomPromoCode(editing.trigger_config?.allow_custom_promo_code === true);
        setParsed(true);
      } else {
        setNl("");
        setParsed(false);
        setName("");
        setTriggerType("Visit count");
        setCfg({ min_visits: 5 });
        setChannel("Email");
        setMessage("");
        setOffer("");
        setOfferType("credit");
        setOfferAmount(50);
        setAllowCustomPromoCode(false);
      }
    }
  }, [open, editing]);

  const handleParse = async (input?: string) => {
    const text = input ?? nl;
    if (!text.trim()) return;
    if (input) setNl(input);
    setParsing(true);
    try {
      const res = await fetch("/api/rule/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");

      const p = data.rule;
      setName(p.name);
      setTriggerType(p.trigger_type);
      setCfg({
        ...p.trigger_config,
        ...(p.audience_filters ? { audience_filters: p.audience_filters } : {}),
      });
      setChannel(normalizeRuleChannel(p.channel));
      setMessage(p.message_template);
      setOffer(p.offer_code || "");
      if (p.trigger_config?.offer_type === "discount") setOfferType("discount");
      const parsedAmt = Number(p.trigger_config?.offer_amount);
      if (Number.isFinite(parsedAmt) && parsedAmt > 0) setOfferAmount(parsedAmt);
      setAllowCustomPromoCode(false);
      setParsed(true);
      toast.success("AI built your rule");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI parse failed");
    } finally {
      setParsing(false);
    }
  };

  const handleGenerateMessage = async () => {
    if (!name.trim()) {
      toast.error("Add a rule name first");
      return;
    }
    setGeneratingMsg(true);
    try {
      const res = await fetch("/api/rule/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleName: name,
          triggerType,
          triggerConfig: cfg,
          offerCode: offer || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setMessage(data.message);
      toast.success("AI rewrote your message");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI message failed");
    } finally {
      setGeneratingMsg(false);
    }
  };

  // Live audience preview — same engine as /rules/[id]
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoadingPreview(true);
      fetch("/api/rule/preview-audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerType, triggerConfig: cfg, channel }),
      })
        .then((r) => r.json())
        .then((d) => {
          setPreviewTotal(d.total ?? 0);
          setPreviewEligible(d.eligible ?? 0);
          setPreviewRows((d.rows ?? []).slice(0, 5));
        })
        .catch(() => {
          setPreviewTotal(0);
          setPreviewEligible(0);
          setPreviewRows([]);
        })
        .finally(() => setLoadingPreview(false));
    }, 350);
    return () => clearTimeout(t);
  }, [open, triggerType, cfg, channel]);

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
          triggerConfig: {
            ...cfg,
            offer_type: offerType,
            offer_amount: offerAmount,
            allow_custom_promo_code: allowCustomPromoCode,
          },
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
              Describe your rule — AI builds everything
              {aiReady === false && (
                <span className="text-[10px] text-destructive font-normal ml-1">
                  (OPENAI_API_KEY required)
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Textarea
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                placeholder="e.g., Send $50 off to clients who visited 5+ times"
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
                <Sparkles className="h-3 w-3" /> AI filled in your rule — review and edit below,
                then save.
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
                  const next = v as TriggerType;
                  setTriggerType(next);
                  setCfg(defaultCfg(next));
                  setMessage(
                    next === "Birthday"
                      ? DEFAULT_BIRTHDAY_RULE_TEMPLATE
                      : generateCopy(next, defaultCfg(next), offer),
                  );
                  if (next === "Birthday") setOffer("");
                  setAllowCustomPromoCode(false);
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
              {RULE_CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value={c} /> {c}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Message preview</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={generatingMsg || !name.trim()}
                onClick={handleGenerateMessage}
              >
                {generatingMsg ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Rewrite with AI
              </Button>
            </div>
            <Textarea
              ref={msgRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1.5 min-h-[100px]"
              placeholder="Write your message or let AI generate it above…"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {templateTags.map((tag) => (
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
                {triggerType === "Birthday"
                  ? "{birthday_token} is auto-generated per client for chatbot redemption"
                  : "click to insert"}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div className="pr-3">
                <Label htmlFor="allow-custom-promo" className="text-sm cursor-pointer">
                  Allow Custom Promo Code
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {triggerType === "Birthday"
                    ? "On: every recipient gets the single code below instead of a unique auto-generated code. Off: keep the default unique-per-client birthday code."
                    : "On: edit the promo code below. Off: the saved code is locked and sent as-is."}
                </p>
              </div>
              <Switch
                id="allow-custom-promo"
                checked={allowCustomPromoCode}
                onCheckedChange={setAllowCustomPromoCode}
              />
            </div>

            {triggerType === "Birthday" && !allowCustomPromoCode ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                Each recipient gets a unique{" "}
                <span className="font-mono text-foreground">{`{birthday_token}`}</span> (e.g.
                BDAY-JD-X7K2) saved to their profile. Clients enter it in the chatbot to redeem $ 50
                off — include{" "}
                <span className="font-mono text-foreground">{`{birthday_token}`}</span> in your
                message above.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>
                      Promo code{" "}
                      {triggerType !== "Birthday" && (
                        <span className="text-muted-foreground font-normal">(optional)</span>
                      )}
                    </Label>
                    <Input
                      value={offer}
                      onChange={(e) => setOffer(e.target.value.toUpperCase())}
                      disabled={!allowCustomPromoCode}
                      className="mt-1.5 font-mono disabled:opacity-60"
                      placeholder={triggerType === "Birthday" ? "e.g., SUMMER50" : "e.g., SPRING30"}
                    />
                  </div>
                  {triggerType !== "Birthday" && (
                    <>
                      <div>
                        <Label>Offer type</Label>
                        <Select
                          value={offerType}
                          onValueChange={(v) => setOfferType(v as CampaignRewardType)}
                        >
                          <SelectTrigger className="mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="credit">Credit ($)</SelectItem>
                            <SelectItem value="discount">Discount (%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{offerType === "credit" ? "Amount ($)" : "Discount (%)"}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={offerType === "discount" ? 100 : 10000}
                          value={offerAmount}
                          onChange={(e) => setOfferAmount(Math.max(1, Number(e.target.value) || 1))}
                          className="mt-1.5"
                        />
                      </div>
                    </>
                  )}
                </div>
                {triggerType !== "Birthday" ? (
                  <p className="text-xs text-muted-foreground">
                    Use {`{offer_amount}`} or {`{offer_summary}`} in your message for the dollar or
                    percent value.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This code is sent to every recipient instead of a unique per-client code.
                    Reference it with <span className="font-mono">{`{credit_code}`}</span> or{" "}
                    <span className="font-mono">{`{birthday_token}`}</span> in your message above.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-secondary/40 p-4">
            <div className="text-sm font-medium">Audience preview</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Matches the same filters used on the run page after you save.
            </p>
            {loadingPreview ? (
              <div className="mt-2 space-y-2 animate-pulse">
                <div className="h-7 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-1/2 mt-3" />
                <div className="h-3 bg-muted rounded w-2/5" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-semibold mt-2 tracking-tight">
                  {previewEligible}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    of {previewTotal} customers
                  </span>
                </div>
                {previewRows.length > 0 && (
                  <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-[10px] uppercase tracking-wide text-muted-foreground border-b pb-1">
                    <span>Name</span>
                    <span>Visits</span>
                    <span>Last visit</span>
                  </div>
                )}
                <div className="mt-1 space-y-1">
                  {previewRows.map((c) => (
                    <div
                      key={c.id}
                      className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center text-xs py-1"
                    >
                      <span className="font-medium truncate">{c.name}</span>
                      <span className="text-muted-foreground tabular-nums">{c.visits ?? 0}</span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {formatLastVisit(c.lastVisit)}
                      </span>
                    </div>
                  ))}
                  {previewEligible === 0 && (
                    <div className="text-xs text-muted-foreground py-2">
                      No customers match — adjust trigger settings or add audience filters via AI.
                    </div>
                  )}
                  {previewEligible > previewRows.length && (
                    <div className="text-[11px] text-muted-foreground pt-1">
                      +{previewEligible - previewRows.length} more on the run page
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
    case "Visit count":
      return { min_visits: 5 };
    case "Custom":
      return {};
    case "Inactivity":
      return { days: 90 };
    case "Birthday":
      return { days_before: 7 };
    case "Treatment-based":
      return { treatment: "Any", treatment_timing: "within_last_days", within_last_days: 7 };
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
  if (t === "Treatment-based") {
    const timing =
      cfg.treatment_timing ??
      (cfg.exact_calendar_day
        ? "exact_day"
        : cfg.within_last_days
          ? "within_last_days"
          : "minimum_days");
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Treatment</Label>
            <Select
              value={cfg.treatment || "Any"}
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
            <Label>When to send</Label>
            <Select
              value={timing}
              onValueChange={(v) => {
                if (v === "within_last_days") {
                  setCfg({
                    ...cfg,
                    treatment_timing: "within_last_days",
                    within_last_days: cfg.within_last_days ?? cfg.days_after ?? 7,
                    exact_calendar_day: false,
                  });
                } else if (v === "exact_day") {
                  setCfg({
                    ...cfg,
                    treatment_timing: "exact_day",
                    exact_calendar_day: true,
                    days_after: cfg.days_after ?? 1,
                  });
                } else {
                  setCfg({
                    ...cfg,
                    treatment_timing: "minimum_days",
                    exact_calendar_day: false,
                    days_after: cfg.days_after ?? 14,
                  });
                }
              }}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="within_last_days">Had treatment within last X days</SelectItem>
                <SelectItem value="exact_day">On a specific day after treatment</SelectItem>
                <SelectItem value="minimum_days">At least X days after treatment</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>
            {timing === "within_last_days"
              ? "Within last (days)"
              : timing === "exact_day"
                ? "Days after treatment (calendar)"
                : "Minimum days after"}
          </Label>
          <Input
            type="number"
            min={1}
            value={
              timing === "within_last_days"
                ? (cfg.within_last_days ?? cfg.days_after ?? 7)
                : (cfg.days_after ?? (timing === "exact_day" ? 1 : 14))
            }
            onChange={(e) => {
              const n = Math.max(1, Number(e.target.value) || 1);
              if (timing === "within_last_days") {
                setCfg({ ...cfg, within_last_days: n, days_after: n });
              } else {
                setCfg({ ...cfg, days_after: n });
              }
            }}
            className="mt-1.5"
          />
          {timing === "within_last_days" && (
            <p className="text-xs text-muted-foreground mt-1">
              e.g. 7 = any completed treatment in the last week (Google Calendar + client records).
            </p>
          )}
          {timing === "exact_day" && (
            <p className="text-xs text-muted-foreground mt-1">
              1 = yesterday, 0 = today. Matches one calendar day only.
            </p>
          )}
        </div>
      </div>
    );
  }
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
  if (t === "Visit count")
    return (
      <div>
        <Label>Minimum visits</Label>
        <Input
          type="number"
          min={1}
          value={cfg.min_visits ?? cfg.visit_count ?? 5}
          onChange={(e) => setCfg({ ...cfg, min_visits: +e.target.value })}
          className="mt-1.5"
        />
      </div>
    );
  if (t === "Custom")
    return (
      <div className="text-sm text-muted-foreground pt-6">
        Define audience with filters on the run page after saving.
      </div>
    );
  if (t === "No-show recovery")
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
  return null;
}
