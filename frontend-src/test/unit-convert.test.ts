import { describe, it, expect } from "vitest";
import { convert, isValidUom, toMeters, VALID_UOMS } from "../src/charts/unit-convert";

describe("unit-convert", () => {
  it("lists the six supported units", () => {
    expect(VALID_UOMS).toEqual(["mm", "cm", "m", "in", "ft", "yd"]);
  });

  it("validates units", () => {
    expect(isValidUom("cm")).toBe(true);
    expect(isValidUom("furlong")).toBe(false);
    expect(isValidUom(undefined)).toBe(false);
  });

  it("converts to meters", () => {
    expect(toMeters(100, "cm")).toBeCloseTo(1, 6);
    expect(toMeters(12, "in")).toBeCloseTo(0.3048, 6);
  });

  it("returns the same value when from === to", () => {
    expect(convert(42, "m", "m")).toBe(42);
  });

  it("converts between units", () => {
    expect(convert(1, "m", "cm")).toBeCloseTo(100, 6);
    expect(convert(1, "m", "in")).toBeCloseTo(39.3701, 3);
    expect(convert(12, "in", "ft")).toBeCloseTo(1, 6);
    expect(convert(2.54, "cm", "in")).toBeCloseTo(1, 6);
  });
});
