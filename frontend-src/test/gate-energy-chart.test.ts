import { describe, it, expect } from "vitest";
import { gateEnergyModel } from "../src/charts/gate-energy-chart";
import { entityMapFromBaseName } from "../src/entities";
import type { HomeAssistant, HassEntity } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

function ent(state: string): HassEntity {
  return { entity_id: "x", state, attributes: {} };
}

function hass(states: Record<string, HassEntity>): HomeAssistant {
  return { states, entities: {}, devices: {} };
}

describe("gateEnergyModel", () => {
  it("reports not present when no gate entities exist", () => {
    const model = gateEnergyModel(hass({}), m);
    expect(model.present).toBe(false);
    expect(model.gates).toHaveLength(9);
  });

  it("detects engineering mode on", () => {
    const h = hass({ [m.engineering_mode!]: ent("on") });
    expect(gateEnergyModel(h, m).engineeringMode).toBe(true);
  });

  it("reads energies (default 0) and thresholds per gate", () => {
    const h = hass({
      [m.move_energy[0]]: ent("42"),
      [m.still_energy[0]]: ent("17"),
      [m.move_threshold[0]]: ent("50"),
    });
    const model = gateEnergyModel(h, m);
    expect(model.present).toBe(true);
    expect(model.gates[0]).toMatchObject({ move: 42, still: 17, moveThr: 50 });
    expect(model.gates[0].stillThr).toBeUndefined();
    expect(model.gates[1].move).toBe(0);
  });
});
