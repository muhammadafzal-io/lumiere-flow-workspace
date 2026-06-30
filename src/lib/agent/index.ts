import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import { SYSTEM_PROMPT } from "./system-prompt";
import { TOOLS } from "./tools";
import { checkAvailability, bookAppointment, suggestSlot } from "@/lib/services/booking-service";
import { cancelCalendarEvent, rescheduleCalendarEvent } from "@/lib/integrations/google-calendar";
import {
  lookupClient,
  upsertClient,
  createAppointmentRecord,
  getClientByCreditCode,
} from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { postEscalation } from "@/lib/integrations/slack";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { getWidgetUrl } from "@/lib/client-channels";
import type { AgentResult } from "@/types";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const MAX_TOOL_ROUNDS = 8;

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: { platform: string; chatId: string },
): Promise<{ result: unknown; escalated?: boolean; booked?: boolean }> {
  switch (toolName) {
    case "check_availability": {
      const availability = await checkAvailability({
        date: input.date as string,
        durationMinutes: (input.duration_minutes as number) ?? 60,
        practitionerName: input.preferred_practitioner as string | undefined,
        room: input.preferred_room as string | undefined,
      });

      return {
        result: {
          date: availability.date,
          durationMinutes: availability.durationMinutes,
          slots: availability.slots.slice(0, 6), // Limit to top 6 slots
          availablePractitioners: availability.availablePractitioners,
          availableRooms: availability.availableRooms,
          summary: `Found ${availability.slots.length} available slots on ${availability.date}. Available practitioners: ${availability.availablePractitioners.join(", ")}. Available rooms: ${availability.availableRooms.join(", ")}`,
        },
      };
    }

    case "book_appointment": {
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

      const apptData = {
        clientName: input.client_name as string,
        clientContact: input.client_contact as string,
        clientEmail: (input.client_email as string | undefined) || undefined,
        treatment: input.treatment as string,
        startTime,
        endTime,
        practitionerName: practitioner,
        room,
        notes: input.notes as string | undefined,
      };

      const appt = await bookAppointment(apptData);

      // Upsert client so email is saved before we look them up
      if (input.client_email || apptData.clientContact) {
        await upsertClient({
          name: apptData.clientName,
          phone: apptData.clientContact || undefined,
          email: (input.client_email as string | undefined) || undefined,
        }).catch(() => {
          /* non-fatal */
        });
      }

      // Look up Airtable client ID by phone so we can link the appointment record
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
      ).catch(() => {
        /* non-fatal */
      });

      // Fire-and-forget: send booking confirmation email via widget
      const clientEmail = (input.client_email as string | undefined) || clientRecord?.email;

      console.log(
        `[agent/book] email → input: ${input.client_email ?? "none"} | supabase: ${clientRecord?.email ?? "none"} → will send to: ${clientEmail ?? "NONE"}`,
      );

      if (clientEmail) {
        const displayTime = new Date(apptData.startTime).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        sendRetentionEmail({
          to: clientEmail,
          subject: `Appointment confirmed — ${apptData.treatment} on ${new Date(apptData.startTime).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" })}`,
          flowType: "booking",
          text: [
            `Hi ${apptData.clientName}, your appointment at Lumière is confirmed!`,
            ``,
            `Treatment: ${apptData.treatment}`,
            `Date & Time: ${displayTime} CT`,
            `Practitioner: ${apptData.practitionerName}`,
            `Location: 2847 S Lamar Blvd, Suite 120, Austin TX 78704`,
            apptData.notes ? `Notes: ${apptData.notes}` : "",
            ``,
            `Need to change anything? Reply to this message or contact us Monday–Saturday, 9 AM–7 PM.`,
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
        })
          .then(() => console.log(`[agent/book] confirmation email sent → ${clientEmail}`))
          .catch((e) => console.error(`[agent/book] confirmation email failed:`, e));
      }

      return { result: appt, booked: true };
    }

    case "cancel_appointment": {
      const eventId = input.event_id as string;
      const cancelled = await cancelCalendarEvent(eventId);

      // Fire-and-forget cancellation email
      const cancelEmail =
        (input.client_email as string | undefined) ||
        (await lookupClient({ phone: cancelled.clientContact }).catch(() => null))?.email;

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

        sendRetentionEmail({
          to: cancelEmail,
          subject: `Your ${cancelled.treatment} appointment has been cancelled`,
          flowType: "cancellation",
          text: [
            `Hi ${cancelled.clientName}, your appointment at Lumière has been cancelled.`,
            ``,
            `Treatment: ${cancelled.treatment}`,
            `Original Date: ${displayTime} CT`,
            ``,
            `We'd love to rebook you at a time that works better. Reply here or visit us Monday–Saturday, 9 AM–7 PM.`,
            ``,
            `— The Lumière Team`,
          ].join("\n"),
          cta: {
            label: "Book a New Appointment",
            url: getWidgetUrl(),
          },
        })
          .then(() => console.log(`[agent/cancel] cancellation email sent → ${cancelEmail}`))
          .catch((e) => console.error(`[agent/cancel] cancellation email failed:`, e));
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

      // Fire-and-forget reschedule email
      const rescheduleEmail =
        (input.client_email as string | undefined) ||
        (await lookupClient({ phone: rescheduled.clientContact }).catch(() => null))?.email;

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

        sendRetentionEmail({
          to: rescheduleEmail,
          subject: `Your ${rescheduled.treatment} appointment has been rescheduled`,
          flowType: "reschedule",
          text: [
            `Hi ${rescheduled.clientName}, your Lumière appointment has been rescheduled.`,
            ``,
            `Treatment: ${rescheduled.treatment}`,
            rescheduled.oldStartTime ? `Old Date: ${fmtTime(rescheduled.oldStartTime)} CT` : "",
            `New Date: ${fmtTime(rescheduled.newStartTime)} CT`,
            `Location: 2847 S Lamar Blvd, Suite 120, Austin TX 78704`,
            ``,
            `Need further changes? Reply here or contact us Monday–Saturday, 9 AM–7 PM.`,
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
        })
          .then(() => console.log(`[agent/reschedule] reschedule email sent → ${rescheduleEmail}`))
          .catch((e) => console.error(`[agent/reschedule] reschedule email failed:`, e));
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
      const client = await upsertClient({
        name: input.name as string,
        phone: input.phone as string | undefined,
        email: input.email as string | undefined,
        telegramId: input.telegram_id as string | undefined,
        lastVisit: input.last_visit as string | undefined,
        lastTreatment: input.last_treatment as string | undefined,
        birthday: input.birthday as string | undefined,
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
      const code = (input.code as string)?.trim().toUpperCase();
      const result = await getClientByCreditCode(code);
      if (!result) {
        return { result: { valid: false, error: "Code not found" } };
      }
      const { client, codeInfo } = result;
      if (codeInfo.isUsed) {
        return {
          result: { valid: false, error: "Code already redeemed", clientName: client.name },
        };
      }
      if (codeInfo.isExpired) {
        return {
          result: {
            valid: false,
            error: `Code expired on ${codeInfo.expiresAt}`,
            clientName: client.name,
          },
        };
      }
      return {
        result: {
          valid: true,
          code: codeInfo.code,
          clientName: client.name,
          creditAmount: codeInfo.creditAmount,
          expiresAt: codeInfo.expiresAt,
          daysRemaining: codeInfo.daysRemaining,
          message: `Valid! $${codeInfo.creditAmount} birthday credit for ${client.name}. Expires ${codeInfo.expiresAt} (${codeInfo.daysRemaining} days remaining). Staff will apply the discount at checkout.`,
        },
      };
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
