import { parseCreditCode } from "../integrations/airtable";
import { displayCode } from "../retention/birthday";

describe("parseCreditCode", () => {
  describe("valid code without expiry", () => {
    it("parses a basic code", () => {
      const result = parseCreditCode("BDAY-MA-X7K2");
      expect(result.code).toBe("BDAY-MA-X7K2");
      expect(result.isUsed).toBe(false);
      expect(result.isExpired).toBe(false);
      expect(result.isValid).toBe(true);
      expect(result.creditAmount).toBe(50);
      expect(result.expiresAt).toBeNull();
      expect(result.daysRemaining).toBeNull();
    });
  });

  describe("valid code with future expiry", () => {
    it("isValid and not expired when expiry is in the future", () => {
      const future = new Date(Date.now() + 15 * 24 * 60 * 60_000).toLocaleDateString("en-CA");
      const raw = `BDAY-MA-X7K2|${future}`;
      const result = parseCreditCode(raw);
      expect(result.code).toBe("BDAY-MA-X7K2");
      expect(result.expiresAt).toBe(future);
      expect(result.isExpired).toBe(false);
      expect(result.isValid).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });

    it("calculates daysRemaining approximately", () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60_000).toLocaleDateString("en-CA");
      const result = parseCreditCode(`BDAY-SH-ABCD|${future}`);
      expect(result.daysRemaining).toBeGreaterThanOrEqual(9);
      expect(result.daysRemaining).toBeLessThanOrEqual(11);
    });
  });

  describe("expired code", () => {
    it("isExpired and isValid=false when expiry is in the past", () => {
      const past = "2024-01-01";
      const result = parseCreditCode(`BDAY-MA-X7K2|${past}`);
      expect(result.isExpired).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.daysRemaining).toBeLessThan(0);
    });
  });

  describe("used code", () => {
    it("isUsed=true and isValid=false for USED: prefix", () => {
      const result = parseCreditCode("USED:BDAY-MA-X7K2");
      expect(result.isUsed).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.code).toBe("BDAY-MA-X7K2");
    });

    it("handles USED: prefix with expiry", () => {
      const future = new Date(Date.now() + 20 * 24 * 60 * 60_000).toLocaleDateString("en-CA");
      const result = parseCreditCode(`USED:BDAY-MA-X7K2|${future}`);
      expect(result.isUsed).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.code).toBe("BDAY-MA-X7K2");
      expect(result.isExpired).toBe(false);
    });

    it("used AND expired code is invalid", () => {
      const result = parseCreditCode("USED:BDAY-MA-X7K2|2024-01-01");
      expect(result.isUsed).toBe(true);
      expect(result.isExpired).toBe(true);
      expect(result.isValid).toBe(false);
    });
  });

  describe("raw field is preserved", () => {
    it("preserves original raw string", () => {
      const raw = "USED:BDAY-SH-ZZ99|2025-06-01";
      expect(parseCreditCode(raw).raw).toBe(raw);
    });
  });

  describe("creditAmount", () => {
    it("always returns $50", () => {
      expect(parseCreditCode("BDAY-AB-1234").creditAmount).toBe(50);
      expect(parseCreditCode("USED:BDAY-AB-1234").creditAmount).toBe(50);
    });
  });
});

describe("displayCode", () => {
  it("returns raw code unchanged", () => {
    expect(displayCode("BDAY-MA-X7K2")).toBe("BDAY-MA-X7K2");
  });

  it("strips the expiry suffix", () => {
    expect(displayCode("BDAY-MA-X7K2|2026-07-18")).toBe("BDAY-MA-X7K2");
  });

  it("strips USED: prefix", () => {
    expect(displayCode("USED:BDAY-MA-X7K2")).toBe("BDAY-MA-X7K2");
  });

  it("strips both USED: and expiry", () => {
    expect(displayCode("USED:BDAY-MA-X7K2|2026-07-18")).toBe("BDAY-MA-X7K2");
  });

  it("handles multi-initial codes", () => {
    expect(displayCode("BDAY-SH-FZPF|2026-07-15")).toBe("BDAY-SH-FZPF");
  });
});
