import { describe, it, expect } from "vitest";
import { distanceModel } from "../src/charts/distance-chart";
import { entityMapFromBaseName } from "../src/entities";
import type { HomeAssistant, HassEntity } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

function ent(state: string, uom?: string): HassEntity {
  return {
    entity_id: "x",
    state,
    attributes: uom ? { unit_of_measurement: uom } : {},
  };
}

function hass(states: Record<string, HassEntity>): HomeAssistant {
  return { states, entities: {}, devices: {} };
}

describe("distanceModel", () => {
  it("uses gate size to compute range in chart unit (cm)", () => {
    const h = hass({ [m.gate_size!]: ent("0.75m") });
    const model = distanceModel(h, m, "cm");
    expect(model.gateSizeChart).toBeCloseTo(75, 4);
    expect(model.maxRange).toBeCloseTo(600, 4);
  });

  it("defaults gate size to 0.75m when absent", () => {
    const model = distanceModel(hass({}), m, "m");
    expect(model.gateSizeChart).toBeCloseTo(0.75, 6);
  });

  it("converts distance sensors from their own UOM into the chart unit", () => {
    const h = hass({
      [m.gate_size!]: ent("0.75m"),
      [m.still_distance!]: ent("1", "m"), // 1 m -> 100 cm
      [m.moving_distance!]: ent("50", "cm"),
    });
    const model = distanceModel(h, m, "cm");
    const still = model.bars.find((b) => b.label === "Still");
    const moving = model.bars.find((b) => b.label === "Moving");
    expect(still?.value).toBeCloseTo(100, 3);
    expect(moving?.value).toBeCloseTo(50, 3);
  });

  it("omits bars whose entity is missing", () => {
    const model = distanceModel(hass({ [m.gate_size!]: ent("0.75m") }), m, "cm");
    expect(model.bars).toHaveLength(0);
  });

  it("builds zone segments with occupancy", () => {
    const h = hass({
      [m.gate_size!]: ent("0.75m"),
      [m.zone_1_start!]: ent("0", "m"),
      [m.end_zone_1!]: ent("1", "m"),
      [m.end_zone_2!]: ent("2", "m"),
      [m.end_zone_3!]: ent("3", "m"),
      [m.zone_1_occupancy!]: ent("on"),
    });
    const model = distanceModel(h, m, "m");
    expect(model.zones).toHaveLength(3);
    expect(model.zones[0]).toMatchObject({ start: 0, end: 1, occupied: true });
    expect(model.zones[1].occupied).toBe(false);
  });

  it("computes max still/move distances from gate counts", () => {
    const h = hass({
      [m.gate_size!]: ent("0.75m"),
      [m.max_still_distance!]: ent("8"),
      [m.max_move_distance!]: ent("6"),
    });
    const model = distanceModel(h, m, "m");
    expect(model.maxStill).toBeCloseTo(6, 6); // 8 * 0.75
    expect(model.maxMove).toBeCloseTo(4.5, 6); // 6 * 0.75
  });
});
