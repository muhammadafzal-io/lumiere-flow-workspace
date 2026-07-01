import type { Treatment } from "./types";

export const TREATMENT_DURATIONS: Record<Treatment, number> = {
  Botox: 30,
  HydraFacial: 60,
  Laser: 45,
  Microneedling: 75,
  "IV Drip": 45,
  Filler: 60,
};

export const TREATMENT_PRICES: Record<Treatment, number> = {
  Botox: 480,
  HydraFacial: 220,
  Laser: 350,
  Microneedling: 420,
  "IV Drip": 180,
  Filler: 720,
};
