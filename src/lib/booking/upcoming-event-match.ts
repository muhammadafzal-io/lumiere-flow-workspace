import { extractPhoneForLookup, phonesMatchAny, phoneSearchVariants } from "@/lib/phone";
import type { CalendarEvent } from "@/types";

export function findUpcomingEventForContact(
  events: CalendarEvent[],
  contact: string,
): CalendarEvent | undefined {
  return events.find((e) => phonesMatchAny(e.clientContact, contact));
}

function namesLikelyMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const aParts = a.trim().split(/\s+/).filter(Boolean);
  const bParts = b.trim().split(/\s+/).filter(Boolean);
  if (aParts.length < 2 || bParts.length < 2) return false;

  return (
    norm(aParts[0]) === norm(bParts[0]) &&
    norm(aParts[aParts.length - 1]) === norm(bParts[bParts.length - 1])
  );
}

export function findUpcomingEventByClientName(
  events: CalendarEvent[],
  clientName: string,
): CalendarEvent | undefined {
  const trimmed = clientName.trim();
  if (!trimmed) return undefined;
  return events.find((e) => namesLikelyMatch(e.clientName, trimmed));
}

/** Match phone variants against a pre-loaded upcoming event list. */
export function findUpcomingEventInList(
  events: CalendarEvent[],
  ...phones: string[]
): CalendarEvent | undefined {
  const variants = new Set<string>();
  for (const phone of phones) {
    if (!phone?.trim()) continue;
    for (const variant of phoneSearchVariants(phone, extractPhoneForLookup(phone))) {
      variants.add(variant);
    }
  }

  for (const event of events) {
    for (const variant of variants) {
      if (phonesMatchAny(event.clientContact, variant)) return event;
    }
  }
  return undefined;
}
