import { describe, it, expect } from "vitest";
import { historyEntities } from "../src/panels/history";
import { entityMapFromBaseName } from "../src/entities";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

describe("historyEntities", () => {
  it("starts with the radar target named 'Detected'", () => {
    expect(historyEntities(m)[0]).toEqual({
      entity: `binary_sensor.${base}_radar_target`,
      name: "Detected",
    });
  });

  it("includes the three zone sensors with short names", () => {
    const names = historyEntities(m).map((r) => r.name);
    expect(names).toEqual(["Detected", "Zone 1", "Zone 2", "Zone 3"]);
  });

  it("does not include the gate threshold entities", () => {
    const ids = historyEntities(m).map((r) => r.entity);
    expect(ids.some((id) => id.includes("_threshold"))).toBe(false);
  });
});
