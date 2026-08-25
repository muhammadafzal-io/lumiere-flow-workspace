import { describe, it, expect } from "vitest";
import {
  selectComplementaryTreatment,
  RECENT_TREATMENT_WINDOW_DAYS,
  type PairedTreatmentCandidate,
  type SelectComplementaryTreatmentInput,
} from "@/lib/booking/treatment-recommendation";

const NOW = new Date("2026-08-01T12:00:00.000Z");

function ledTherapy(overrides: Partial<PairedTreatmentCandidate> = {}): PairedTreatmentCandidate {
  return {
    id: "addon-led",
    name: "LED Therapy",
    price: 30,
    durationMinutes: 15,
    status: "Active",
    priority: 1,
    ...overrides,
  };
}

function eyeTreatment(overrides: Partial<PairedTreatmentCandidate> = {}): PairedTreatmentCandidate {
  return {
    id: "addon-eye",
    name: "Eye Treatment",
    price: 40,
    durationMinutes: 20,
    status: "Active",
    priority: 2,
    ...overrides,
  };
}

function neckTreatment(
  overrides: Partial<PairedTreatmentCandidate> = {},
): PairedTreatmentCandidate {
  return {
    id: "addon-neck",
    name: "Neck Treatment",
    price: 25,
    durationMinutes: 15,
    status: "Active",
    priority: 3,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<SelectComplementaryTreatmentInput> = {},
): SelectComplementaryTreatmentInput {
  return {
    currentTreatmentName: "HydraFacial",
    pairedCandidates: [ledTherapy(), eyeTreatment(), neckTreatment()],
    history: [],
    selectedAddonIdsThisBooking: [],
    alreadyOfferedOrAcceptedAddonIds: [],
    now: NOW,
    recentWindowDays: RECENT_TREATMENT_WINDOW_DAYS,
    ...overrides,
  };
}

describe("selectComplementaryTreatment", () => {
  it("recommends the top-priority pairing for a patient with no previous history", () => {
    const result = selectComplementaryTreatment(baseInput({ history: [] }));
    expect(result?.recommendedTreatmentId).toBe("addon-led");
  });

  it("still recommends a treatment the patient had previously, if not recent", () => {
    const result = selectComplementaryTreatment(
      baseInput({
        history: [{ treatment: "LED Therapy", date: "2025-01-01T00:00:00.000Z" }],
      }),
    );
    expect(result?.recommendedTreatmentId).toBe("addon-led");
  });

  it("excludes a paired treatment the patient recently received, falling back to the next priority", () => {
    // Matches the spec's worked example: HydraFacial booked, Eye Treatment received 12 days ago.
    const result = selectComplementaryTreatment(
      baseInput({
        pairedCandidates: [
          eyeTreatment({ priority: 1 }),
          ledTherapy({ priority: 2 }),
          neckTreatment({ priority: 3 }),
        ],
        history: [{ treatment: "Eye Treatment", date: "2026-07-20T00:00:00.000Z" }],
      }),
    );
    expect(result?.recommendedTreatmentId).toBe("addon-led");
  });

  it("picks one best match when multiple valid pairings exist", () => {
    const result = selectComplementaryTreatment(baseInput());
    expect(result).not.toBeNull();
    expect(["addon-led", "addon-eye", "addon-neck"]).toContain(result?.recommendedTreatmentId);
  });

  it("ranks by priority ascending, lower number wins", () => {
    const result = selectComplementaryTreatment(
      baseInput({
        pairedCandidates: [
          neckTreatment({ priority: 1 }),
          ledTherapy({ priority: 2 }),
          eyeTreatment({ priority: 3 }),
        ],
      }),
    );
    expect(result?.recommendedTreatmentId).toBe("addon-neck");
  });

  it("treats unranked (null priority) candidates as lowest priority, sorted after ranked ones", () => {
    const result = selectComplementaryTreatment(
      baseInput({
        pairedCandidates: [ledTherapy({ priority: null }), eyeTreatment({ priority: 5 })],
      }),
    );
    expect(result?.recommendedTreatmentId).toBe("addon-eye");
  });

  it("does not recommend the treatment matching the current booking", () => {
    const result = selectComplementaryTreatment(
      baseInput({
        currentTreatmentName: "LED Therapy",
        pairedCandidates: [ledTherapy()],
      }),
    );
    expect(result).toBeNull();
  });

  it("does not recommend an add-on already selected as part of this booking", () => {
    const result = selectComplementaryTreatment(
      baseInput({
        pairedCandidates: [ledTherapy()],
        selectedAddonIdsThisBooking: ["addon-led"],
      }),
    );
    expect(result).toBeNull();
  });

  it("does not recommend an add-on already offered/accepted for this booking's OfferEvents", () => {
    const result = selectComplementaryTreatment(
      baseInput({
        pairedCandidates: [ledTherapy()],
        alreadyOfferedOrAcceptedAddonIds: ["addon-led"],
      }),
    );
    expect(result).toBeNull();
  });

  it("does not recommend an inactive treatment", () => {
    const result = selectComplementaryTreatment(
      baseInput({
        pairedCandidates: [ledTherapy({ status: "Inactive" }), eyeTreatment()],
      }),
    );
    expect(result?.recommendedTreatmentId).toBe("addon-eye");
  });

  it("returns null when no valid pairing exists", () => {
    const result = selectComplementaryTreatment(
      baseInput({
        pairedCandidates: [ledTherapy({ status: "Inactive" })],
      }),
    );
    expect(result).toBeNull();
  });

  it("returns null rather than forcing a recommendation when every candidate is excluded", () => {
    const result = selectComplementaryTreatment(
      baseInput({
        pairedCandidates: [ledTherapy(), eyeTreatment()],
        history: [
          { treatment: "LED Therapy", date: "2026-07-25T00:00:00.000Z" },
          { treatment: "Eye Treatment", date: "2026-07-28T00:00:00.000Z" },
        ],
      }),
    );
    expect(result).toBeNull();
  });

  it("uses the candidate's current price as given (Rate Card is resolved by the caller, not re-derived)", () => {
    const result = selectComplementaryTreatment(
      baseInput({ pairedCandidates: [ledTherapy({ price: 42 })] }),
    );
    expect(result?.price).toBe(42);
  });

  it("is pure: does not mutate its inputs and has no side effects on the booking", () => {
    const candidates = [ledTherapy(), eyeTreatment()];
    const snapshot = JSON.stringify(candidates);
    selectComplementaryTreatment(baseInput({ pairedCandidates: candidates }));
    expect(JSON.stringify(candidates)).toBe(snapshot);
  });

  it("returns a DTO shape the form-sending flow can use directly (id, name, reason, price)", () => {
    const result = selectComplementaryTreatment(baseInput());
    expect(result).toMatchObject({
      recommendedTreatmentId: expect.any(String),
      recommendedTreatmentName: expect.any(String),
      reason: expect.stringContaining("HydraFacial"),
      price: expect.any(Number),
    });
  });

  it("a treatment received exactly at the recency window boundary is still excluded", () => {
    const cutoff = new Date(
      NOW.getTime() - RECENT_TREATMENT_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    const result = selectComplementaryTreatment(
      baseInput({
        pairedCandidates: [ledTherapy()],
        history: [{ treatment: "LED Therapy", date: cutoff }],
      }),
    );
    expect(result).toBeNull();
  });
});
