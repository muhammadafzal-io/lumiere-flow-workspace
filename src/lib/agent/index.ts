import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import { SYSTEM_PROMPT } from "./system-prompt";
import { TOOLS } from "./tools";
import {
  checkAvailability,
  bookAppointment,
  findEarliestAvailability,
  resolveRequestedSlot,
  sanitizePractitionerFilter,
} from "@/lib/services/booking-service";
import { cancelCalendarEvent, rescheduleCalendarEvent } from "@/lib/integrations/google-calendar";
import {
  lookupClient,
  upsertClient,
  createAppointmentRecord,
  getPractitioners,
} from "@/lib/integrations/airtable";
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
import type { AgentResult } from "@/types";
import {
  createVoiceFlowLogger,
  BOOKING_FLOW_TOOLS,
  summarizeForFlowLog,
} from "@/lib/voice/flow-log";
import { runWithFlowLogger } from "@/lib/voice/flow-context";
import { slotPresentLimit } from "@/lib/agent/shared-booking-rules";
import { chicagoDateFromIso } from "@/lib/booking/dates";

function getOpenAI() {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

const MAX_TOOL_ROUNDS = 8;

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

      case "check_availability": {
        try {
          flow?.step("availability:start", {
            date: input.date,
            duration_minutes: input.duration_minutes,
            practitioner_name: input.practitioner_name ?? input.preferred_practitioner,
          });
          const practitionerName = await sanitizePractitionerFilter(
            (input.preferred_practitioner as string | undefined) ||
              (input.practitioner_name as string | undefined),
            input.treatment as string | undefined,
          );
          const availability = await checkAvailability({
            date: input.date as string,
            durationMinutes: (input.duration_minutes as number) ?? 60,
            practitionerName,
            room: input.preferred_room as string | undefined,
          });

          const slotLimit = slotPresentLimit(context.platform);
          const slots = availability.slots.slice(0, slotLimit);

          const availabilityResult = {
            date: availability.date,
            durationMinutes: availability.durationMinutes,
            slots,
            availablePractitioners: availability.availablePractitioners,
            availableRooms: availability.availableRooms,
            summary:
              availability.slots.length > 0
                ? `Found ${availability.slots.length} available slots on ${availability.date}. Present up to ${slotLimit} to the client. Each slot includes startTime — when the client picks a time, pass that EXACT startTime as date_time in book_appointment (also pass date as YYYY-MM-DD). Practitioners: ${availability.availablePractitioners.join(", ") || "any"}. Rooms: ${availability.availableRooms.join(", ") || "any"}.`
                : `No open slots on ${availability.date}. Call find_earliest_availability (for soonest/ASAP) or try the next business day — do NOT escalate.`,
          };
          flow?.step("availability:complete", {
            slotCount: availability.slots.length,
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
            durationMinutes: (input.duration_minutes as number) ?? 60,
            practitionerName,
            room: input.preferred_room as string | undefined,
          });
          const slotLimit = slotPresentLimit(context.platform);
          const earliestResult = {
            earliestDate: result.earliestDate,
            datesChecked: result.datesChecked,
            slots: result.slots.slice(0, slotLimit),
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
        const guardError = await validateBookAppointment(input);
        if (guardError) {
          flow?.step("book:validation failed", { error: guardError });
          return { result: { error: guardError } };
        }
        flow?.step("book:validation passed");

        const durationMin = (input.duration_minutes as number) ?? 60;
        const bookingDate =
          (input.date as string | undefined) || (input.booking_date as string | undefined);
        let startTime = input.date_time as string;
        let endTime = new Date(new Date(startTime).getTime() + durationMin * 60_000).toISOString();

        let room = input.room as string | undefined;
        let practitioner = await sanitizePractitionerFilter(
          input.practitioner_name as string | undefined,
          input.treatment as string | undefined,
        );

        try {
          flow?.step("book:resolve slot", {
            startTime,
            durationMin,
            practitioner,
            bookingDate,
          });
          const resolved = await resolveRequestedSlot({
            startTime,
            durationMinutes: durationMin,
            preferredPractitioner: practitioner,
            preferredRoom: room,
            date: bookingDate,
          });
          startTime = resolved.slot.startTime;
          endTime = resolved.slot.endTime;
          room = resolved.room;
          practitioner = resolved.practitioner;
          flow?.step("book:slot resolved", {
            startTime,
            endTime,
            room,
            practitioner,
          });
        } catch (err) {
          const error =
            err instanceof Error ? err.message : "Could not find available room/practitioner";
          flow?.step("book:slot failed", { error });
          return {
            result: {
              error,
            },
          };
        }

        const apptData = {
          clientName: input.client_name as string,
          clientContact: input.client_contact as string,
          clientEmail: normalizeEmail(input.client_email) || undefined,
          treatment: input.treatment as string,
          startTime,
          endTime,
          practitionerName: practitioner!,
          room: room!,
          bookingDate,
          notes: input.notes as string | undefined,
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
          const visitDate = chicagoDateFromIso(apptData.startTime);
          flow?.step("book:upsert client", {
            email: normalizeEmail(input.client_email),
            phone: apptData.clientContact,
            lastVisit: visitDate,
            lastTreatment: apptData.treatment,
          });
          const upsertedClient = await upsertClient({
            name: apptData.clientName,
            phone: apptData.clientContact || undefined,
            email: normalizeEmail(input.client_email) || undefined,
            lastVisit: visitDate,
            lastTreatment: apptData.treatment,
            ...(storedBirthday ? { birthday: storedBirthday } : {}),
          }).catch(() => null);

          const clientRecord =
            upsertedClient ??
            (await lookupClient({ phone: apptData.clientContact }).catch(() => null));
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

          const result = {
            ...appt,
            event_id: appt.id,
            confirmation_email_sent: confirmationEmailSent,
            confirmation_sent_to: confirmationEmailSent ? clientEmail : undefined,
          };
          flow?.step("book:complete", { result: summarizeForFlowLog(result) });
          return {
            result,
            booked: true,
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : "Booking failed";
          flow?.step("book:failed", { error });
          return {
            result: {
              error,
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
        const { getCalendarBookingDetails } = await import("@/lib/integrations/google-calendar");
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
          const displayTime = cancelled.startTime
            ? new Date(cancelled.startTime).toLocaleString("en-US", {
                timeZone: "America/Chicago",
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
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
                `Hi ${cancelled.clientName}, your appointment at Lumière has been cancelled.`,
                ``,
                `Treatment: ${cancelled.treatment}`,
                `Original Date: ${displayTime} CT`,
                ``,
                `We'd love to rebook you at a time that works better. Reply here or visit us Monday–Saturday, 9 AM–7 PM.`,
                widgetLinkLine(),
                ``,
                `— The Lumière Team`,
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
        const { getCalendarBookingDetails } = await import("@/lib/integrations/google-calendar");
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
          const fmtTime = (iso: string) =>
            new Date(iso).toLocaleString("en-US", {
              timeZone: "America/Chicago",
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
                `Hi ${rescheduled.clientName}, your Lumière appointment has been rescheduled.`,
                ``,
                `Treatment: ${rescheduled.treatment}`,
                rescheduled.oldStartTime ? `Old Date: ${fmtTime(rescheduled.oldStartTime)} CT` : "",
                `New Date: ${fmtTime(rescheduled.newStartTime)} CT`,
                `Location: 2847 S Lamar Blvd, Suite 120, Austin TX 78704`,
                ``,
                `Need further changes? Reply here or contact us Monday–Saturday, 9 AM–7 PM.`,
                widgetLinkLine(),
                ``,
                `See you soon!`,
                `— The Lumière Team`,
              ]
                .filter(Boolean)
                .join("\n"),
              cta: {
                label: "View Location",
                url: "https://maps.google.com/?q=2847+S+Lamar+Blvd+Suite+120+Austin+TX",
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
          timeZone: "America/Chicago",
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
          summary: `Upcoming ${appt.treatment} for ${appt.clientName} on ${displayTime} CT (${durationMinutes} min). If caller wants CANCEL: call cancel_appointment with phone only — do NOT use check_reschedule_availability. If RESCHEDULE: ask new date, call check_reschedule_availability(phone, date), then reschedule_appointment(phone, new_date_time). Do NOT ask for name, email, or birthday.`,
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
          flow?.step("reschedule-check:check availability", {
            date,
            practitioner: appt.practitionerName,
            room: appt.room,
          });
          const availability = await checkAvailability({
            date,
            durationMinutes,
            practitionerName: appt.practitionerName,
            room: appt.room,
          });

          const currentDisplay = new Date(appt.startTime).toLocaleString("en-US", {
            timeZone: "America/Chicago",
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });

          const rescheduleCheckResult = {
            client_name: appt.clientName,
            treatment: appt.treatment,
            current_appointment: currentDisplay,
            duration_minutes: durationMinutes,
            date: availability.date,
            slots: availability.slots.slice(0, 6),
            availablePractitioners: availability.availablePractitioners,
            availableRooms: availability.availableRooms,
            summary:
              availability.slots.length > 0
                ? `Reschedule slots for ${appt.clientName}'s ${appt.treatment} on ${availability.date}. Pass phone + the EXACT startTime of the chosen slot as new_date_time to reschedule_appointment. Do NOT ask for name, email, or birthday.`
                : `No open slots on ${availability.date} for ${appt.treatment}. Try the next business day with check_reschedule_availability — do NOT ask for contact info.`,
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
    { role: "system", content: SYSTEM_PROMPT },
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
