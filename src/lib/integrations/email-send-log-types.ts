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
  | "general"
  | "followup";

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
  categories?: EmailSendCategory[];
  status?: EmailSendStatus | "all";
  triggerType?: EmailSendTrigger | "all";
  clientId?: string;
  search?: string;
  limit?: number;
}
