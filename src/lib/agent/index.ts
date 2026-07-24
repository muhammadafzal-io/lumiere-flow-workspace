import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import { getSystemPrompt } from "./system-prompt";
import { TOOLS } from "./tools";
import {
  checkAvailability,
  bookAppointment,
  suggestSlot,
  findEarliestAvailability,
  resolveRequestedSlot,
  sanitizePractitionerFilter,
  selectPresentableSlots,
  parsePreferredTimeKey,
} from "@/lib/services/booking-service";
import {
  cancelCalendarEvent,
  rescheduleCalendarEvent,
  getCalendarBookingDetails,
} from "@/lib/integrations/google-calendar";
import {
  lookupClient,
  upsertClient,
  createAppointmentRecord,
  getPractitioners,
} from "@/lib/integrations/airtable";
import { listActiveServices } from "@/lib/booking/recipe";
import { validatePromoCode } from "@/lib/credits/validate-code";
import {
  validateBookAppointment,
  validateUpsertClientName,
  validateEscalation,
  validateCancelAppointment,
  validateRescheduleAppointment,
  normalizeEmail,
  sanitizeBookingEmails,
} from "@/lib/agent/booking-guards";
import { normalizeBirthdayForStorage } from "@/lib/birthday";
import {
  dateOfBirthNotPromoCodeError,
  looksLikeDateOfBirthInput,
  phoneRequiredForPromoError,
} from "@/lib/credits/promo-code-input";
import { extractPhoneForLookup, phoneDigits } from "@/lib/phone";
import { logEvent } from "@/lib/integrations/activity-log";
import { postEscalation } from "@/lib/integrations/slack";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { sendBookingConfirmationEmail } from "@/lib/booking/confirmation-email";
import {
  findUpcomingAppointmentEventId,
  resendBookingConfirmation,
} from "@/lib/booking/resend-confirmation";
import { getWidgetUrl, widgetLinkLine } from "@/lib/client-channels";
import { getOpenAIApiKey } from "@/lib/openai-config";
import {
  createCompletionLink,
  markCompletionDeliveryError,
  PENDING_NAME_PLACEHOLDER,
} from "@/lib/booking/completion-link";
import { findOpenCompletionByPhone } from "@/lib/booking/completion-followups";
import { sendSms } from "@/lib/integrations/sms";
import { getClinicBusinessHours, describeClinicHours } from "@/lib/booking/clinic-hours";
import type { AgentResult } from "@/types";
import {
  createVoiceFlowLogger,
  BOOKING_FLOW_TOOLS,
  summarizeForFlowLog,
} from "@/lib/voice/flow-log";
import { runWithFlowLogger } from "@/lib/voice/flow-context";
import { slotPresentLimit } from "@/lib/agent/shared-booking-rules";
import { dateFromIsoInTz, timeKeyInTz } from "@/lib/booking/dates";
import { getClinicConfig } from "@/lib/clinic-config";

function getOpenAI() {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

const MAX_TOOL_ROUNDS = 8;

const SMS_CONFIGURED = () =>
  !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );

/**
 * Creates the booking-completion link and delivers it on the best available channel:
 * email (if already on file) > SMS (voice calls only) > directly in the chat reply
 * (text-based channels with no email on file).
 *
 * The channel is decided synchronously (DB lookups + an env-var check only) so the model
 * always gets an accurate `sentVia` to relay to the client — but the actual network send
 * (the slow part: an email/SMS provider round-trip) is fired in the background, not awaited,
 * so it never adds latency to a live phone call. A background failure is recorded on the
 * `BookingCompletions` row (`markCompletionDeliveryError`) so it surfaces on the Pending
 * Bookings staff page instead of only a server log.
 */
async function deliverCompletionLink(opts: {
  eventId: string;
  phone: string;
  clientName?: string;
  treatment?: string;
  platform: string;
  appointmentStartTime: string;
}): Promise<{ url: string; sentVia: "email" | "sms" | "chat_reply" | "none"; note?: string }> {
  const client = await lookupClient({ phone: opts.phone }).catch(() => null);
  const email = client?.email;
  const { clinicName } = await getClinicConfig();

  const sentVia: "email" | "sms" | "chat_reply" | "none" = email
    ? "email"
    : opts.platform === "voice"
      ? SMS_CONFIGURED()
        ? "sms"
        : "none"
      : "chat_reply";

  const { url, token } = await createCompletionLink({
    eventId: opts.eventId,
    phone: opts.phone,
    clientName: opts.clientName,
    treatment: opts.treatment,
    appointmentStartTime: opts.appointmentStartTime,
    deliveryChannel: sentVia,
  });

  const recordFailure = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[completion-link] background delivery failed:", message);
    markCompletionDeliveryError(token, message).catch(() => undefined);
  };

  if (sentVia === "email") {
    void sendRetentionEmail({
      to: email!,
      subject: `Finish setting up your ${clinicName} appointment`,
      flowType: "booking",
      text: [
        `Hi${opts.clientName ? ` ${opts.clientName}` : ""}, thanks for booking with ${clinicName}!`,
        ``,
        `Please complete a few final details for your appointment${opts.treatment ? ` (${opts.treatment})` : ""} using the secure link below.`,
      ].join("\n"),
      cta: { label: "Complete My Booking", url },
    }).catch(recordFailure);
    return { url, sentVia };
  }

  if (sentVia === "sms") {
    void sendSms({
      to: opts.phone,
      body: `${clinicName}: finish setting up your appointment here: ${url}`,
    })
      .then((sms) => {
        if (!sms.sent) recordFailure(new Error(sms.error ?? "unknown SMS failure"));
      })
      .catch(recordFailure);
    return { url, sentVia };
  }

  if (sentVia === "none") {
    return {
      url,
      sentVia,
      note: "No delivery channel available (no email on file, SMS not configured). Let the client know staff will follow up to collect their name, email, and birthday.",
    };
  }

  return {
    url,
    sentVia,
    note: "No email on file and this isn't a voice call — include this exact link directly in your next reply so the client can finish their booking.",
  };
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: { platform: string; chatId: string },
): Promise<{ result: unknown; escalated?: boolean; booked?: boolean }> {
  const flow =
    context.platform === "voice" || BOOKING_FLOW_TOOLS.has(toolName)
      ? createVoiceFlowLogger(context.chatId, "server")
      : null;

  return runWithFlowLogger(flow, async () => {
    flow?.step(`agent:${toolName}:start`, { input: summarizeForFlowLog(input) });
    const { timezone: tz, clinicName } = await getClinicConfig();

    switch (toolName) {
      case "get_practitioners": {
        try {
          const practitioners = await getPractitioners(
            input.specialty ? { specialty: input.specialty as string } : undefined,
          );
          return {
            result: practitioners.map((p) => ({
              name: p.name,
              specialty: p.specialty ?? p.role ?? "General",
              bio: p.bio ?? "",
            })),
          };
        } catch (err) {
          return {
            result: {
              practitioners: [],
              note: "Practitioner list unavailable — proceed with check_availability without a practitioner filter.",
              error: err instanceof Error ? err.message : String(err),
            },
          };
        }
      }

      case "get_services": {
        try {
          const services = await listActiveServices(input.query as string | undefined);
          return {
            result: {
              services: services.map((s) => ({
                name: s.name,
                durationMinutes: s.durationMinutes,
                onlineBookable: s.onlineBookable,
                requiresConsultation: s.requiresConsultation,
              })),
              note:
                services.length === 0
                  ? "No configured service matched — use the knowledge base's description and a reasonable duration estimate instead."
                  : undefined,
            },
          };
        } catch (err) {
          return {
            result: {
              services: [],
              note: "Service list unavailable — use the knowledge base's treatment descriptions and durations instead.",
              error: err instanceof Error ? err.message : String(err),
            },
          };
        }
      }

      case "check_availability": {
        try {
          const preferredTimeRaw =
            (input.preferred_time as string | undefined) ||
            (input.time as string | undefined) ||
            undefined;
          const preferredTimeKey = parsePreferredTimeKey(preferredTimeRaw);
          flow?.step("availability:start", {
            date: input.date,
            duration_minutes: input.duration_minutes,
            treatment: input.treatment,
            practitioner_name: input.practitioner_name ?? input.preferred_practitioner,
            preferred_time: preferredTimeRaw,
            preferred_time_key: preferredTimeKey,
          });
          const practitionerName = await sanitizePractitionerFilter(
            (input.preferred_practitioner as string | undefined) ||
              (input.practitioner_name as string | undefined),
            input.treatment as string | undefined,
          );
          const availability = await checkAvailability({
            date: input.date as string,
            treatment: input.treatment as string | undefined,
            durationMinutes: (input.duration_minutes as number) ?? 60,
            practitionerName,
            room: input.preferred_room as string | undefined,
          });

          const slotLimit = slotPresentLimit(context.platform);
          const slots = selectPresentableSlots(availability.slots, slotLimit, preferredTimeKey);

          const requestedMatch = preferredTimeKey
            ? availability.slots.find((s) => timeKeyInTz(s.startTime, tz) === preferredTimeKey)
            : undefined;

          let summary: string;
          if (availability.slots.length === 0) {
            summary = availability.bookingWindowNote
              ? `${availability.bookingWindowNote} — this is a booking-policy limit for this treatment, not a full calendar. Tell the client this specific reason rather than saying it's fully booked; offer a date within the allowed window instead.`
              : `No open slots on ${availability.date}. Call find_earliest_availability (for soonest/ASAP) or try the next business day — do NOT escalate.`;
          } else if (preferredTimeKey && requestedMatch) {
            summary = `${preferredTimeRaw} IS available on ${availability.date} — book it with startTime ${requestedMatch.startTime} (pass date ${availability.date}). Other nearby options are included. Practitioners: ${availability.availablePractitioners.join(", ") || "any"}. Rooms: ${availability.availableRooms.join(", ") || "any"}.`;
          } else if (preferredTimeKey && !requestedMatch) {
            summary = `${preferredTimeRaw} is NOT open on ${availability.date}. The slots listed are the closest available times — offer these instead. Each includes startTime for book_appointment. Practitioners: ${availability.availablePractitioners.join(", ") || "any"}.`;
          } else {
            summary = `Found ${availability.slots.length} available slots on ${availability.date} spanning 9:00 AM–7:00 PM. The slots listed are spread across the day — present up to ${slotLimit}, and if the client wants a specific time, call check_availability again with preferred_time. Each slot includes startTime — pass that EXACT startTime as date_time in book_appointment (also pass date ${availability.date}). Practitioners: ${availability.availablePractitioners.join(", ") || "any"}. Rooms: ${availability.availableRooms.join(", ") || "any"}.`;
          }

          const availabilityResult = {
            date: availability.date,
            durationMinutes: availability.durationMinutes,
            slots,
            requestedTime: preferredTimeRaw,
            requestedTimeAvailable: preferredTimeKey ? Boolean(requestedMatch) : undefined,
            totalOpenSlots: availability.slots.length,
            availablePractitioners: availability.availablePractitioners,
            availableRooms: availability.availableRooms,
            summary,
          };
          flow?.step("availability:complete", {
            slotCount: availability.slots.length,
            requestedTime: preferredTimeRaw,
            requestedTimeAvailable: preferredTimeKey ? Boolean(requestedMatch) : undefined,
            result: summarizeForFlowLog(availabilityResult),
          });
          return { result: availabilityResult };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          flow?.step("availability:error", { error: errMsg });
          return {
            result: {
              error: errMsg,
              slots: [],
              summary: `Calendar check failed for ${input.date}: ${errMsg}. Try find_earliest_availability or the next business day — do NOT escalate for booking availability issues.`,
            },
          };
        }
      }

      case "find_earliest_availability": {
        try {
          flow?.step("earliest:start", { duration_minutes: input.duration_minutes });
          const practitionerName = await sanitizePractitionerFilter(
            (input.preferred_practitioner as string | undefined) ||
              (input.practitioner_name as string | undefined),
            input.treatment as string | undefined,
          );
          const result = await findEarliestAvailability({
            treatment: input.treatment as string | undefined,
            durationMinutes: (input.duration_minutes as number) ?? 60,
            practitionerName,
            room: input.preferred_room as string | undefined,
          });
          const slotLimit = slotPresentLimit(context.platform);
          const earliestResult = {
            earliestDate: result.earliestDate,
            datesChecked: result.datesChecked,
            slots: selectPresentableSlots(result.slots, slotLimit),
            summary: `${result.summary} Present up to ${slotLimit} slots. Pass the EXACT startTime of the chosen slot as date_time in book_appointment.`,
          };
          flow?.step("earliest:complete", { result: summarizeForFlowLog(earliestResult) });
          return { result: earliestResult };
        } catch (err) {
          return {
            result: {
              error: err instanceof Error ? err.message : String(err),
              slots: [],
              summary: "Could not search for earliest availability.",
            },
          };
        }
      }

      case "book_appointment": {
        const isVoice = context.platform === "voice";
        const guardError = await validateBookAppointment(input, {
          requireFullProfile: !isVoice,
        });
        if (guardError) {
          flow?.step("book:validation failed", { error: guardError });
          return { result: { error: guardError } };
        }
        flow?.step("book:validation passed");

        // Duplicate-booking guard: this phone number may already have an appointment sitting in
        // "waiting on the completion form" state. Surface it and let the model confirm with the
        // caller rather than silently stacking a second booking — same warn-don't-silently-block
        // pattern used by the Settings recipe engine's manual-override warnings.
        if (input.confirm_new_booking !== true) {
          const existing = await findOpenCompletionByPhone(
            String(input.client_contact ?? ""),
          ).catch(() => null);
          if (existing) {
            flow?.step("book:duplicate pending completion", { eventId: existing.eventId });
            return {
              result: {
                warning: `This phone number already has an appointment (${existing.treatment ?? "a service"}) still waiting on a couple final details. Confirm with the caller whether this is about that same appointment or a genuinely new visit before booking again — if it's a new visit, call book_appointment again with confirm_new_booking: true.`,
                existing_event_id: existing.eventId,
              },
            };
          }
        }

        const durationMin = (input.duration_minutes as number) ?? 60;
        const bookingDate =
          (input.date as string | undefined) || (input.booking_date as string | undefined);
        let startTime = input.date_time as string;
        let endTime = new Date(new Date(startTime).getTime() + durationMin * 60_000).toISOString();

        let room = input.room as string | undefined;
        let practitioner = input.practitioner_name as string | undefined;

        try {
          flow?.step("book:resolve slot", { startTime, durationMin, practitioner, bookingDate });
          const resolved = await resolveRequestedSlot({
            startTime,
            durationMinutes: durationMin,
            preferredPractitioner: practitioner,
            preferredRoom: room,
            treatment: input.treatment as string | undefined,
            date: bookingDate,
          });
          startTime = resolved.slot.startTime;
          endTime = resolved.slot.endTime;
          room = resolved.room;
          practitioner = resolved.practitioner;
          flow?.step("book:slot resolved", { startTime, endTime, room, practitioner });
        } catch (err) {
          // resolveRequestedSlot re-validates the exact slot; if the model already has a
          // suggestion instead (rather than an exact known-open startTime), fall back to
          // suggestSlot's lighter-weight room/practitioner assignment instead of failing outright.
          try {
            const suggestion = await suggestSlot({
              date: startTime.split("T")[0],
              durationMinutes: durationMin,
              preferredPractitioner: practitioner,
              preferredRoom: room,
              treatment: input.treatment as string,
            });
            room = room || suggestion.room;
            practitioner = practitioner || suggestion.practitioner;
          } catch {
            const error =
              err instanceof Error ? err.message : "Could not find available room/practitioner";
            flow?.step("book:slot failed", { error });
            return { result: { error } };
          }
        }

        // Voice no longer collects a name during the call — book with whatever the caller
        // volunteered, or a placeholder that gets overwritten once the completion form is submitted.
        const rawClientName = String(input.client_name ?? "").trim();
        const resolvedClientName =
          rawClientName || (isVoice ? PENDING_NAME_PLACEHOLDER : rawClientName);

        const apptData = {
          clientName: resolvedClientName,
          clientContact: input.client_contact as string,
          clientEmail: normalizeEmail(input.client_email) || undefined,
          treatment: input.treatment as string,
          startTime,
          endTime,
          practitionerName: practitioner!,
          room: room!,
          bookingDate,
          notes: input.notes as string | undefined,
          source: "bot" as const,
        };
        flow?.step("book:calendar create", {
          clientEmail: apptData.clientEmail,
          clientName: apptData.clientName,
          treatment: apptData.treatment,
          startTime: apptData.startTime,
        });

        try {
          const appt = await bookAppointment(apptData);
          flow?.step("book:calendar created", { eventId: appt.id });

          const storedBirthday = normalizeBirthdayForStorage(String(input.birthday ?? ""));
          const visitDate = dateFromIsoInTz(apptData.startTime, tz);
          if (input.client_email || apptData.clientContact) {
            flow?.step("book:upsert client", {
              email: normalizeEmail(input.client_email),
              phone: apptData.clientContact,
              lastVisit: visitDate,
              lastTreatment: apptData.treatment,
            });
            await upsertClient({
              name: apptData.clientName,
              phone: apptData.clientContact || undefined,
              email: normalizeEmail(input.client_email) || undefined,
              lastVisit: visitDate,
              lastTreatment: apptData.treatment,
              ...(storedBirthday ? { birthday: storedBirthday } : {}),
            }).catch(() => undefined);
          }

          const clientRecord = await lookupClient({ phone: apptData.clientContact }).catch(
            () => null,
          );
          await createAppointmentRecord(
            {
              clientName: apptData.clientName,
              treatment: apptData.treatment,
              startTime: apptData.startTime,
              endTime: apptData.endTime,
              clientContact: apptData.clientContact,
              notes: apptData.notes,
            },
            clientRecord?.id,
          ).catch(() => undefined);
          flow?.step("book:crm record saved", { clientId: clientRecord?.id });

          const clientEmail = (input.client_email as string | undefined) || clientRecord?.email;

          let confirmationEmailSent = false;
          if (clientEmail) {
            try {
              flow?.step("book:send confirmation email", { to: clientEmail });
              await sendBookingConfirmationEmail({
                to: clientEmail,
                clientName: apptData.clientName,
                treatment: apptData.treatment,
                startTime: apptData.startTime,
                practitionerName: apptData.practitionerName,
                notes: apptData.notes,
                clientId: clientRecord?.id,
                phone: apptData.clientContact,
              });
              confirmationEmailSent = true;
              flow?.step("book:confirmation email sent", { to: clientEmail });
            } catch (e) {
              console.error(`[agent/book] confirmation email failed:`, e);
              flow?.step("book:confirmation email failed", {
                to: clientEmail,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          } else {
            flow?.step("book:no email to send");
          }

          await logEvent(
            "booking",
            apptData.clientName,
            `Booked ${apptData.treatment} on ${apptData.startTime} with ${apptData.practitionerName} in ${apptData.room}`,
            {
              clientId: clientRecord?.id,
              phone: apptData.clientContact,
              email: clientEmail,
              platform: context.platform,
            },
          ).catch((e) => {
            console.error("[agent/book] ops log failed:", e);
            flow?.step("book:ops log failed", {
              error: e instanceof Error ? e.message : String(e),
            });
          });
          flow?.step("book:ops log written");

          // Completion link is a voice-only concept — chat already collected everything inline
          // (validateBookAppointment required it above), so there's nothing left to complete and
          // no link should ever be created for chat/Discord bookings.
          const profileComplete =
            resolvedClientName !== PENDING_NAME_PLACEHOLDER &&
            !!clientEmail &&
            !!normalizeBirthdayForStorage(String(input.birthday ?? ""));
          let completionLink: Awaited<ReturnType<typeof deliverCompletionLink>> | null = null;
          if (isVoice && !profileComplete) {
            flow?.step("book:deliver completion link", { eventId: appt.id });
            completionLink = await deliverCompletionLink({
              eventId: appt.id,
              phone: apptData.clientContact,
              clientName:
                apptData.clientName === PENDING_NAME_PLACEHOLDER ? undefined : apptData.clientName,
              treatment: apptData.treatment,
              platform: context.platform,
              appointmentStartTime: apptData.startTime,
            }).catch((err) => {
              console.error("[agent/book] completion link failed:", err);
              flow?.step("book:completion link failed", {
                error: err instanceof Error ? err.message : String(err),
              });
              return null;
            });
          }

          const result = {
            ...appt,
            event_id: appt.id,
            confirmation_email_sent: confirmationEmailSent,
            confirmation_sent_to: confirmationEmailSent ? clientEmail : undefined,
            completion_link: completionLink
              ? {
                  sent_via: completionLink.sentVia,
                  url: completionLink.url,
                  note: completionLink.note,
                }
              : undefined,
          };
          flow?.step("book:complete", { result: summarizeForFlowLog(result) });
          return { result, booked: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : "Booking failed";
          flow?.step("book:failed", { error });
          return { result: { error } };
        }
      }

      case "send_booking_completion_link": {
        try {
          const eventId = String(input.event_id ?? "");
          const booking = await getCalendarBookingDetails(eventId);
          const result = await deliverCompletionLink({
            eventId,
            phone: String(input.client_contact ?? ""),
            clientName: input.client_name as string | undefined,
            treatment: input.treatment as string | undefined,
            platform: context.platform,
            appointmentStartTime: booking.startTime,
          });
          return { result };
        } catch (err) {
          return {
            result: {
              error: err instanceof Error ? err.message : "Could not send the completion link.",
            },
          };
        }
      }

      case "resend_booking_confirmation": {
        const email = normalizeEmail(input.client_email);
        if (!email) {
          return {
            result: { error: "Valid client_email is required to resend the confirmation." },
          };
        }

        let eventId = String(input.event_id ?? "").trim() || undefined;
        if (!eventId && input.client_contact) {
          eventId =
            (await findUpcomingAppointmentEventId(String(input.client_contact))) ?? undefined;
        }
        if (!eventId) {
          return {
            result: {
              error:
                "Could not find the appointment. Pass event_id from book_appointment, or client_contact (phone) to look up their upcoming booking.",
            },
          };
        }

        try {
          const sent = await resendBookingConfirmation({ eventId, to: email });
          return { result: sent };
        } catch (err) {
          return {
            result: {
              error: err instanceof Error ? err.message : "Failed to resend booking confirmation",
            },
          };
        }
      }

      case "cancel_appointment": {
        const guardError = await validateCancelAppointment(input);
        if (guardError) {
          flow?.step("cancel:validation failed", { error: guardError });
          return { result: { error: guardError } };
        }
        flow?.step("cancel:validation passed", {
          event_id: input.event_id,
          phone: input.phone ?? input.client_contact,
          client_name: input.client_name,
          treatment: input.appointment_treatment,
          start_time: input.appointment_start_time,
        });

        const eventId = input.event_id as string;
        const phone = String(input.phone ?? input.client_contact ?? "");

        const { resolveAppointmentNotificationEmail } =
          await import("@/lib/booking/appointment-by-phone");
        flow?.step("cancel:fetch calendar details", { eventId });
        const bookingBefore = await getCalendarBookingDetails(eventId).catch(() => null);
        flow?.step("cancel:calendar details", {
          found: Boolean(bookingBefore),
          clientEmail: bookingBefore?.clientEmail,
          treatment: bookingBefore?.treatment,
        });

        const cancelEmail = await resolveAppointmentNotificationEmail({
          phone,
          eventId,
          hintEmail: normalizeEmail(input.client_email),
          calendarEmail: bookingBefore?.clientEmail,
        });
        flow?.step("cancel:notification email resolved", { email: cancelEmail });

        let cancelled: Awaited<ReturnType<typeof cancelCalendarEvent>>;
        try {
          flow?.step("cancel:delete calendar event", { eventId });
          cancelled = await cancelCalendarEvent(eventId);
          flow?.step("cancel:calendar deleted", {
            clientName: cancelled.clientName,
            treatment: cancelled.treatment,
            startTime: cancelled.startTime,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const notFound =
            message.includes("404") ||
            message.toLowerCase().includes("not found") ||
            (err as { code?: number })?.code === 404;
          if (notFound) {
            flow?.step("cancel:calendar not found", { eventId });
            return {
              result: {
                error:
                  "That appointment was not found — it may have already been cancelled. Call find_upcoming_appointment with their phone to confirm.",
              },
            };
          }
          return { result: { error: `Could not cancel appointment: ${message}` } };
        }

        let confirmationEmailSent = false;
        let emailSkippedReason: string | undefined;

        if (cancelEmail) {
          flow?.step("cancel:send email", { to: cancelEmail });
          const businessHoursLabel = describeClinicHours(await getClinicBusinessHours());
          const displayTime = cancelled.startTime
            ? new Date(cancelled.startTime).toLocaleString("en-US", {
                timeZone: tz,
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZoneName: "short",
              })
            : "your scheduled time";

          try {
            const outcome = await sendRetentionEmail({
              to: cancelEmail,
              subject: `Your ${cancelled.treatment} appointment has been cancelled`,
              flowType: "cancellation",
              logMeta: {
                category: "cancellation",
                triggerType: "system",
                sourceId: eventId,
                clientName: cancelled.clientName,
              },
              text: [
                `Hi ${cancelled.clientName}, your appointment at ${clinicName} has been cancelled.`,
                ``,
                `Treatment: ${cancelled.treatment}`,
                `Original Date: ${displayTime}`,
                ``,
                `We'd love to rebook you at a time that works better. Reply here or visit us ${businessHoursLabel}.`,
                widgetLinkLine(),
                ``,
                `— The ${clinicName} Team`,
              ].join("\n"),
              cta: {
                label: "Book a New Appointment",
                url: getWidgetUrl(),
              },
            });
            confirmationEmailSent = outcome.sent;
            if (!outcome.sent) emailSkippedReason = outcome.error ?? "Email delivery failed";
            flow?.step("cancel:email result", {
              sent: confirmationEmailSent,
              reason: emailSkippedReason,
            });
          } catch (e) {
            console.error(`[agent/cancel] cancellation email failed:`, e);
            emailSkippedReason =
              e instanceof Error ? e.message : "Cancellation email could not be sent";
            flow?.step("cancel:email failed", { error: emailSkippedReason });
          }
        } else {
          emailSkippedReason = "No email on file for this client";
          flow?.step("cancel:email skipped", { reason: emailSkippedReason });
        }

        await logEvent(
          "cancellation",
          cancelled.clientName,
          `Appointment cancelled via ${context.platform}: ${cancelled.treatment}`,
          {
            phone: cancelled.clientContact || phone,
            email: cancelEmail,
            platform: context.platform,
          },
        );

        const cancelResult = {
          ok: true,
          ...cancelled,
          confirmation_email_sent: confirmationEmailSent,
          confirmation_sent_to: confirmationEmailSent ? cancelEmail : undefined,
          email_skipped_reason: emailSkippedReason,
        };
        flow?.step("cancel:complete", { result: summarizeForFlowLog(cancelResult) });
        return { result: cancelResult };
      }

      case "reschedule_appointment": {
        const guardError = await validateRescheduleAppointment(input);
        if (guardError) {
          flow?.step("reschedule:validation failed", { error: guardError });
          return { result: { error: guardError } };
        }
        flow?.step("reschedule:validation passed", {
          event_id: input.event_id,
          phone: input.phone ?? input.client_contact,
          new_date_time: input.new_date_time,
          client_name: input.client_name,
          treatment: input.appointment_treatment,
          current_start_time: input.appointment_start_time,
        });

        const eventId = input.event_id as string;
        const phone = String(input.phone ?? input.client_contact ?? "");
        const newStartTime = input.new_date_time as string;
        const durationMin =
          (input.duration_minutes as number | undefined) ??
          (input.appointment_treatment
            ? (await import("@/lib/booking/appointment-duration")).durationMinutesForTreatmentName(
                String(input.appointment_treatment),
              )
            : 60);
        const newEndTime = new Date(
          new Date(newStartTime).getTime() + durationMin * 60_000,
        ).toISOString();

        const { resolveAppointmentNotificationEmail } =
          await import("@/lib/booking/appointment-by-phone");
        flow?.step("reschedule:fetch calendar details", { eventId });
        const bookingBefore = await getCalendarBookingDetails(eventId).catch(() => null);
        flow?.step("reschedule:calendar details", {
          found: Boolean(bookingBefore),
          clientEmail: bookingBefore?.clientEmail,
        });

        const rescheduleEmail = await resolveAppointmentNotificationEmail({
          phone,
          eventId,
          hintEmail: normalizeEmail(input.client_email),
          calendarEmail: bookingBefore?.clientEmail,
        });
        flow?.step("reschedule:notification email resolved", { email: rescheduleEmail });

        flow?.step("reschedule:update calendar", { eventId, newStartTime, newEndTime });
        const rescheduled = await rescheduleCalendarEvent(eventId, newStartTime, newEndTime);
        flow?.step("reschedule:calendar updated", {
          clientName: rescheduled.clientName,
          oldStartTime: rescheduled.oldStartTime,
          newStartTime: rescheduled.newStartTime,
        });

        let confirmationEmailSent = false;
        let emailSkippedReason: string | undefined;

        if (rescheduleEmail) {
          flow?.step("reschedule:send email", { to: rescheduleEmail });
          const { address: clinicAddress } = await getClinicConfig();
          const businessHoursLabel = describeClinicHours(await getClinicBusinessHours());
          const fmtTime = (iso: string) =>
            new Date(iso).toLocaleString("en-US", {
              timeZone: tz,
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });

          try {
            const outcome = await sendRetentionEmail({
              to: rescheduleEmail,
              subject: `Your ${rescheduled.treatment} appointment has been rescheduled`,
              flowType: "reschedule",
              logMeta: {
                category: "reschedule",
                triggerType: "system",
                sourceId: eventId,
                clientName: rescheduled.clientName,
              },
              text: [
                `Hi ${rescheduled.clientName}, your ${clinicName} appointment has been rescheduled.`,
                ``,
                `Treatment: ${rescheduled.treatment}`,
                rescheduled.oldStartTime ? `Old Date: ${fmtTime(rescheduled.oldStartTime)}` : "",
                `New Date: ${fmtTime(rescheduled.newStartTime)}`,
                `Location: ${clinicAddress}`,
                ``,
                `Need further changes? Reply here or contact us ${businessHoursLabel}.`,
                widgetLinkLine(),
                ``,
                `See you soon!`,
                `— The ${clinicName} Team`,
              ]
                .filter(Boolean)
                .join("\n"),
              cta: {
                label: "View Location",
                url: `https://maps.google.com/?q=${encodeURIComponent(clinicAddress)}`,
              },
            });
            confirmationEmailSent = outcome.sent;
            if (!outcome.sent) emailSkippedReason = outcome.error ?? "Email delivery failed";
            flow?.step("reschedule:email result", {
              sent: confirmationEmailSent,
              reason: emailSkippedReason,
            });
          } catch (e) {
            console.error(`[agent/reschedule] reschedule email failed:`, e);
            emailSkippedReason =
              e instanceof Error ? e.message : "Reschedule email could not be sent";
            flow?.step("reschedule:email failed", { error: emailSkippedReason });
          }
        } else {
          emailSkippedReason = "No email on file for this client";
          flow?.step("reschedule:email skipped", { reason: emailSkippedReason });
        }

        await logEvent(
          "reschedule",
          rescheduled.clientName,
          `Appointment rescheduled via ${context.platform}: ${rescheduled.treatment}`,
          {
            phone: rescheduled.clientContact || phone,
            email: rescheduleEmail,
            platform: context.platform,
          },
        );

        const rescheduleResult = {
          ok: true,
          ...rescheduled,
          confirmation_email_sent: confirmationEmailSent,
          confirmation_sent_to: confirmationEmailSent ? rescheduleEmail : undefined,
          email_skipped_reason: emailSkippedReason,
        };
        flow?.step("reschedule:complete", { result: summarizeForFlowLog(rescheduleResult) });
        return { result: rescheduleResult };
      }

      case "find_upcoming_appointment": {
        const rawPhone = String(input.phone ?? input.client_contact ?? "").trim();
        if (!rawPhone) {
          flow?.step("fetch:upcoming failed", { reason: "missing phone" });
          return { result: { error: "phone is required to look up an upcoming appointment." } };
        }
        const phone = extractPhoneForLookup(rawPhone) || rawPhone;
        flow?.step("fetch:upcoming start", { rawPhone, normalizedPhone: phone });
        const { findUpcomingAppointmentByPhone } =
          await import("@/lib/booking/appointment-by-phone");
        const appt = await findUpcomingAppointmentByPhone(phone);
        if (!appt) {
          flow?.step("fetch:upcoming not found", { phone });
          return {
            result: {
              found: false,
              summary: "No upcoming appointment found for this phone number.",
            },
          };
        }
        const displayTime = new Date(appt.startTime).toLocaleString("en-US", {
          timeZone: tz,
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        const { durationMinutesForAppointment } =
          await import("@/lib/booking/appointment-duration");
        const durationMinutes = durationMinutesForAppointment(appt);
        const upcomingResult = {
          found: true,
          event_id: appt.eventId,
          client_name: appt.clientName,
          treatment: appt.treatment,
          start_time: appt.startTime,
          display_time: displayTime,
          duration_minutes: durationMinutes,
          client_email: appt.clientEmail,
          practitioner_name: appt.practitionerName,
          room: appt.room,
          summary: `Upcoming ${appt.treatment} for ${appt.clientName} on ${displayTime} (${durationMinutes} min). If caller wants CANCEL: call cancel_appointment with phone only — do NOT use check_reschedule_availability. If RESCHEDULE: ask new date, call check_reschedule_availability(phone, date), then reschedule_appointment(phone, new_date_time). Do NOT ask for name, email, or birthday.`,
        };
        flow?.step("fetch:upcoming complete", { result: summarizeForFlowLog(upcomingResult) });
        return { result: upcomingResult };
      }

      case "check_reschedule_availability": {
        const rawPhone = String(input.phone ?? input.client_contact ?? "").trim();
        const date = String(input.date ?? "").trim();
        if (!rawPhone) {
          flow?.step("reschedule-check:failed", { reason: "missing phone" });
          return { result: { error: "phone is required to check reschedule availability." } };
        }
        if (!date) {
          flow?.step("reschedule-check:failed", { reason: "missing date" });
          return {
            result: { error: "date is required (YYYY-MM-DD) for the new appointment day." },
          };
        }

        const phone = extractPhoneForLookup(rawPhone) || rawPhone;
        flow?.step("reschedule-check:start", { phone, date });
        const { findUpcomingAppointmentByPhone } =
          await import("@/lib/booking/appointment-by-phone");
        const appt = await findUpcomingAppointmentByPhone(phone);
        if (!appt) {
          flow?.step("reschedule-check:no appointment", { phone });
          return {
            result: {
              error:
                "No upcoming appointment found for this phone number. Confirm the number or use find_upcoming_appointment first.",
            },
          };
        }

        const { durationMinutesForAppointment } =
          await import("@/lib/booking/appointment-duration");
        const durationMinutes = durationMinutesForAppointment(appt);

        flow?.step("reschedule-check:current appointment", {
          event_id: appt.eventId,
          client_name: appt.clientName,
          treatment: appt.treatment,
          start_time: appt.startTime,
          duration_minutes: durationMinutes,
        });

        try {
          const preferredTimeRaw = (input.preferred_time as string | undefined) || undefined;
          const preferredTimeKey = parsePreferredTimeKey(preferredTimeRaw);

          // Caller may request a different practitioner; fall back to original.
          const preferredPrac =
            (input.preferred_practitioner as string | undefined) ||
            (input.practitioner_name as string | undefined) ||
            undefined;
          const practitionerName = await sanitizePractitionerFilter(
            preferredPrac ?? appt.practitionerName,
            appt.treatment,
          );

          flow?.step("reschedule-check:check availability", {
            date,
            practitioner: practitionerName,
            preferred_time: preferredTimeRaw,
          });
          const availability = await checkAvailability({
            date,
            treatment: appt.treatment,
            durationMinutes,
            practitionerName,
          });

          const currentDisplay = new Date(appt.startTime).toLocaleString("en-US", {
            timeZone: tz,
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });

          const slotLimit = slotPresentLimit(context.platform);
          const slots = selectPresentableSlots(availability.slots, slotLimit, preferredTimeKey);

          const requestedMatch = preferredTimeKey
            ? availability.slots.find((s) => timeKeyInTz(s.startTime, tz) === preferredTimeKey)
            : undefined;

          let summary: string;
          if (availability.slots.length === 0) {
            summary = `No open slots on ${availability.date} for ${appt.treatment}. Try the next business day with check_reschedule_availability — do NOT ask for contact info.`;
          } else if (preferredTimeKey && requestedMatch) {
            summary = `${preferredTimeRaw} IS available on ${availability.date} for rescheduling — use startTime ${requestedMatch.startTime}. Pass phone + that exact startTime as new_date_time to reschedule_appointment. Do NOT ask for name, email, or birthday.`;
          } else if (preferredTimeKey && !requestedMatch) {
            summary = `${preferredTimeRaw} is NOT open on ${availability.date}. The slots listed are the closest available times — offer these instead. Pass phone + the EXACT startTime of the chosen slot as new_date_time to reschedule_appointment. Do NOT ask for name, email, or birthday.`;
          } else {
            summary = `Reschedule slots for ${appt.clientName}'s ${appt.treatment} on ${availability.date}. Pass phone + the EXACT startTime of the chosen slot as new_date_time to reschedule_appointment. Do NOT ask for name, email, or birthday.`;
          }

          const rescheduleCheckResult = {
            client_name: appt.clientName,
            treatment: appt.treatment,
            current_appointment: currentDisplay,
            duration_minutes: durationMinutes,
            date: availability.date,
            slots,
            availablePractitioners: availability.availablePractitioners,
            availableRooms: availability.availableRooms,
            summary,
          };
          flow?.step("reschedule-check:complete", {
            slotCount: availability.slots.length,
            result: summarizeForFlowLog(rescheduleCheckResult),
          });
          return { result: rescheduleCheckResult };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          flow?.step("reschedule-check:error", { error: errMsg, date });
          return {
            result: {
              error: errMsg,
              slots: [],
              summary: `Could not check reschedule slots for ${date}: ${errMsg}. Try another date.`,
            },
          };
        }
      }

      case "lookup_client": {
        const client = await lookupClient({
          telegramId: input.telegram_id as string | undefined,
          phone: input.phone as string | undefined,
        });
        return { result: client };
      }

      case "upsert_client": {
        flow?.step("upsert:input", { input: summarizeForFlowLog(input) });
        const nameError = validateUpsertClientName(input.name);
        if (nameError) {
          flow?.step("upsert:validation failed", { error: nameError });
          return { result: { error: nameError } };
        }
        flow?.step("upsert:validation passed");
        sanitizeBookingEmails(input);
        const storedBirthday = normalizeBirthdayForStorage(String(input.birthday ?? ""));
        const storedEmail = normalizeEmail(input.email);
        flow?.step("upsert:save client", {
          name: input.name,
          email: storedEmail,
          phone: input.phone,
          birthday: storedBirthday,
          lastVisit: input.last_visit,
          lastTreatment: input.last_treatment,
          telegramId: input.telegram_id,
        });
        const client = await upsertClient({
          name: input.name as string,
          phone: input.phone as string | undefined,
          email: storedEmail,
          telegramId: input.telegram_id as string | undefined,
          lastVisit: input.last_visit as string | undefined,
          lastTreatment: input.last_treatment as string | undefined,
          birthday: storedBirthday,
          status:
            (input.status as "Active" | "Dormant" | "No-show" | "Discard" | undefined) ?? "Active",
          notes: input.notes as string | undefined,
          appointments: input.appointments as string | undefined,
        });
        const upsertResult = {
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
        };
        flow?.step("upsert:complete", { result: summarizeForFlowLog(upsertResult) });
        return { result: upsertResult };
      }

      case "log_operation": {
        await logEvent(
          input.event_type as Parameters<typeof logEvent>[0],
          (input.client_name as string) ?? "Unknown",
          input.details as string,
          {
            clientId: input.client_id as string | undefined,
            phone: input.phone as string | undefined,
            email: input.email as string | undefined,
            status: (input.status as "success" | "pending" | "failed") ?? "success",
            platform: (input.platform as string) ?? context.platform,
          },
        );
        return { result: { logged: true } };
      }

      case "validate_credit_code": {
        const code = (input.code as string)?.trim();
        const phone = String(input.phone ?? input.client_contact ?? "").trim();
        if (!phone || phoneDigits(extractPhoneForLookup(phone)).length < 7) {
          return { result: { valid: false, error: phoneRequiredForPromoError() } };
        }
        if (code && looksLikeDateOfBirthInput(code)) {
          return { result: { valid: false, error: dateOfBirthNotPromoCodeError() } };
        }
        const result = await validatePromoCode(code, { phone });
        if (!result.valid) {
          return {
            result: {
              valid: false,
              error: result.error,
              clientName: result.clientName,
            },
          };
        }
        return { result };
      }

      case "escalate_to_human": {
        const guardError = await validateEscalation(input);
        if (guardError) {
          return { result: { error: guardError, escalated: false } };
        }

        const clientName = String(input.client_name).trim();
        const phone = String(input.phone ?? input.client_contact).trim();
        const email = normalizeEmail(input.client_email ?? input.email)!;

        await postEscalation({
          reason: input.reason as string,
          clientName,
          phone,
          email,
          clientInfo: `${clientName} · ${phone} · ${email}`,
          conversationSummary: input.conversation_summary as string,
          platform: context.platform,
        });
        await logEvent("escalation", clientName, input.reason as string, {
          phone,
          email,
          platform: context.platform,
        });
        return { result: { escalated: true }, escalated: true };
      }

      default:
        return { result: { error: `Unknown tool: ${toolName}` } };
    }
  });
}

export async function runAgent(opts: {
  userMessage: string;
  history: ChatCompletionMessageParam[];
  platform: string;
  chatId: string;
}): Promise<AgentResult> {
  const { userMessage, history, platform, chatId } = opts;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: await getSystemPrompt() },
    ...history,
    { role: "user", content: userMessage },
  ];

  let escalated = false;
  let booked = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      tools: TOOLS,
      messages,
    });

    const choice = response.choices[0];

    if (choice.finish_reason === "stop") {
      const text = choice.message.content ?? "";

      const storedMessages: ChatCompletionMessageParam[] = [
        ...messages.slice(1),
        { role: "assistant", content: text },
      ];

      return { text, escalated, booked, messages: storedMessages };
    }

    if (choice.finish_reason === "tool_calls") {
      const toolCalls = choice.message.tool_calls ?? [];

      messages.push(choice.message);

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let input: Record<string, unknown>;

        try {
          input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: "Error: could not parse tool arguments",
          });
          continue;
        }

        try {
          const {
            result,
            escalated: esc,
            booked: bkd,
          } = await executeTool(toolName, input, { platform, chatId });
          if (esc) escalated = true;
          if (bkd) booked = true;

          const resultStr = JSON.stringify(result);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: resultStr,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Error: ${errMsg}`,
          });
        }
      }

      continue;
    }

    break;
  }

  return {
    text: "I'm sorry, I ran into an issue. Please try again or message us directly.",
    escalated,
    booked,
    messages: messages.slice(1),
  };
}
