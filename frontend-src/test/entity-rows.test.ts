import { describe, it, expect } from "vitest";
import {
  controlRows,
  zoneConfigRows,
  moveThresholdRows,
  stillThresholdRows,
  rangeRows,
  occupancyRows,
  presentRows,
} from "../src/panels/entity-rows";
import { entityMapFromBaseName } from "../src/entities";
import type { HomeAssistant } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

describe("row builders", () => {
  it("controls include engineering mode and reboot", () => {
    const ids = controlRows(m).map((r) => r.entity);
    expect(ids).toContain(`switch.${base}_radar_engineering_mode`);
    expect(ids).toContain(`button.${base}_esp_reboot`);
  });

  it("splits thresholds into 9 move + 9 still rows (LD2410), labelled by gate", () => {
    expect(moveThresholdRows(m)).toHaveLength(9);
    expect(stillThresholdRows(m)).toHaveLength(9);
    expect(moveThresholdRows(m)[0].name).toBe("G0");
  });

  it("zone config has 4 zone bounds (no timeout)", () => {
    expect(zoneConfigRows(m)).toHaveLength(4);
  });

  it("range card has timeout, gate size, and max/min gates (no doubled 'Gate')", () => {
    const rows = rangeRows(m, ["Max Move Gate", "Max Still Gate"], "Gate Size");
    const names = rows.map((r) => r.name);
    expect(names).toEqual([
      "Radar Timeout",
      "Gate Size",
      "Max Move Gate",
      "Max Still Gate",
    ]);
  });

  it("occupancy has target/moving/still + 3 zones = 6 rows", () => {
    expect(occupancyRows(m)).toHaveLength(6);
  });
});

describe("presentRows", () => {
  it("drops rows whose entity is absent from hass", () => {
    const present = `switch.${base}_radar_engineering_mode`;
    const hass: HomeAssistant = {
      states: { [present]: { entity_id: present, state: "off", attributes: {} } },
      entities: {},
      devices: {},
    };
    const filtered = presentRows(hass, controlRows(m));
    expect(filtered.every((r) => r.entity === present)).toBe(true);
    expect(filtered).toHaveLength(1);
  });
});
