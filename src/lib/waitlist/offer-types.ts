/**
 * Shared shape for a WaitlistOffer row — split out from matching.ts so both notify.ts and
 * matching.ts can depend on it without importing each other (matching.ts calls notify.ts to send
 * the offer; notify.ts only needs the offer's shape, not matching's own logic).
 */
import { getAppBaseUrl } from "@/lib/client-channels";

export type WaitlistOfferStatus = "pending" | "accepted" | "declined" | "expired" | "superseded";

export interface WaitlistOffer {
  id: string;
  waitlistId: string;
  token: string;
  slotStart: string;
  slotEnd: string;
  treatment: string;
  serviceId: string | null;
  practitionerName: string | null;
  room: string | null;
  equipment: string[];
  sourceEventId: string;
  status: WaitlistOfferStatus;
  expiresAt: string;
  respondedAt: string | null;
  bookedEventId: string | null;
  createdAt: string;
}

export function mapOfferRow(r: any): WaitlistOffer {
  return {
    id: r.id,
    waitlistId: r.waitlist_id,
    token: r.token,
    slotStart: r.slot_start,
    slotEnd: r.slot_end,
    treatment: r.treatment,
    serviceId: r.service_id,
    practitionerName: r.practitioner_name,
    room: r.room,
    equipment: r.equipment ?? [],
    sourceEventId: r.source_event_id,
    status: r.status,
    expiresAt: r.expires_at,
    respondedAt: r.responded_at,
    bookedEventId: r.booked_event_id,
    createdAt: r.created_at,
  };
}

export function waitlistAcceptUrl(token: string): string {
  return `${getAppBaseUrl()}/waitlist/accept/${token}`;
}
