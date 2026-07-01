import "server-only";

import { lookupClient } from "@/lib/integrations/airtable";
import { getEventsByRange } from "@/lib/integrations/google-calendar";
import type { AudienceFilters } from "@/lib/retention/audience-config";
import { fetchSentFollowupAppointmentIds } from "@/lib/retention/followup-sends";

export interface FollowupCandidate {
  appointmentId: string;
  clientName: string;
  clientContact: string;
  treatment: string;
  startTime: string;
  endTime: string;
  email?: string;
  clientId?: string;
  daysSinceEnd: number;
}

function chicagoDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function daysSinceEnd(endTime: string, now = Date.now()): number {
  return (now - new Date(endTime).getTime()) / 86400000;
}

export async function listFollowupCandidates(
  filters: AudienceFilters,
  opts?: { skipSentCheck?: boolean },
): Promise<FollowupCandidate[]> {
  const minDays = Math.max(0, filters.followup_min_days ?? 1);
  const maxDays = Math.max(minDays, filters.followup_max_days ?? 14);
  const now = Date.now();

  const from = new Date(now - maxDays * 86400000);
  const to = new Date(now);
  const events = await getEventsByRange(chicagoDateString(from), chicagoDateString(to));

  const sentIds = opts?.skipSentCheck ? new Set<string>() : await fetchSentFollowupAppointmentIds();
  const candidates: FollowupCandidate[] = [];

  for (const event of events) {
    const endMs = new Date(event.endTime).getTime();
    if (endMs >= now) continue;

    const days = daysSinceEnd(event.endTime, now);
    if (days < minDays || days > maxDays) continue;

    if (filters.treatment?.length) {
      const t = event.treatment.toLowerCase();
      if (!filters.treatment.some((x) => t.includes(x.toLowerCase()))) continue;
    }

    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay = `${event.clientName} ${event.treatment} ${event.clientContact}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    if (sentIds.has(event.id) && filters.followup_not_sent !== false) continue;

    const client = event.clientContact
      ? await lookupClient({ phone: event.clientContact }).catch(() => null)
      : null;

    const email = client?.email?.trim();
    const displayName = client?.name?.trim() || event.clientName;

    if (filters.has_email === true && !email) continue;
    if (filters.has_email === false && email) continue;

    if (filters.has_contact === true && !event.clientContact && !client?.telegramId) continue;

    candidates.push({
      appointmentId: event.id,
      clientName: displayName,
      clientContact: event.clientContact,
      treatment: event.treatment,
      startTime: event.startTime,
      endTime: event.endTime,
      email,
      clientId: client?.id,
      daysSinceEnd: Math.floor(days * 10) / 10,
    });
  }

  return candidates.sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
}
