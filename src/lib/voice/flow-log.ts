/** Step-by-step voice booking flow logs — browser console (client) and terminal (server). */

export type VoiceFlowLogger = {
  step: (label: string, detail?: Record<string, unknown>) => void;
};

/** Shared logger type for voice, upsert, and cancel/reschedule audit trails. */
export type FlowLogger = VoiceFlowLogger;

export const BOOKING_FLOW_TOOLS = new Set([
  "get_practitioners",
  "check_availability",
  "find_earliest_availability",
  "book_appointment",
  "add_to_waitlist",
  "lookup_client",
  "upsert_client",
  "find_upcoming_appointment",
  "cancel_appointment",
  "check_reschedule_availability",
  "reschedule_appointment",
  "resend_booking_confirmation",
]);

/** Tools that emit full start-to-end audit logs on all platforms. */
export const FLOW_AUDIT_TOOLS = BOOKING_FLOW_TOOLS;

export function createVoiceFlowLogger(
  sessionId: string,
  scope: "client" | "server" = "client",
): VoiceFlowLogger {
  let step = 0;
  const shortId = sessionId.slice(0, 8);

  return {
    step(label: string, detail?: Record<string, unknown>) {
      step += 1;
      const prefix = `[voice-flow:${scope}:${shortId}] #${String(step).padStart(2, "0")}`;
      if (detail && Object.keys(detail).length > 0) {
        console.log(`${prefix} ${label}`, detail);
      } else {
        console.log(`${prefix} ${label}`);
      }
    },
  };
}

/** Trim tool payloads/results for readable logs. */
export function summarizeForFlowLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(summarizeForFlowLog);

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === "slots" && Array.isArray(val)) {
      out[key] = val.slice(0, 3).map((s) => summarizeForFlowLog(s));
      if (val.length > 3) out.slots_truncated = val.length - 3;
      continue;
    }
    if (typeof val === "string" && val.length > 200) {
      out[key] = `${val.slice(0, 200)}…`;
      continue;
    }
    out[key] = summarizeForFlowLog(val);
  }
  return out;
}
