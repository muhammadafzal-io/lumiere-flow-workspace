import { describe, expect, it } from "vitest";
import { validateAddonLinkSelection } from "@/lib/booking/addon-link-validation";

describe("validateAddonLinkSelection", () => {
  it("allows a valid, non-overlapping selection", () => {
    expect(validateAddonLinkSelection("main-1", ["addon-1", "addon-2"])).toBeNull();
  });

  it("allows an empty selection", () => {
    expect(validateAddonLinkSelection("main-1", [])).toBeNull();
  });

  it("rejects a service selecting itself as an add-on", () => {
    expect(validateAddonLinkSelection("main-1", ["addon-1", "main-1"])).toBe(
      "A service cannot be its own add-on",
    );
  });

  it("rejects a duplicate add-on selection", () => {
    expect(validateAddonLinkSelection("main-1", ["addon-1", "addon-1"])).toBe(
      "Duplicate add-on selection is not allowed",
    );
  });

  it("skips the self-selection check when mainServiceId is not yet known (create flow)", () => {
    expect(validateAddonLinkSelection(null, ["addon-1", "addon-2"])).toBeNull();
  });

  it("rejects an empty or invalid service id in the selection", () => {
    expect(validateAddonLinkSelection("main-1", ["addon-1", ""])).toBe(
      "Each add-on selection needs a valid service id",
    );
  });
});
