import { describe, it, expect } from "vitest";
import { CARD_VERSION } from "../src/index";

describe("bundle entry", () => {
  it("exports a semver version string", () => {
    expect(CARD_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
