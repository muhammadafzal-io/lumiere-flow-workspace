import { describe, expect, it } from "vitest";
import { hasPermissionKey, permissionKey } from "../shared";

describe("permissionKey", () => {
  it("joins module and action with a colon", () => {
    expect(permissionKey("calendar", "View")).toBe("calendar:View");
  });
});

describe("hasPermissionKey", () => {
  it("returns true when the exact module:action pair is present", () => {
    const perms = new Set(["calendar:View", "customers:View"]);
    expect(hasPermissionKey(perms, "calendar", "View")).toBe(true);
  });

  it("returns false when the module is present but not the action", () => {
    const perms = new Set(["calendar:View"]);
    expect(hasPermissionKey(perms, "calendar", "Delete")).toBe(false);
  });

  it("returns false when the module isn't present at all", () => {
    const perms = new Set(["calendar:View"]);
    expect(hasPermissionKey(perms, "settings", "View")).toBe(false);
  });

  it("does not treat Manage as implying other actions", () => {
    const perms = new Set(["settings:Manage"]);
    expect(hasPermissionKey(perms, "settings", "View")).toBe(false);
  });

  it("returns false against an empty permission set", () => {
    expect(hasPermissionKey(new Set(), "dashboard", "View")).toBe(false);
  });
});
