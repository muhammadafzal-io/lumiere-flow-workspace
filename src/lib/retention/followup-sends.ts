import "server-only";

import { getSupabase } from "@/lib/supabase";

const TABLE = "followup_sends";

export async function fetchSentFollowupAppointmentIds(): Promise<Set<string>> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select("appointment_id").eq("status", "sent");

  if (error) {
    console.warn("[followup] followup_sends lookup failed (run migration?):", error.message);
    return new Set();
  }

  return new Set((data ?? []).map((row) => String(row.appointment_id)));
}

export async function recordFollowupSend(input: {
  appointmentId: string;
  clientId?: string;
  clientName: string;
  clientEmail: string;
  treatment: string;
  appointmentEnd: string;
  status: "sent" | "failed" | "skipped";
}): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).upsert(
    {
      appointment_id: input.appointmentId,
      client_id: input.clientId ?? null,
      client_name: input.clientName,
      client_email: input.clientEmail,
      treatment: input.treatment,
      appointment_end: input.appointmentEnd,
      status: input.status,
      sent_at: new Date().toISOString(),
    },
    { onConflict: "appointment_id" },
  );

  if (error) console.warn("[followup] followup_sends upsert failed:", error.message);
}
