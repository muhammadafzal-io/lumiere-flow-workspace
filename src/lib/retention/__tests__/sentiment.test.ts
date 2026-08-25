import { describe, expect, it } from "vitest";
import { classifyFollowupResponse } from "@/lib/retention/sentiment";

describe("classifyFollowupResponse", () => {
  it.each([
    ["Great", "POSITIVE"],
    ["Excellent", "POSITIVE"],
    ["Very happy", "POSITIVE"],
    ["Loved it", "POSITIVE"],
    ["Amazing experience", "POSITIVE"],
    ["Very satisfied", "POSITIVE"],
    ["It was excellent. I really enjoyed the treatment!", "POSITIVE"],
    ["5 stars", "POSITIVE"],
    ["5/5", "POSITIVE"],
    ["4 stars, would come back", "POSITIVE"],
    ["I would highly recommend this place", "POSITIVE"],
  ] as const)("classifies %j as %s", (text, expected) => {
    expect(classifyFollowupResponse(text)).toBe(expected);
  });

  it.each([
    ["I wasn't happy with the treatment.", "NEGATIVE"],
    ["I was disappointed with the treatment.", "NEGATIVE"],
    ["It was terrible.", "NEGATIVE"],
    ["Honestly it was awful, I want a refund.", "NEGATIVE"],
    ["1 star", "NEGATIVE"],
    ["2/5, wouldn't recommend", "NEGATIVE"],
    ["I didn't like the results at all", "NEGATIVE"],
  ] as const)("classifies %j as %s", (text, expected) => {
    expect(classifyFollowupResponse(text)).toBe(expected);
  });

  it.each([
    ["It was okay.", "NEUTRAL"],
    ["It was fine, nothing special.", "NEUTRAL"],
    ["", "NEUTRAL"],
    ["   ", "NEUTRAL"],
  ] as const)("classifies %j as %s", (text, expected) => {
    expect(classifyFollowupResponse(text)).toBe(expected);
  });

  it("negation beats an incidentally-present positive word", () => {
    expect(classifyFollowupResponse("It was not amazing, honestly.")).toBe("NEGATIVE");
    expect(classifyFollowupResponse("I wasn't satisfied with how it turned out.")).toBe("NEGATIVE");
  });
});
