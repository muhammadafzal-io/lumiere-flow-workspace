import "server-only";

import { getSupabase } from "@/lib/supabase";

const TABLE = "followup_sends";

export interface FollowupSendEntry {
  id: string;
  appointmentId: string;
  clientId?: string;
  clientName: string;
  clientEmail: string;
  treatment: string;
  appointmentEnd: string;
  status: "sent" | "failed" | "skipped";
  sentAt: string;
}

/** Follow-up emails sent to one client, most recent first — used by the customer profile's
 * Communications tab. */
export async function readFollowupSendsForClient(
  clientId: string,
  limit = 100,
): Promise<FollowupSendEntry[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("client_id", clientId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[followup] readFollowupSendsForClient failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    appointmentId: String(row.appointment_id),
    clientId: row.client_id ? String(row.client_id) : undefined,
    clientName: String(row.client_name ?? ""),
    clientEmail: String(row.client_email ?? ""),
    treatment: String(row.treatment ?? ""),
    appointmentEnd: String(row.appointment_end),
    status: row.status as FollowupSendEntry["status"],
    sentAt: String(row.sent_at),
  }));
}

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
