import type { TriggerType, Channel } from "./types";
import { DEFAULT_BIRTHDAY_RULE_TEMPLATE } from "./credits/birthday-code";

export interface ParsedRule {
  name: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  channel: Channel;
  message_template: string;
  offer_code?: string;
  audience_filters?: Record<string, any>;
}

export function parseNaturalLanguage(input: string): ParsedRule {
  const text = input.toLowerCase();
  let trigger_type: TriggerType = "Inactivity";
  let trigger_config: Record<string, any> = {};
  let name = "New rule";
  let offer_code: string | undefined;
  let channel: Channel = "Email";

  // Discount detection
  const pctMatch = text.match(/(\d{1,2})\s*%/);
  const dollarMatch = text.match(/\$(\d{1,3})/);
  if (pctMatch) offer_code = `SAVE${pctMatch[1]}`;
  else if (dollarMatch) offer_code = `CREDIT${dollarMatch[1]}`;

  if (/(\d+)\s*(times|visits)|visited\s+(more\s+than|over)\s+(\d+)/.test(text)) {
    trigger_type = "Visit count";
    const m = text.match(/(\d+)\s*(times|visits)/) ?? text.match(/(?:more\s+than|over)\s+(\d+)/);
    const n = m ? parseInt(m[1] || "5", 10) : 5;
    trigger_config = { min_visits: n };
    name = `${n}+ visit loyalty reward`;
    channel = "Email";
  } else if (/no[- ]show|missed/.test(text)) {
    trigger_type = "No-show recovery";
    trigger_config = { hours_after: 24 };
    name = "No-show recovery";
  } else if (/birthday/.test(text)) {
    trigger_type = "Birthday";
    const m = text.match(/(\d+)\s*days?\s*before/);
    trigger_config = { days_before: m ? parseInt(m[1]) : 7 };
    name = "Birthday greeting";
  } else if (/(haven'?t visited|dormant|inactive|no visit)/.test(text)) {
    trigger_type = "Inactivity";
    const m = text.match(/(\d+)\s*(month|week|day)/);
    let days = 90;
    if (m) {
      const n = parseInt(m[1]);
      days = m[2].startsWith("month") ? n * 30 : m[2].startsWith("week") ? n * 7 : n;
    }
    trigger_config = { days };
    name = `Win-back at ${days} days`;
  } else if (/after\s+(botox|hydrafacial|laser|microneedling|iv drip|filler)/.test(text)) {
    trigger_type = "Treatment-based";
    const tm = text.match(/after\s+(botox|hydrafacial|laser|microneedling|iv drip|filler)/);
    const dm = text.match(/(\d+)\s*(month|week|day)s?\s*(after|later)?/);
    let days_after = 14;
    if (dm) {
      const n = parseInt(dm[1]);
      days_after = dm[2].startsWith("month") ? n * 30 : dm[2].startsWith("week") ? n * 7 : n;
    }
    const treat = tm ? tm[1].replace(/\b\w/g, (c) => c.toUpperCase()) : "Botox";
    trigger_config = { treatment: treat, days_after };
    name = `${treat} follow-up`;
  } else if (
    /(sale|on\s+(march|april|may|june|july|august|september|october|november|december|january|february))|march\s+\d/.test(
      text,
    )
  ) {
    trigger_type = "Date-based";
    const today = new Date();
    today.setMonth(today.getMonth() + 1);
    trigger_config = { date: today.toISOString().slice(0, 10) };
    name = "Date-based campaign";
  }

  if (/telegram/.test(text)) channel = "Discord";
  else if (/whatsapp/.test(text)) channel = "WhatsApp";
  else if (/discord/.test(text)) channel = "Discord";
  else if (/email/.test(text)) channel = "Email";

  const message_template = generateCopy(trigger_type, trigger_config, offer_code);
  return { name, trigger_type, trigger_config, channel, message_template, offer_code };
}

export function generateCopy(t: TriggerType, cfg: Record<string, any>, offer?: string): string {
  switch (t) {
    case "Visit count":
      return `Hi {first_name}, thank you for being a loyal Lumière guest! Enjoy ${offer ? "$" + (offer.match(/\d+/)?.[0] || "50") + " off" : "a special offer"} on your next visit.${offer ? " Code: {credit_code}." : ""}`;
    case "Custom":
      return `Hi {first_name}, we have a special offer just for you.${offer ? " Use code {credit_code}." : ""} Book your next visit today.`;
    case "Birthday":
      return DEFAULT_BIRTHDAY_RULE_TEMPLATE;
    case "Inactivity":
      return `We miss you, {first_name}. It's been a while — come back for any treatment${offer ? ` with ${offer.match(/\d+/)?.[0]}% off using {credit_code}` : ""}. Tap to book.`;
    case "Treatment-based":
      return `Hi {first_name} — checking in after your ${cfg.treatment || "treatment"}. How are you feeling? Tap to rebook your next visit.`;
    case "Date-based":
      return `Save the date, {first_name}. Our exclusive offer is on${offer ? ` — ${offer.match(/\d+/)?.[0]}% off with code {credit_code}` : ""}. Limited spots.`;
    case "No-show recovery":
      return `Hi {first_name}, we missed you. No worries — tap here to rebook in one tap, on a day that works better.`;
  }
}
