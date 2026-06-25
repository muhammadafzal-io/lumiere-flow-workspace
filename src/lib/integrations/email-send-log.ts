import "server-only";

import { getSupabase } from "@/lib/supabase";

const TABLE = "email_sends";

export type EmailSendCategory =
  | "rule"
  | "campaign"
  | "reminder"
  | "birthday"
  | "noshow"
  | "reactivation"
  | "booking"
  | "cancellation"
  | "reschedule"
  | "general";

export type EmailSendTrigger = "cron" | "manual" | "system";

export type EmailSendStatus = "sent" | "failed" | "skipped";

export interface EmailSendLogEntry {
  id: string;
  createdAt: string;
  category: EmailSendCategory;
  triggerType: EmailSendTrigger;
  sourceId?: string;
  sourceName?: string;
  clientId?: string;
  clientName?: string;
  toEmail: string;
  subject?: string;
  status: EmailSendStatus;
  failReason?: string;
  provider?: string;
  simulated: boolean;
  messagePreview?: string;
}

export interface LogEmailSendInput {
  category: EmailSendCategory;
  triggerType: EmailSendTrigger;
  sourceId?: string;
  sourceName?: string;
  clientId?: string;
  clientName?: string;
  toEmail: string;
  subject?: string;
  status: EmailSendStatus;
  failReason?: string;
  provider?: string;
  simulated?: boolean;
  messagePreview?: string;
}

export interface ReadEmailSendLogFilters {
  category?: EmailSendCategory | "all";
  status?: EmailSendStatus | "all";
  triggerType?: EmailSendTrigger | "all";
  search?: string;
  limit?: number;
}

function mapRow(row: Record<string, unknown>): EmailSendLogEntry {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    category: row.category as EmailSendCategory,
    triggerType: row.trigger_type as EmailSendTrigger,
    sourceId: row.source_id ? String(row.source_id) : undefined,
    sourceName: row.source_name ? String(row.source_name) : undefined,
    clientId: row.client_id ? String(row.client_id) : undefined,
    clientName: row.client_name ? String(row.client_name) : undefined,
    toEmail: String(row.to_email ?? ""),
    subject: row.subject ? String(row.subject) : undefined,
    status: row.status as EmailSendStatus,
    failReason: row.fail_reason ? String(row.fail_reason) : undefined,
    provider: row.provider ? String(row.provider) : undefined,
    simulated: Boolean(row.simulated),
    messagePreview: row.message_preview ? String(row.message_preview) : undefined,
  };
}

export async function logEmailSend(input: LogEmailSendInput): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from(TABLE).insert({
      category: input.category,
      trigger_type: input.triggerType,
      source_id: input.sourceId ?? null,
      source_name: input.sourceName ?? null,
      client_id: input.clientId ?? null,
      client_name: input.clientName ?? null,
      to_email: input.toEmail,
      subject: input.subject ?? null,
      status: input.status,
      fail_reason: input.failReason ?? null,
      provider: input.provider ?? null,
      simulated: input.simulated ?? false,
      message_preview: input.messagePreview ?? null,
    });
  } catch (err) {
    console.warn("[email-send-log] insert failed (run migration?):", err);
  }
}

export async function readEmailSendLog(
  filters: ReadEmailSendLogFilters = {},
): Promise<{ entries: EmailSendLogEntry[]; stats: Record<EmailSendStatus, number> }> {
  const sb = getSupabase();
  const limit = Math.min(filters.limit ?? 300, 1000);

  let query = sb.from(TABLE).select("*").order("created_at", { ascending: false }).limit(limit);

  if (filters.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.triggerType && filters.triggerType !== "all") {
    query = query.eq("trigger_type", filters.triggerType);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let entries = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    entries = entries.filter((e) => {
      const hay = [e.toEmail, e.clientName, e.subject, e.sourceName, e.failReason, e.messagePreview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const stats: Record<EmailSendStatus, number> = { sent: 0, failed: 0, skipped: 0 };
  for (const e of entries) stats[e.status]++;

  return { entries, stats };
}
