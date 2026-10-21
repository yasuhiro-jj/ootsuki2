import { accuracyNeedsWarning, isValidCoordinate } from "./coordinates";
import { describe, expect, it } from "vitest";

describe("coordinates", () => {
  it("rejects coordinates outside the valid range", () => {
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 0)).toBe(false);
    expect(isValidCoordinate(35.6, 139.7)).toBe(true);
  });

  it("warns above 50 meters and does not treat that as invalid by itself", () => {
    expect(accuracyNeedsWarning(51)).toBe(true);
    expect(accuracyNeedsWarning(50)).toBe(false);
    expect(accuracyNeedsWarning(null)).toBe(true);
    expect(isValidCoordinate(35.6, 139.7)).toBe(true);
  });
});
