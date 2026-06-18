import { canAccessPage } from "../permissions";

/**
 * API-level RBAC: which roles can call which endpoints.
 * These mirror the intent described in the API permission matrix.
 */
describe("API Permission Matrix", () => {
  describe("customer endpoints", () => {
    it("admin can access /customers", () => {
      expect(canAccessPage("admin", "/customers")).toBe(true);
    });

    it("receptionist can access /customers", () => {
      expect(canAccessPage("receptionist", "/customers")).toBe(true);
    });

    it("practitioner cannot access /customers", () => {
      expect(canAccessPage("practitioner", "/customers")).toBe(false);
    });
  });

  describe("rules endpoints", () => {
    it("admin can access /rules", () => {
      expect(canAccessPage("admin", "/rules")).toBe(true);
    });

    it("receptionist cannot access /rules", () => {
      expect(canAccessPage("receptionist", "/rules")).toBe(false);
    });

    it("practitioner cannot access /rules", () => {
      expect(canAccessPage("practitioner", "/rules")).toBe(false);
    });
  });

  describe("activity endpoints", () => {
    it("admin can access /activity", () => {
      expect(canAccessPage("admin", "/activity")).toBe(true);
    });

    it("receptionist cannot access /activity", () => {
      expect(canAccessPage("receptionist", "/activity")).toBe(false);
    });

    it("practitioner cannot access /activity", () => {
      expect(canAccessPage("practitioner", "/activity")).toBe(false);
    });
  });

  describe("calendar endpoints", () => {
    it("all roles can access /calendar", () => {
      expect(canAccessPage("admin", "/calendar")).toBe(true);
      expect(canAccessPage("receptionist", "/calendar")).toBe(true);
      expect(canAccessPage("practitioner", "/calendar")).toBe(true);
    });
  });
});
