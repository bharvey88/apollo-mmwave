import { describe, it, expect } from "vitest";
import {
  parseGateSizeMeters,
  clamp,
  scaleX,
  gateTicks,
} from "../src/charts/geometry";

describe("parseGateSizeMeters", () => {
  it("parses common gate-size strings", () => {
    expect(parseGateSizeMeters("0.75m")).toBeCloseTo(0.75, 6);
    expect(parseGateSizeMeters("0.2 m")).toBeCloseTo(0.2, 6);
    expect(parseGateSizeMeters("0,5m")).toBeCloseTo(0.5, 6);
  });
  it("returns undefined for junk", () => {
    expect(parseGateSizeMeters("none")).toBeUndefined();
    expect(parseGateSizeMeters(undefined)).toBeUndefined();
  });
});

describe("clamp", () => {
  it("bounds values", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("scaleX", () => {
  it("maps value range to pixel width", () => {
    expect(scaleX(0, 8, 800)).toBe(0);
    expect(scaleX(4, 8, 800)).toBe(400);
    expect(scaleX(8, 8, 800)).toBe(800);
  });
  it("clamps out-of-range and guards zero range", () => {
    expect(scaleX(20, 8, 800)).toBe(800);
    expect(scaleX(5, 0, 800)).toBe(0);
  });
});

describe("gateTicks", () => {
  it("returns one tick per gate, ending at the full width", () => {
    const ticks = gateTicks(1, 8, 800);
    expect(ticks).toHaveLength(8);
    expect(ticks[0]).toBe(100);
    expect(ticks[7]).toBe(800);
  });
});
