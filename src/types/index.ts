import type { ChatCompletionMessageParam } from "openai/resources";

export interface Client {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  telegramId?: string;
  lastVisit?: string;
  lastTreatment?: string;
  birthday?: string;
  status: "Active" | "Dormant" | "No-show" | "No-Show" | "Discard";
  notes?: string;
  lastReminderSent?: string;
  lastReactivationSent?: string;
  reactivationStep?: number;
  birthdayCreditSent?: boolean;
  birthdayCreditCode?: string;
  appointments?: string;
}

export interface Appointment {
  id?: string;
  clientName: string;
  treatment: string;
  startTime: string;
  endTime: string;
  clientContact: string;
  clientEmail?: string;
  notes?: string;
  confirmed?: "yes" | "reschedule" | "cancel" | "pending";
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  displayTime: string;
  availableRooms: string[];
  availablePractitioners: string[];
  availableEquipment?: string[];
}

export interface RequiredFormStatus {
  id: string;
  formName: string;
  url: string;
  source: "external" | "inhouse";
  status: "PENDING" | "COMPLETED";
  sentAt: string | null;
  completedAt: string | null;
}

// Minimal shape returned by getEventsByRange (used by admin calendar)
export interface CalendarEvent {
  id: string;
  treatment: string;
  clientName: string;
  clientContact: string;
  clientEmail?: string;
  /** The Clients table row id, when the booking flow that created this event knew it — written
   * into the event description as "Client ID: <uuid>". Absent on events booked before this field
   * existed, or when the client wasn't yet on file at booking time; callers fall back to matching
   * by phone, then name. */
  clientId?: string;
  startTime: string;
  endTime: string;
  notes: string;
  room: string;
  practitioner: string;
  requiredForms?: RequiredFormStatus[];
}

export interface InboundMessage {
  id: string;
  from: string;
  chatId: string;
  text: string;
  platform: "whatsapp" | "discord" | "widget";
  callbackData?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}

export interface InlineButton {
  text: string;
  callbackData: string;
}

export interface OutboundMessage {
  to: string;
  text: string;
  buttons?: InlineButton[];
  parseMode?: "HTML" | "MarkdownV2";
  /** Client email address — triggers a parallel email send via Resend */
  email?: string;
  /** Email subject line (falls back to a sensible default per flow) */
  subject?: string;
}

export type ConversationMessages = ChatCompletionMessageParam[];

export interface AgentResult {
  text: string;
  escalated: boolean;
  booked: boolean;
  messages: ConversationMessages;
}

export type EventType =
  | "booking"
  | "cancellation"
  | "reschedule"
  | "escalation"
  | "inquiry"
  | "no-show"
  | "noshow-recovery"
  | "reminder"
  | "reactivation"
  | "birthday"
  | "campaign"
  | "followup";

export interface OpsLogEntry {
  timestamp: string;
  eventType: EventType;
  clientName: string;
  clientId?: string;
  phone?: string;
  email?: string;
  details: string;
  status: "success" | "pending" | "failed";
  platform: string;
}

export interface RunFlowOptions {
  /** Limit processing to these client record IDs */
  clientIds?: string[];
  /** Limit reminder / follow-up processing to these appointment IDs */
  appointmentIds?: string[];
  /** Audience filters (post-treatment follow-up manual runs) */
  filters?: import("@/lib/retention/audience-config").AudienceFilters;
  /** How the flow was triggered — used for email send logs */
  trigger?: "cron" | "manual" | "system";
}

export interface RetentionResult {
  sent: number;
  skipped: number;
  failed: number;
  details: Array<{
    clientId: string;
    clientName?: string;
    status: string;
    reason?: string;
    contact?: string;
    platform?: string;
    messagePreview?: string;
    /** Email address the message was (or was not) sent to */
    emailAddress?: string | null;
    /** Whether the Resend email was dispatched successfully */
    emailSent?: boolean;
    /** Why email was skipped or failed — populated whenever emailSent=false */
    emailSkipReason?: string;
    /** Whether the Discord staff-channel mirror fired */
    discordMirrored?: boolean;
  }>;
}
