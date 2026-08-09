import { describe, expect, it } from "vitest";
import { sanitizeFormFields } from "@/lib/forms/sanitize";

describe("sanitizeFormFields", () => {
  it("falls back an invalid type to text", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [{ type: "not-a-real-type", label: "Q1", required: true }],
    });
    expect(result.fields[0].type).toBe("text");
  });

  it("strips options for non-choice types", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [{ type: "text", label: "Q1", required: false, options: ["a", "b"] }],
    });
    expect(result.fields[0].options).toBeUndefined();
  });

  it("demotes a choice type with zero valid options to text", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [{ type: "radio", label: "Q1", required: true, options: [] }],
    });
    expect(result.fields[0].type).toBe("text");
    expect(result.fields[0].options).toBeUndefined();
  });

  it("demotes a choice type whose options are all blank strings to text", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [{ type: "select", label: "Q1", required: true, options: ["  ", ""] }],
    });
    expect(result.fields[0].type).toBe("text");
  });

  it("keeps valid options for choice types, trimmed and capped", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [{ type: "checkbox", label: "Q1", required: false, options: ["  Yes  ", "No", ""] }],
    });
    expect(result.fields[0].type).toBe("checkbox");
    expect(result.fields[0].options).toEqual(["Yes", "No"]);
  });

  it("caps the field count at 30", () => {
    const fields = Array.from({ length: 50 }, (_, i) => ({
      type: "text",
      label: `Q${i}`,
      required: false,
    }));
    const result = sanitizeFormFields({ name: "Test", fields });
    expect(result.fields).toHaveLength(30);
  });

  it("coerces required to a real boolean", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [{ type: "text", label: "Q1", required: "yes" }],
    });
    expect(result.fields[0].required).toBe(true);
    expect(typeof result.fields[0].required).toBe("boolean");
  });

  it("enforces string length caps on label and helpText", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [
        {
          type: "text",
          label: "x".repeat(1000),
          required: false,
          helpText: "y".repeat(1000),
        },
      ],
    });
    expect(result.fields[0].label.length).toBe(300);
    expect(result.fields[0].helpText?.length).toBe(300);
  });

  it("always assigns an id even when the AI omits it", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [{ type: "text", label: "Q1", required: false }],
    });
    expect(result.fields[0].id).toBeTruthy();
    expect(typeof result.fields[0].id).toBe("string");
  });

  it("drops non-object entries from the fields array", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [null, "garbage", 42, { type: "text", label: "Q1", required: false }],
    });
    expect(result.fields).toHaveLength(1);
  });

  it("defaults a missing name to 'New form'", () => {
    const result = sanitizeFormFields({ fields: [] });
    expect(result.name).toBe("New form");
  });

  it("omits helpText entirely when blank", () => {
    const result = sanitizeFormFields({
      name: "Test",
      fields: [{ type: "text", label: "Q1", required: false, helpText: "   " }],
    });
    expect(result.fields[0].helpText).toBeUndefined();
  });
});
