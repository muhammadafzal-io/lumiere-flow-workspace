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
  notes?: string;
  confirmed?: "yes" | "reschedule" | "cancel" | "pending";
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  displayTime: string;
  availableRooms: string[];
  availablePractitioners: string[];
}

// Minimal shape returned by getEventsByRange (used by admin calendar)
export interface CalendarEvent {
  id: string;
  treatment: string;
  clientName: string;
  clientContact: string;
  startTime: string;
  endTime: string;
  notes: string;
  room: string;
  practitioner: string;
}

export interface InboundMessage {
  id: string;
  from: string;
  chatId: string;
  text: string;
  platform: "telegram" | "whatsapp" | "discord" | "widget";
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
  | "escalation"
  | "inquiry"
  | "no-show"
  | "noshow-recovery"
  | "reminder"
  | "reactivation"
  | "birthday";

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
  }>;
}
