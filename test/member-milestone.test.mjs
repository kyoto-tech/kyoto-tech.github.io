import { describe, expect, test } from "vitest";
import { getMemberMilestone } from "../src/lib/member-milestone.ts";

describe("getMemberMilestone", () => {
  test.each([
    [224, 200],
    [225, 225],
    [249, 225],
    [250, 250],
  ])("rounds %i down to %i", (memberCount, expected) => {
    expect(getMemberMilestone(memberCount)).toBe(expected);
  });

  test("omits missing, invalid, and sub-25 counts", () => {
    expect(getMemberMilestone(null)).toBeNull();
    expect(getMemberMilestone(24)).toBeNull();
    expect(getMemberMilestone(25.5)).toBeNull();
  });
});
