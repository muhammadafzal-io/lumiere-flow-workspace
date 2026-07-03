import { TREATMENT_DURATIONS } from "@/lib/treatments";
import type { Treatment } from "@/lib/types";

/** Duration from calendar block, or best match from treatment name. */
export function durationMinutesForAppointment(appt: {
  treatment: string;
  startTime: string;
  endTime: string;
}): number {
  const ms = new Date(appt.endTime).getTime() - new Date(appt.startTime).getTime();
  if (ms >= 15 * 60_000) return Math.round(ms / 60_000);
  return durationMinutesForTreatmentName(appt.treatment);
}

export function durationMinutesForTreatmentName(treatment: string): number {
  const lower = treatment.toLowerCase();
  for (const [name, minutes] of Object.entries(TREATMENT_DURATIONS)) {
    if (lower.includes(name.toLowerCase())) return minutes;
  }
  if (lower.includes("botox")) return TREATMENT_DURATIONS.Botox;
  if (lower.includes("hydra")) return TREATMENT_DURATIONS.HydraFacial;
  if (lower.includes("laser")) return TREATMENT_DURATIONS.Laser;
  if (lower.includes("micro")) return TREATMENT_DURATIONS.Microneedling;
  if (lower.includes("iv") || lower.includes("drip")) return TREATMENT_DURATIONS["IV Drip"];
  if (lower.includes("filler")) return TREATMENT_DURATIONS.Filler;
  return 60;
}

export function isTreatmentKey(name: string): name is Treatment {
  return name in TREATMENT_DURATIONS;
}
