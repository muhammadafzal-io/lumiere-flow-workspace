import type { ApprovalStatus } from "@/lib/booking/approvals";

/** Statuses a booking can report on the calendar and in staff views. */
export type BookingDisplayStatus = "awaiting_approval" | "rejected" | "pending" | "confirmed";

/**
 * How a booking presents once head-practitioner sign-off is taken into account.
 *
 * Sign-off outranks the existing pending/confirmed split, since "waiting on the client's details"
 * is not the thing staff need to act on when the clinic itself hasn't signed the booking off yet.
 * Bookings of services that need no sign-off have no approval record at all, so they fall through
 * to exactly the behaviour they had before.
 */
export function deriveBookingStatus(
  approval: ApprovalStatus | undefined,
  awaitingClientDetails: boolean,
): BookingDisplayStatus {
  if (approval === "PENDING") return "awaiting_approval";
  if (approval === "REJECTED") return "rejected";
  return awaitingClientDetails ? "pending" : "confirmed";
}
