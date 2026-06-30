import { describe, it, expect } from "vitest";
import { ALL_PANEL_KEYS } from "../src/types";

describe("types", () => {
  it("lists all seven panel keys", () => {
    expect(ALL_PANEL_KEYS).toEqual([
      "controls",
      "zone_config",
      "gate_config",
      "occupancy",
      "distance_chart",
      "gate_energy_chart",
      "occupancy_history",
    ]);
  });
});
