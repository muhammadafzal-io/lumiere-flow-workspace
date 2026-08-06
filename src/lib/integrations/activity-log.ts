import { getSupabase } from "@/lib/supabase";
import type { OpsLogEntry } from "@/types";

// Legacy-Airtable-style table/column naming (like "Clients") — the table is really called
// "Operations Log" with Title Case columns, not "Activity_Log"/snake_case. Was silently
// mismatched since this file was written: logEvent()'s catch swallowed every insert failure
// (0 rows ever written) and readActivityLog()'s caller wraps it in Promise.allSettled, so the
// failure was invisible end-to-end — confirmed via direct schema introspection.
const TABLE = "Operations Log";

export async function readActivityLog(limit = 500): Promise<(OpsLogEntry & { id: string })[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("Timestamp", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    timestamp: row["Timestamp"],
    eventType: row["Event Type"] as OpsLogEntry["eventType"],
    clientName: row["Client Name"] ?? "",
    phone: row["Phone"] ?? "",
    email: row["Email"] ?? "",
    clientId: row["Client ID"] ?? "",
    details: row["Details"] ?? "",
    status: (row["Status"] ?? "success") as OpsLogEntry["status"],
    platform: row["Platform"] ?? "",
  }));
}

/** One client's activity feed for the customer profile's Timeline tab — matches by client_id,
 * falling back to phone since older rows (or rows logged before a client record existed) may
 * not have client_id populated. */
export async function readActivityLogForClient(
  clientId: string,
  opts: { phone?: string; limit?: number } = {},
): Promise<(OpsLogEntry & { id: string })[]> {
  const sb = getSupabase();
  const limit = opts.limit ?? 200;
  let query = sb.from(TABLE).select("*").order("Timestamp", { ascending: false }).limit(limit);

  query = opts.phone
    ? query.or(`"Client ID".eq.${clientId},Phone.eq.${opts.phone}`)
    : query.eq("Client ID", clientId);

  const { data, error } = await query;
  if (error) {
    console.warn("[activity-log] readActivityLogForClient failed:", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    timestamp: row["Timestamp"],
    eventType: row["Event Type"] as OpsLogEntry["eventType"],
    clientName: row["Client Name"] ?? "",
    phone: row["Phone"] ?? "",
    email: row["Email"] ?? "",
    clientId: row["Client ID"] ?? "",
    details: row["Details"] ?? "",
    status: (row["Status"] ?? "success") as OpsLogEntry["status"],
    platform: row["Platform"] ?? "",
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
    const { error } = await sb.from(TABLE).insert({
      "Event Type": type,
      "Client Name": clientName,
      "Client ID": opts.clientId ?? "",
      Phone: opts.phone ?? "",
      Email: opts.email ?? "",
      Details: details,
      Status: opts.status ?? "success",
      Platform: opts.platform ?? "system",
    });
    if (error) console.error("logEvent insert failed:", error.message);
  } catch (err) {
    console.error("logEvent threw:", err instanceof Error ? err.message : err);
  }
}
