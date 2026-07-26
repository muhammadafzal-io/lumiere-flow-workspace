import { describe, expect, it } from "vitest";
import { whatsappTemplates } from "../whatsapp-templates";

describe("whatsappTemplates", () => {
  it("completionLink includes the URL and uses WhatsApp bold markdown for the clinic name", () => {
    const text = whatsappTemplates.completionLink({
      clientName: "Sarah",
      clinicName: "Zenith Wellness",
      treatment: "Botox",
      url: "https://example.com/complete/abc123",
    });
    expect(text).toContain("Sarah");
    expect(text).toContain("*Zenith Wellness*");
    expect(text).toContain("Botox");
    expect(text).toContain("https://example.com/complete/abc123");
    expect(text).not.toContain("<b>");
  });

  it("completionLink omits the name/treatment lines gracefully when not given", () => {
    const text = whatsappTemplates.completionLink({
      clinicName: "Zenith Wellness",
      url: "https://example.com/complete/abc123",
    });
    expect(text).toContain("Hi! Thanks for booking");
    expect(text).not.toContain("undefined");
  });

  it("teamInvite directs to email rather than including a password itself", () => {
    const text = whatsappTemplates.teamInvite({ name: "Alex", clinicName: "Zenith Wellness" });
    expect(text).toContain("Alex");
    expect(text).toContain("*Zenith Wellness*");
    expect(text.toLowerCase()).toContain("check your email");
  });

  it("practitionerWelcome includes role/specialty only when provided", () => {
    const withBoth = whatsappTemplates.practitionerWelcome({
      name: "Dr. John",
      clinicName: "Zenith Wellness",
      role: "Esthetician",
      specialty: "HydraFacial",
    });
    expect(withBoth).toContain("Role: Esthetician");
    expect(withBoth).toContain("Specialty: HydraFacial");

    const withNeither = whatsappTemplates.practitionerWelcome({
      name: "Dr. John",
      clinicName: "Zenith Wellness",
    });
    expect(withNeither).not.toContain("Role:");
    expect(withNeither).not.toContain("Specialty:");
  });

  it("bookingConfirmation includes treatment, time, and practitioner when given", () => {
    const text = whatsappTemplates.bookingConfirmation({
      clientName: "Sarah",
      clinicName: "Zenith Wellness",
      treatment: "Botox",
      displayTime: "Monday, July 27 at 9:00 AM",
      practitionerName: "Dr. John",
    });
    expect(text).toContain("Sarah");
    expect(text).toContain("Botox");
    expect(text).toContain("Monday, July 27 at 9:00 AM");
    expect(text).toContain("With: Dr. John");
  });

  it("cancellation reads as a cancellation, not a confirmation", () => {
    const text = whatsappTemplates.cancellation({
      clientName: "Sarah",
      clinicName: "Zenith Wellness",
      treatment: "Botox",
      displayTime: "Monday, July 27 at 9:00 AM",
    });
    expect(text.toLowerCase()).toContain("cancelled");
  });

  it("reschedule includes both old and new times when old is given, only new otherwise", () => {
    const withOld = whatsappTemplates.reschedule({
      clientName: "Sarah",
      clinicName: "Zenith Wellness",
      treatment: "Botox",
      oldDisplayTime: "Monday, July 27 at 9:00 AM",
      newDisplayTime: "Tuesday, July 28 at 2:00 PM",
    });
    expect(withOld).toContain("Old date: Monday, July 27 at 9:00 AM");
    expect(withOld).toContain("New date: Tuesday, July 28 at 2:00 PM");

    const withoutOld = whatsappTemplates.reschedule({
      clientName: "Sarah",
      clinicName: "Zenith Wellness",
      treatment: "Botox",
      newDisplayTime: "Tuesday, July 28 at 2:00 PM",
    });
    expect(withoutOld).not.toContain("Old date:");
    expect(withoutOld).toContain("New date: Tuesday, July 28 at 2:00 PM");
  });
});
