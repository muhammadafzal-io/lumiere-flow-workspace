export type Status = "Active" | "Dormant" | "VIP" | "New";
export type Treatment = "Botox" | "HydraFacial" | "Laser" | "Microneedling" | "IV Drip" | "Filler";
export type Channel = "Discord" | "WhatsApp" | "Email";

/** Channels offered when creating or editing a rule in the admin UI. */
export const RULE_CHANNELS = ["Email", "Discord", "WhatsApp"] as const satisfies readonly Channel[];

/** Map legacy DB values (e.g. Telegram) to a supported rule channel. */
export function normalizeRuleChannel(raw: string | null | undefined): Channel {
  const c = (raw ?? "Email").trim();
  if (c === "Telegram") return "Email";
  if (RULE_CHANNELS.includes(c as Channel)) return c as Channel;
  return "Email";
}
export type RuleStatus = "active" | "paused" | "draft";
export type TriggerType =
  | "Inactivity"
  | "Birthday"
  | "Treatment-based"
  | "Date-based"
  | "No-show recovery"
  | "Visit count"
  | "Custom";
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
export type CampaignStatus = "draft" | "active" | "paused" | "expired";
export type CampaignProcessingStatus = "idle" | "processing" | "completed" | "failed";
export type CampaignTriggerType = "visit_count";
export type CampaignRewardType = "credit" | "discount";
export type CampaignRecipientStatus = "pending" | "sent" | "redeemed" | "failed";
export type VisitCountPreset = 5 | 10 | 15 | "custom";

export interface Campaign {
  id: string;
  name: string;
  description: string;
  trigger_type: CampaignTriggerType;
  visit_count: number;
  reward_type: CampaignRewardType;
  reward_amount: number;
  status: CampaignStatus;
  processing_status: CampaignProcessingStatus;
  last_processed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  visit_count: number;
  reward_amount: number;
  status: CampaignRecipientStatus;
  sent_at?: string;
  redeemed_at?: string;
  created_at: string;
  campaign_name?: string;
  reward_code?: string;
  is_redeemed?: boolean;
}

export interface CustomerReward {
  id: string;
  customer_id: string;
  campaign_id: string;
  reward_type: CampaignRewardType;
  reward_amount: number;
  reward_code: string;
  is_redeemed: boolean;
  redeemed_at?: string;
  created_at: string;
}

export interface CampaignStats {
  eligible: number;
  rewards_assigned: number;
  emails_sent: number;
  pending: number;
  failed: number;
  redeemed: number;
  not_redeemed: number;
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
