import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import { getSystemPrompt } from "./system-prompt";
import { TOOLS } from "./tools";
import {
  checkAvailability,
  bookAppointment,
  suggestSlot,
  findEarliestAvailability,
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
import { getClinicTimezone } from "@/lib/clinic-timezone";
import { getClinicBusinessHours, describeClinicHours } from "@/lib/booking/clinic-hours";
import type { AgentResult } from "@/types";

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
      subject: "Finish setting up your Lumière appointment",
      flowType: "booking",
      text: [
        `Hi${opts.clientName ? ` ${opts.clientName}` : ""}, thanks for booking with Lumière!`,
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
      body: `Lumière Med Spa: finish setting up your appointment here: ${url}`,
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
        const availability = await checkAvailability({
          date: input.date as string,
          treatment: input.treatment as string | undefined,
          durationMinutes: (input.duration_minutes as number) ?? 60,
          practitionerName:
            (input.preferred_practitioner as string | undefined) ||
            (input.practitioner_name as string | undefined),
          room: input.preferred_room as string | undefined,
        });

        // Without a stated preference, keep the existing earliest-of-day behavior. With one,
        // pick the 6 slots closest to it (falling back to whatever's nearest if none are close)
        // instead of always surfacing the morning regardless of what the caller actually asked for.
        const preferredTime = input.preferred_time as string | undefined;
        let displaySlots = availability.slots.slice(0, 6);
        if (preferredTime && /^\d{1,2}:\d{2}$/.test(preferredTime)) {
          const [ph, pm] = preferredTime.split(":").map(Number);
          const preferredMinutes = ph * 60 + pm;
          const tz = await getClinicTimezone();
          displaySlots = availability.slots
            .map((s) => {
              const start = new Date(s.startTime);
              const hour =
                parseInt(
                  new Intl.DateTimeFormat("en-US", {
                    timeZone: tz,
                    hour: "2-digit",
                    hour12: false,
                  }).format(start),
                  10,
                ) % 24;
              const minute = parseInt(
                new Intl.DateTimeFormat("en-US", { timeZone: tz, minute: "2-digit" }).format(start),
                10,
              );
              return { slot: s, distance: Math.abs(hour * 60 + minute - preferredMinutes) };
            })
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 6)
            .map((x) => x.slot)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        }

        return {
          result: {
            date: availability.date,
            durationMinutes: availability.durationMinutes,
            slots: displaySlots,
            availablePractitioners: availability.availablePractitioners,
            availableRooms: availability.availableRooms,
            summary:
              availability.slots.length > 0
                ? `Found ${availability.slots.length} available slots on ${availability.date}${preferredTime ? ` — showing the closest to ${preferredTime}` : ""}. Available practitioners: ${availability.availablePractitioners.join(", ") || "any"}. Available rooms: ${availability.availableRooms.join(", ") || "any"}.`
                : availability.bookingWindowNote
                  ? `${availability.bookingWindowNote} — this is a booking-policy limit for this treatment, not a full calendar. Tell the client this specific reason rather than saying it's fully booked; offer a date within the allowed window instead.`
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
          treatment: input.treatment as string | undefined,
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
      const isVoice = context.platform === "voice";
      const guardError = await validateBookAppointment(input, {
        requireFullProfile: !isVoice,
      });
      if (guardError) {
        return { result: { error: guardError } };
      }

      // Duplicate-booking guard: this phone number may already have an appointment sitting in
      // "waiting on the completion form" state. Surface it and let the model confirm with the
      // caller rather than silently stacking a second booking — same warn-don't-silently-block
      // pattern used by the Settings recipe engine's manual-override warnings.
      if (input.confirm_new_booking !== true) {
        const existing = await findOpenCompletionByPhone(String(input.client_contact ?? "")).catch(
          () => null,
        );
        if (existing) {
          return {
            result: {
              warning: `This phone number already has an appointment (${existing.treatment ?? "a service"}) still waiting on a couple final details. Confirm with the caller whether this is about that same appointment or a genuinely new visit before booking again — if it's a new visit, call book_appointment again with confirm_new_booking: true.`,
              existing_event_id: existing.eventId,
            },
          };
        }
      }

      const durationMin = (input.duration_minutes as number) ?? 60;
      const startTime = input.date_time as string;
      const endTime = new Date(new Date(startTime).getTime() + durationMin * 60_000).toISOString();

      // If room/practitioner not specified, suggest one automatically
      let room = input.room as string | undefined;
      let practitioner = input.practitioner_name as string | undefined;

      if (!room || !practitioner) {
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
        } catch (err) {
          return {
            result: {
              error:
                err instanceof Error ? err.message : "Could not find available room/practitioner",
            },
          };
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
        practitionerName: practitioner,
        room,
        notes: input.notes as string | undefined,
        source: "bot" as const,
      };

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

      // Completion link is a voice-only concept — chat already collected everything inline
      // (validateBookAppointment required it above), so there's nothing left to complete and
      // no link should ever be created for chat/Telegram/Discord bookings.
      const profileComplete =
        resolvedClientName !== PENDING_NAME_PLACEHOLDER &&
        !!clientEmail &&
        !!normalizeBirthdayForStorage(String(input.birthday ?? ""));
      let completionLink: Awaited<ReturnType<typeof deliverCompletionLink>> | null = null;
      if (isVoice && !profileComplete) {
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
          return null;
        });
      }

      return {
        result: {
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
        },
        booked: true,
      };
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
      const eventId = input.event_id as string;
      const cancelled = await cancelCalendarEvent(eventId);

      const cancelEmail =
        (input.client_email as string | undefined) ||
        (await lookupClient({ phone: cancelled.clientContact }).catch(() => null))?.email;

      if (cancelEmail) {
        const cancelTimezone = await getClinicTimezone();
        const displayTime = cancelled.startTime
          ? new Date(cancelled.startTime).toLocaleString("en-US", {
              timeZone: cancelTimezone,
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZoneName: "short",
            })
          : "your scheduled time";
        const businessHoursLabel = describeClinicHours(await getClinicBusinessHours());

        sendRetentionEmail({
          to: cancelEmail,
          subject: `Your ${cancelled.treatment} appointment has been cancelled`,
          flowType: "cancellation",
          text: [
            `Hi ${cancelled.clientName}, your appointment at Lumière has been cancelled.`,
            ``,
            `Treatment: ${cancelled.treatment}`,
            `Original Date: ${displayTime}`,
            ``,
            `We'd love to rebook you at a time that works better. Reply here or visit us ${businessHoursLabel}.`,
            widgetLinkLine(),
            ``,
            `— The Lumière Team`,
          ].join("\n"),
          cta: {
            label: "Book a New Appointment",
            url: getWidgetUrl(),
          },
        }).catch((e) => console.error(`[agent/cancel] cancellation email failed:`, e));
      }

      await logEvent(
        "cancellation",
        cancelled.clientName,
        `Appointment cancelled via widget: ${cancelled.treatment}`,
        {
          phone: cancelled.clientContact,
          email: cancelEmail,
          platform: context.platform,
        },
      );

      return { result: { ok: true, ...cancelled } };
    }

    case "reschedule_appointment": {
      const eventId = input.event_id as string;
      const newStartTime = input.new_date_time as string;
      const durationMin = (input.duration_minutes as number) ?? 60;
      const newEndTime = new Date(
        new Date(newStartTime).getTime() + durationMin * 60_000,
      ).toISOString();

      const rescheduled = await rescheduleCalendarEvent(eventId, newStartTime, newEndTime);

      const rescheduleEmail =
        (input.client_email as string | undefined) ||
        (await lookupClient({ phone: rescheduled.clientContact }).catch(() => null))?.email;

      if (rescheduleEmail) {
        const rescheduleTimezone = await getClinicTimezone();
        const fmtTime = (iso: string) =>
          new Date(iso).toLocaleString("en-US", {
            timeZone: rescheduleTimezone,
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZoneName: "short",
          });
        const businessHoursLabel = describeClinicHours(await getClinicBusinessHours());

        sendRetentionEmail({
          to: rescheduleEmail,
          subject: `Your ${rescheduled.treatment} appointment has been rescheduled`,
          flowType: "reschedule",
          text: [
            `Hi ${rescheduled.clientName}, your Lumière appointment has been rescheduled.`,
            ``,
            `Treatment: ${rescheduled.treatment}`,
            rescheduled.oldStartTime ? `Old Date: ${fmtTime(rescheduled.oldStartTime)}` : "",
            `New Date: ${fmtTime(rescheduled.newStartTime)}`,
            ``,
            `Need further changes? Reply here or contact us ${businessHoursLabel}.`,
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
        }).catch((e) => console.error(`[agent/reschedule] reschedule email failed:`, e));
      }

      await logEvent(
        "reschedule",
        rescheduled.clientName,
        `Appointment rescheduled via widget: ${rescheduled.treatment}`,
        {
          phone: rescheduled.clientContact,
          email: rescheduleEmail,
          platform: context.platform,
        },
      );

      return { result: { ok: true, ...rescheduled } };
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
      await postEscalation({
        reason: input.reason as string,
        clientInfo: input.client_info as string | undefined,
        conversationSummary: input.conversation_summary as string,
        platform: context.platform,
      });
      await logEvent(
        "escalation",
        (input.client_info as string) ?? "Unknown",
        input.reason as string,
        {
          platform: context.platform,
        },
      );
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
