export type Status = "Active" | "Dormant" | "VIP" | "New";
export type Treatment = "Botox" | "HydraFacial" | "Laser" | "Microneedling" | "IV Drip" | "Filler";
export type Channel = "Discord" | "Telegram" | "WhatsApp";
export type RuleStatus = "active" | "paused" | "draft";
export type TriggerType =
  | "Inactivity"
  | "Birthday"
  | "Treatment-based"
  | "Date-based"
  | "No-show recovery";
export type MsgStatus = "Delivered" | "Opened" | "Replied" | "Failed" | "Sent";
export type AppointmentStatus = "confirmed" | "pending" | "completed" | "cancelled" | "no_show";
export type AppointmentSource = "ai_booked" | "manual";

export interface Visit {
  date: string;
  treatment: Treatment;
  spend: number;
}
export interface Payment {
  date: string;
  amount: number;
  method: string;
}
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  birthday: string;
  last_visit: string;
  total_visits: number;
  lifetime_value: number;
  treatments: Treatment[];
  status: Status;
  notes: string;
  visits: Visit[];
  payments: Payment[];
}
export interface Rule {
  id: string;
  name: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  audience_filter: string[];
  channel: Channel;
  message_template: string;
  offer_code?: string;
  status: RuleStatus;
  created_at: string;
  last_run_at?: string;
  audience_size: number;
  sent_30d: number;
  reply_rate: number;
  revenue: number;
}
export interface Activity {
  id: string;
  timestamp: string;
  customer_id: string;
  rule_id: string;
  channel: Channel;
  message_body: string;
  status: MsgStatus;
  reply?: string;
  kind?: "automated" | "reschedule_notification" | "cancellation_notification" | "confirmation";
}
export interface Practitioner {
  id: string;
  name: string;
  role: string;
  color: string;
  avatar_initial: string;
}
export interface AiTranscriptMsg {
  from: "ai" | "client";
  text: string;
  ts: string;
}
export interface Appointment {
  id: string;
  customer_id: string;
  clientName?: string;
  clientContact?: string;
  treatment: Treatment;
  duration_minutes: number;
  start_time: string;
  end_time: string;
  practitioner_id: string;
  room: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string;
  price: number;
  created_at: string;
  created_by?: string;
  ai_transcript?: AiTranscriptMsg[];
  reminder_status: { t_3day: boolean; t_1day: boolean; t_2hour: boolean };
}
