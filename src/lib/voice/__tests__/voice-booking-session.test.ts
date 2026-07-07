import { describe, expect, it } from "vitest";
import {
  enrichVoiceToolInput,
  getPrematureBookBlockReason,
  getPrematureCancelBlockReason,
  stripTreatmentAsPractitioner,
  updateVoiceBookingSession,
  type VoiceBookingSession,
} from "@/lib/voice/voice-booking-session";

describe("stripTreatmentAsPractitioner", () => {
  it("removes practitioner_name when it matches treatment", () => {
    const input = {
      practitioner_name: "Laser Hair Removal",
      treatment: "Laser Hair Removal",
    };
    stripTreatmentAsPractitioner(input);
    expect(input.practitioner_name).toBeUndefined();
  });

  it("keeps real practitioner names", () => {
    const input = { practitioner_name: "Dr. Dao", treatment: "Botox" };
    stripTreatmentAsPractitioner(input);
    expect(input.practitioner_name).toBe("Dr. Dao");
  });
});

describe("getPrematureBookBlockReason", () => {
  it("blocks empty book_appointment payloads", () => {
    const reason = getPrematureBookBlockReason({}, []);
    expect(reason).toContain("empty payload");
  });

  it("allows payloads with core booking fields", () => {
    const reason = getPrematureBookBlockReason(
      {
        client_name: "Ali Ahmed",
        treatment: "Laser Hair Removal",
        client_contact: "+18999333444",
        client_email: "ali@example.com",
        birthday: "2008-07-10",
        date_time: "2026-07-20T14:00:00.000Z",
      },
      [],
    );
    expect(reason).toBeNull();
  });
});

describe("enrichVoiceToolInput", () => {
  it("strips treatment mistaken for practitioner on check_availability", () => {
    const input = {
      date: "2026-07-20",
      duration_minutes: 45,
      practitioner_name: "Laser Hair Removal",
    };
    const session: VoiceBookingSession = { treatment: "Laser Hair Removal" };
    enrichVoiceToolInput("check_availability", input, [], session);
    expect(input.practitioner_name).toBeUndefined();
  });

  it("fills book_appointment practitioner from last slot", () => {
    const session: VoiceBookingSession = {
      treatment: "Botox",
      lastSlots: [
        {
          startTime: "2026-07-20T14:00:00.000Z",
          availablePractitioners: ["Dr. Dao"],
          availableRooms: ["Room 1"],
        },
      ],
    };
    const input: Record<string, unknown> = {
      date_time: "2026-07-20T14:00:00.000Z",
      client_name: "Ali Ahmed",
      treatment: "Botox",
      client_contact: "+18999333444",
      client_email: "ali@example.com",
      birthday: "2008-07-10",
    };
    enrichVoiceToolInput("book_appointment", input, [], session);
    expect(input.practitioner_name).toBe("Dr. Dao");
    expect(input.room).toBe("Room 1");
  });

  it("uses assistant spell-back email for upsert_client and book_appointment", () => {
    const transcript = [
      {
        role: "assistant",
        text: "Let me spell it back — M-U-S-A-M-M-A-D dot A-F-Z-A-L dot 1-1-0-9-0 at gmail dot com. Is that correct?",
      },
      { role: "user", text: "yes" },
    ];
    const upsertInput: Record<string, unknown> = {
      name: "Musaammad Afzal",
      email: "thankyouforclarifying.letmespellitback:musammad.afzal.11090@gmail.com",
    };
    enrichVoiceToolInput("upsert_client", upsertInput, transcript, {});
    expect(upsertInput.email).toBe("musammad.afzal.11090@gmail.com");

    const bookInput: Record<string, unknown> = {
      client_name: "Musaammad Afzal",
      client_email: "thankyouforclarifying.letmespellitback:musammad.afzal.11090@gmail.com",
    };
    enrichVoiceToolInput("book_appointment", bookInput, transcript, {});
    expect(bookInput.client_email).toBe("musammad.afzal.11090@gmail.com");
  });
});

describe("updateVoiceBookingSession", () => {
  it("stores slots from check_availability", () => {
    const session: VoiceBookingSession = {};
    updateVoiceBookingSession(
      "check_availability",
      { duration_minutes: 45 },
      {
        date: "2026-07-20",
        durationMinutes: 45,
        slots: [{ startTime: "2026-07-20T14:00:00.000Z" }],
        availablePractitioners: ["Dr. Dao"],
      },
      session,
    );
    expect(session.date).toBe("2026-07-20");
    expect(session.lastSlots).toHaveLength(1);
    expect(session.practitionerNames).toEqual(["Dr. Dao"]);
  });

  it("stores upcoming appointment from find_upcoming_appointment", () => {
    const session: VoiceBookingSession = {};
    updateVoiceBookingSession(
      "find_upcoming_appointment",
      { client_contact: "+18308300021" },
      {
        found: true,
        event_id: "evt_cancel_1",
        client_name: "Ali Ahmed",
        treatment: "Botox",
      },
      session,
    );
    expect(session.lastUpcoming?.eventId).toBe("evt_cancel_1");
    expect(session.lastUpcoming?.phone).toBe("+18308300021");
  });
});

describe("cancel enrichment", () => {
  it("fills cancel_appointment from session after find_upcoming", () => {
    const session: VoiceBookingSession = {
      lastUpcoming: { eventId: "evt_cancel_1", phone: "+18308300021" },
    };
    const input: Record<string, unknown> = {};
    enrichVoiceToolInput("cancel_appointment", input, [], session);
    expect(input.event_id).toBe("evt_cancel_1");
    expect(input.phone).toBe("+18308300021");
  });

  it("blocks cancel without phone or event_id", () => {
    const reason = getPrematureCancelBlockReason({}, [], {});
    expect(reason).toContain("cancel_appointment");
  });
});
