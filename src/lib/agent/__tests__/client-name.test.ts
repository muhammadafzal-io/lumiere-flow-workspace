import { describe, expect, it } from "vitest";
import { isFullName } from "../client-name";

describe("isFullName", () => {
  it("rejects empty and single names", () => {
    expect(isFullName("")).toBe(false);
    expect(isFullName("Sarah")).toBe(false);
    expect(isFullName("  Mike  ")).toBe(false);
  });

  it("accepts first and last name", () => {
    expect(isFullName("Sarah Johnson")).toBe(true);
    expect(isFullName("Mary Jane Watson")).toBe(true);
    expect(isFullName("Jean-Pierre Dubois")).toBe(true);
  });

  it("rejects parts that are too short", () => {
    expect(isFullName("A Smith")).toBe(false);
    expect(isFullName("John B")).toBe(false);
  });
});
