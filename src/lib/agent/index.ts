import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import { SYSTEM_PROMPT } from "./system-prompt";
import { TOOLS } from "./tools";
import {
  checkAvailability,
  bookAppointment,
  findEarliestAvailability,
  resolveRequestedSlot,
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
        const availability = await checkAvailability({
          date: input.date as string,
          durationMinutes: (input.duration_minutes as number) ?? 60,
          practitionerName:
            (input.preferred_practitioner as string | undefined) ||
            (input.practitioner_name as string | undefined),
          room: input.preferred_room as string | undefined,
        });

        return {
          result: {
            date: availability.date,
            durationMinutes: availability.durationMinutes,
            slots: availability.slots.slice(0, 6),
            availablePractitioners: availability.availablePractitioners,
            availableRooms: availability.availableRooms,
            summary:
              availability.slots.length > 0
                ? `Found ${availability.slots.length} available slots on ${availability.date}. Each slot includes startTime — when the client picks a time, pass that EXACT startTime as date_time in book_appointment (also pass date as YYYY-MM-DD). Practitioners: ${availability.availablePractitioners.join(", ") || "any"}. Rooms: ${availability.availableRooms.join(", ") || "any"}.`
                : `No open slots on ${availability.date}. Call find_earliest_availability (for soonest/ASAP) or try the next business day — do NOT escalate.`,
          },
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
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
        const result = await findEarliestAvailability({
          durationMinutes: (input.duration_minutes as number) ?? 60,
          practitionerName:
            (input.preferred_practitioner as string | undefined) ||
            (input.practitioner_name as string | undefined),
          room: input.preferred_room as string | undefined,
        });
        return {
          result: {
            earliestDate: result.earliestDate,
            datesChecked: result.datesChecked,
            slots: result.slots,
            summary: result.summary,
          },
        };
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
        return { result: { error: guardError } };
      }

      const durationMin = (input.duration_minutes as number) ?? 60;
      const bookingDate =
        (input.date as string | undefined) || (input.booking_date as string | undefined);
      let startTime = input.date_time as string;
      let endTime = new Date(new Date(startTime).getTime() + durationMin * 60_000).toISOString();

      let room = input.room as string | undefined;
      let practitioner = input.practitioner_name as string | undefined;

      try {
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
      } catch (err) {
        return {
          result: {
            error:
              err instanceof Error ? err.message : "Could not find available room/practitioner",
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

      try {
        const appt = await bookAppointment(apptData);

        if (input.client_email || apptData.clientContact) {
          const storedBirthday = normalizeBirthdayForStorage(String(input.birthday ?? ""));
          await upsertClient({
            name: apptData.clientName,
            phone: apptData.clientContact || undefined,
            email: normalizeEmail(input.client_email) || undefined,
            ...(storedBirthday ? { birthday: storedBirthday } : {}),
          }).catch(() => undefined);
        }

        const clientRecord = await lookupClient({ phone: apptData.clientContact }).catch(() => null);
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

        const clientEmail = (input.client_email as string | undefined) || clientRecord?.email;

        let confirmationEmailSent = false;
        if (clientEmail) {
          try {
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
          } catch (e) {
            console.error(`[agent/book] confirmation email failed:`, e);
          }
        }

        return {
          result: {
            ...appt,
            event_id: appt.id,
            confirmation_email_sent: confirmationEmailSent,
            confirmation_sent_to: confirmationEmailSent ? clientEmail : undefined,
          },
          booked: true,
        };
      } catch (err) {
        return {
          result: {
            error: err instanceof Error ? err.message : "Booking failed",
          },
        };
      }
    }

    case "resend_booking_confirmation": {
      const email = normalizeEmail(input.client_email);
      if (!email) {
        return { result: { error: "Valid client_email is required to resend the confirmation." } };
      }

      let eventId = String(input.event_id ?? "").trim() || undefined;
      if (!eventId && input.client_contact) {
        eventId = (await findUpcomingAppointmentEventId(String(input.client_contact))) ?? undefined;
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
        return { result: { error: guardError } };
      }

      const eventId = input.event_id as string;
      const phone = String(input.phone ?? input.client_contact ?? "");

      const { resolveAppointmentNotificationEmail } = await import(
        "@/lib/booking/appointment-by-phone"
      );
      const { getCalendarBookingDetails } = await import("@/lib/integrations/google-calendar");
      const bookingBefore = await getCalendarBookingDetails(eventId).catch(() => null);

      const cancelEmail = await resolveAppointmentNotificationEmail({
        phone,
        eventId,
        hintEmail: normalizeEmail(input.client_email),
        calendarEmail: bookingBefore?.clientEmail,
      });

      const cancelled = await cancelCalendarEvent(eventId);

      let confirmationEmailSent = false;
      let emailSkippedReason: string | undefined;

      if (cancelEmail) {
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
        } catch (e) {
          console.error(`[agent/cancel] cancellation email failed:`, e);
          emailSkippedReason =
            e instanceof Error ? e.message : "Cancellation email could not be sent";
        }
      } else {
        emailSkippedReason = "No email on file for this client";
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

      return {
        result: {
          ok: true,
          ...cancelled,
          confirmation_email_sent: confirmationEmailSent,
          confirmation_sent_to: confirmationEmailSent ? cancelEmail : undefined,
          email_skipped_reason: emailSkippedReason,
        },
      };
    }

    case "reschedule_appointment": {
      const guardError = await validateRescheduleAppointment(input);
      if (guardError) {
        return { result: { error: guardError } };
      }

      const eventId = input.event_id as string;
      const phone = String(input.phone ?? input.client_contact ?? "");
      const newStartTime = input.new_date_time as string;
      const durationMin =
        (input.duration_minutes as number | undefined) ??
        (input.appointment_treatment
          ? (
              await import("@/lib/booking/appointment-duration")
            ).durationMinutesForTreatmentName(String(input.appointment_treatment))
          : 60);
      const newEndTime = new Date(
        new Date(newStartTime).getTime() + durationMin * 60_000,
      ).toISOString();

      const { resolveAppointmentNotificationEmail } = await import(
        "@/lib/booking/appointment-by-phone"
      );
      const { getCalendarBookingDetails } = await import("@/lib/integrations/google-calendar");
      const bookingBefore = await getCalendarBookingDetails(eventId).catch(() => null);

      const rescheduleEmail = await resolveAppointmentNotificationEmail({
        phone,
        eventId,
        hintEmail: normalizeEmail(input.client_email),
        calendarEmail: bookingBefore?.clientEmail,
      });

      const rescheduled = await rescheduleCalendarEvent(eventId, newStartTime, newEndTime);

      let confirmationEmailSent = false;
      let emailSkippedReason: string | undefined;

      if (rescheduleEmail) {
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
        } catch (e) {
          console.error(`[agent/reschedule] reschedule email failed:`, e);
          emailSkippedReason =
            e instanceof Error ? e.message : "Reschedule email could not be sent";
        }
      } else {
        emailSkippedReason = "No email on file for this client";
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

      return {
        result: {
          ok: true,
          ...rescheduled,
          confirmation_email_sent: confirmationEmailSent,
          confirmation_sent_to: confirmationEmailSent ? rescheduleEmail : undefined,
          email_skipped_reason: emailSkippedReason,
        },
      };
    }

    case "find_upcoming_appointment": {
      const rawPhone = String(input.phone ?? input.client_contact ?? "").trim();
      if (!rawPhone) {
        return { result: { error: "phone is required to look up an upcoming appointment." } };
      }
      const phone = extractPhoneForLookup(rawPhone) || rawPhone;
      const { findUpcomingAppointmentByPhone } = await import("@/lib/booking/appointment-by-phone");
      const appt = await findUpcomingAppointmentByPhone(phone);
      if (!appt) {
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
      const { durationMinutesForAppointment } = await import("@/lib/booking/appointment-duration");
      const durationMinutes = durationMinutesForAppointment(appt);
      return {
        result: {
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
          summary: `Upcoming ${appt.treatment} for ${appt.clientName} on ${displayTime} CT (${durationMinutes} min). For cancel: call cancel_appointment with phone only. For reschedule: ask for new date, call check_reschedule_availability(phone, date), then reschedule_appointment(phone, new_date_time). Do NOT ask for name, email, or birthday.`,
        },
      };
    }

    case "check_reschedule_availability": {
      const rawPhone = String(input.phone ?? input.client_contact ?? "").trim();
      const date = String(input.date ?? "").trim();
      if (!rawPhone) {
        return { result: { error: "phone is required to check reschedule availability." } };
      }
      if (!date) {
        return { result: { error: "date is required (YYYY-MM-DD) for the new appointment day." } };
      }

      const phone = extractPhoneForLookup(rawPhone) || rawPhone;
      const { findUpcomingAppointmentByPhone } = await import("@/lib/booking/appointment-by-phone");
      const appt = await findUpcomingAppointmentByPhone(phone);
      if (!appt) {
        return {
          result: {
            error:
              "No upcoming appointment found for this phone number. Confirm the number or use find_upcoming_appointment first.",
          },
        };
      }

      const { durationMinutesForAppointment } = await import("@/lib/booking/appointment-duration");
      const durationMinutes = durationMinutesForAppointment(appt);

      try {
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

        return {
          result: {
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
          },
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
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
      const nameError = validateUpsertClientName(input.name);
      if (nameError) {
        return { result: { error: nameError } };
      }
      sanitizeBookingEmails(input);
      const storedBirthday = normalizeBirthdayForStorage(String(input.birthday ?? ""));
      const storedEmail = normalizeEmail(input.email);
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
      return { result: { id: client.id, name: client.name } };
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
