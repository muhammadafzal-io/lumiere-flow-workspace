import { getSupabase } from "@/lib/supabase";
import type { OpsLogEntry } from "@/types";

const TABLE = "Activity_Log";

export async function readActivityLog(limit = 500): Promise<(OpsLogEntry & { id: string })[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    timestamp: row.created_at,
    eventType: row.event_type as OpsLogEntry["eventType"],
    clientName: row.client_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    clientId: row.client_id ?? "",
    details: row.details ?? "",
    status: (row.status ?? "success") as OpsLogEntry["status"],
    platform: row.platform ?? "",
  }));
}

export async function logEvent(
  type: OpsLogEntry["eventType"],
  clientName: string,
  details: string,
  opts: {
    clientId?: string;
    phone?: string;
    email?: string;
    status?: OpsLogEntry["status"];
    platform?: string;
  } = {},
): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from(TABLE).insert({
      event_type: type,
      client_name: clientName,
      client_id: opts.clientId ?? null,
      phone: opts.phone ?? "",
      email: opts.email ?? "",
      details,
      status: opts.status ?? "success",
      platform: opts.platform ?? "system",
    });
  } catch {
    void 0;
  }
}
