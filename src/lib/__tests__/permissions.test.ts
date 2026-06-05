import { canAccessPage, ROLE_PAGES } from "../permissions";
import type { UserRole } from "../permissions";

describe("RBAC Permissions", () => {
  describe("Role page access", () => {
    it("admin can access all pages", () => {
      const adminPages = ROLE_PAGES.admin;
      expect(adminPages.length).toBe(6);
      expect(adminPages).toContain("/");
      expect(adminPages).toContain("/rules");
      expect(adminPages).toContain("/calendar");
      expect(adminPages).toContain("/customers");
      expect(adminPages).toContain("/activity");
      expect(adminPages).toContain("/settings");
    });

    it("receptionist can access dashboard, calendar, customers only", () => {
      const recepPages = ROLE_PAGES.receptionist;
      expect(recepPages).toContain("/");
      expect(recepPages).toContain("/calendar");
      expect(recepPages).toContain("/customers");
      expect(recepPages).not.toContain("/rules");
      expect(recepPages).not.toContain("/activity");
      expect(recepPages).not.toContain("/settings");
    });

    it("practitioner can access dashboard and calendar only", () => {
      const pracPages = ROLE_PAGES.practitioner;
      expect(pracPages).toContain("/");
      expect(pracPages).toContain("/calendar");
      expect(pracPages).not.toContain("/customers");
      expect(pracPages).not.toContain("/rules");
      expect(pracPages).not.toContain("/activity");
      expect(pracPages).not.toContain("/settings");
    });
  });

  describe("canAccessPage", () => {
    it("admin can access any page", () => {
      const pages = ["/", "/rules", "/calendar", "/customers", "/activity", "/settings"];
      pages.forEach((page) => {
        expect(canAccessPage("admin", page)).toBe(true);
      });
    });

    it("receptionist cannot access rules, activity, or settings", () => {
      expect(canAccessPage("receptionist", "/rules")).toBe(false);
      expect(canAccessPage("receptionist", "/activity")).toBe(false);
      expect(canAccessPage("receptionist", "/settings")).toBe(false);
    });

    it("receptionist can access dashboard, calendar, customers", () => {
      expect(canAccessPage("receptionist", "/")).toBe(true);
      expect(canAccessPage("receptionist", "/calendar")).toBe(true);
      expect(canAccessPage("receptionist", "/customers")).toBe(true);
    });

    it("practitioner can only access dashboard and calendar", () => {
      expect(canAccessPage("practitioner", "/")).toBe(true);
      expect(canAccessPage("practitioner", "/calendar")).toBe(true);
      expect(canAccessPage("practitioner", "/customers")).toBe(false);
      expect(canAccessPage("practitioner", "/rules")).toBe(false);
      expect(canAccessPage("practitioner", "/activity")).toBe(false);
      expect(canAccessPage("practitioner", "/settings")).toBe(false);
    });

    it("handles subpaths correctly", () => {
      expect(canAccessPage("admin", "/calendar/something")).toBe(true);
      expect(canAccessPage("receptionist", "/customers/123")).toBe(true);
      expect(canAccessPage("practitioner", "/rules/edit")).toBe(false);
    });

    it("handles /dashboard as /", () => {
      expect(canAccessPage("practitioner", "/dashboard")).toBe(true);
    });
  });
});
