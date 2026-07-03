import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/airtable", () => ({
  lookupClientByPhone: vi.fn(),
}));

import { lookupClientByPhone } from "@/lib/integrations/airtable";
import {
  hasValidBirthday,
  validateBookAppointment,
  validateEscalation,
} from "@/lib/agent/booking-guards";

const lookupClientByPhoneMock = vi.mocked(lookupClientByPhone);

describe("hasValidBirthday", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(hasValidBirthday({ birthday: "1990-03-15" })).toBe(true);
  });

  it("rejects empty or skip flags", () => {
    expect(hasValidBirthday({})).toBe(false);
    expect(hasValidBirthday({ birthday: "" })).toBe(false);
    expect(hasValidBirthday({ birthday_skipped: true })).toBe(false);
    expect(hasValidBirthday({ birthdaySkipped: true })).toBe(false);
  });
});

describe("validateBookAppointment phone uniqueness", () => {
  beforeEach(() => {
    lookupClientByPhoneMock.mockReset();
  });

  it("blocks booking when phone belongs to another client name", async () => {
    lookupClientByPhoneMock.mockResolvedValue({
      id: "client_1",
      name: "Sarah Johnson",
      phone: "+1234567890",
      status: "Active",
    });

    const error = await validateBookAppointment({
      client_name: "Ali Raza",
      treatment: "Facial",
      client_contact: "+1234567890",
      date_time: "2026-07-10T10:00:00Z",
      client_email: "ali@example.com",
      birthday: "1990-03-15",
    });

    expect(error).toContain("already linked to Sarah Johnson");
  });

  it("allows booking when phone and name match existing client", async () => {
    lookupClientByPhoneMock.mockResolvedValue({
      id: "client_1",
      name: "Sarah Johnson",
      phone: "+1234567890",
      status: "Active",
    });

    const error = await validateBookAppointment({
      client_name: "Sarah Johnson",
      treatment: "Facial",
      client_contact: "+1234567890",
      date_time: "2026-07-10T10:00:00Z",
      client_email: "sarah@example.com",
      birthday: "1990-03-15",
    });

    expect(error).toBeNull();
  });
});

describe("validateEscalation", () => {
  beforeEach(() => {
    lookupClientByPhoneMock.mockReset();
    lookupClientByPhoneMock.mockResolvedValue(null);
  });

  it("blocks escalation without name, phone, and email", async () => {
    const error = await validateEscalation({
      reason: "Client wants a human",
      conversation_summary: "Asked to speak to staff",
    });

    expect(error).toContain("Cannot escalate yet");
    expect(error).toContain("client_name");
    expect(error).toContain("phone");
    expect(error).toContain("client_email");
  });

  it("allows escalation when contact info is complete", async () => {
    const error = await validateEscalation({
      client_name: "Mohamed Afzal",
      phone: "+12345678901",
      client_email: "mohamed@example.com",
      reason: "Room conflict",
      conversation_summary: "Caller requested escalation",
    });

    expect(error).toBeNull();
  });

  it("fills missing fields from CRM by phone", async () => {
    lookupClientByPhoneMock.mockResolvedValue({
      id: "client_1",
      name: "Mohamed Afzal",
      phone: "+12345678901",
      email: "mohamed@example.com",
      status: "Active",
    });

    const error = await validateEscalation({
      phone: "+12345678901",
      reason: "Medical question",
      conversation_summary: "Asked about rosacea",
    });

    expect(error).toBeNull();
  });
});
