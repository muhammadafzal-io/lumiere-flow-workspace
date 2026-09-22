import { describe, expect, it } from "vitest";
import { decideAccountLink, lastFourDigits, provesOwnership } from "../link-decision";

describe("decideAccountLink", () => {
  it("creates a record when nothing matches the email", () => {
    expect(decideAccountLink([])).toEqual({ action: "create" });
  });

  it("links straight away to a record with nothing on it", () => {
    expect(decideAccountLink([{ id: "c1", hasHistory: false }])).toEqual({
      action: "link",
      clientId: "c1",
    });
  });

  it("asks for proof before handing over a record with history", () => {
    // The case this guards: staff mistype a client's email onto a stranger's real address.
    expect(decideAccountLink([{ id: "c1", hasHistory: true }])).toEqual({
      action: "verify",
      clientId: "c1",
    });
  });

  it("refuses to guess when several records share the email", () => {
    // A shared family address must never resolve to whichever row came back first.
    expect(
      decideAccountLink([
        { id: "c1", hasHistory: true },
        { id: "c2", hasHistory: false },
      ]),
    ).toEqual({ action: "ambiguous" });
  });
});

describe("lastFourDigits", () => {
  it("ignores formatting", () => {
    expect(lastFourDigits("+1 (425) 555-1234")).toBe("1234");
    expect(lastFourDigits("425.555.1234")).toBe("1234");
  });

  it("returns null when there aren't four digits to compare", () => {
    for (const phone of ["", "12", null, undefined]) {
      expect(lastFourDigits(phone)).toBeNull();
    }
  });
});

describe("provesOwnership", () => {
  const onFile = { phone: "+1 (425) 555-1234", birthday: "2000-08-14" };

  it("accepts the right phone digits", () => {
    expect(provesOwnership(onFile, { phoneLast4: "1234" })).toBe(true);
    expect(provesOwnership(onFile, { phoneLast4: "12 34" })).toBe(true);
  });

  it("accepts the right birthday", () => {
    expect(provesOwnership(onFile, { birthday: "2000-08-14" })).toBe(true);
  });

  it("rejects a wrong answer", () => {
    expect(provesOwnership(onFile, { phoneLast4: "9999" })).toBe(false);
    expect(provesOwnership(onFile, { birthday: "1999-01-01" })).toBe(false);
  });

  it("rejects an empty proof — silence is never proof", () => {
    expect(provesOwnership(onFile, {})).toBe(false);
    expect(provesOwnership(onFile, { phoneLast4: "", birthday: "" })).toBe(false);
  });

  it("cannot be satisfied against a record holding neither detail", () => {
    // Nothing to check means nothing to prove: staff link those by hand instead.
    expect(provesOwnership({ phone: "", birthday: "" }, { phoneLast4: "", birthday: "" })).toBe(
      false,
    );
    expect(provesOwnership({ phone: null, birthday: null }, { phoneLast4: "1234" })).toBe(false);
  });
});
