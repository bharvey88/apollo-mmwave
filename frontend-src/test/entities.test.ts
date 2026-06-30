import { describe, it, expect } from "vitest";
import {
  baseNameFromDevice,
  entityMapFromBaseName,
  resolveEntities,
  exists,
} from "../src/entities";
import type { HomeAssistant } from "../src/types";

const base = "apollo_msr_2_m4c4dd";

function hassWith(entityIds: string[], deviceId = "dev1"): HomeAssistant {
  const states: HomeAssistant["states"] = {};
  const entities: HomeAssistant["entities"] = {};
  for (const id of entityIds) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: deviceId };
  }
  return { states, entities, devices: { dev1: { name: "MSR-2" } } };
}

describe("baseNameFromDevice", () => {
  it("extracts the common base name across a device's entities", () => {
    const hass = hassWith([
      `sensor.${base}_radar_detection_distance`,
      `binary_sensor.${base}_radar_target`,
      `number.${base}_g3_move_threshold`,
    ]);
    expect(baseNameFromDevice(hass, "dev1")).toBe(base);
  });

  it("returns undefined for an unknown device", () => {
    const hass = hassWith([`sensor.${base}_radar_detection_distance`]);
    expect(baseNameFromDevice(hass, "nope")).toBeUndefined();
  });
});

describe("entityMapFromBaseName", () => {
  const map = entityMapFromBaseName(base);
  it("builds scalar control ids", () => {
    expect(map.engineering_mode).toBe(`switch.${base}_radar_engineering_mode`);
    expect(map.esp_reboot).toBe(`button.${base}_esp_reboot`);
  });
  it("builds 9-element gate arrays indexed 0..8", () => {
    expect(map.move_threshold).toHaveLength(9);
    expect(map.move_threshold[0]).toBe(`number.${base}_g0_move_threshold`);
    expect(map.still_energy[8]).toBe(`sensor.${base}_g8_still_energy`);
  });
  it("builds zone and distance ids", () => {
    expect(map.end_zone_2).toBe(`number.${base}_radar_end_zone_2`);
    expect(map.detection_distance).toBe(`sensor.${base}_radar_detection_distance`);
    expect(map.gate_size).toBe(`select.${base}_ld2410_gate_size`);
  });
});

describe("resolveEntities", () => {
  it("resolves from device_id", () => {
    const hass = hassWith([`sensor.${base}_radar_detection_distance`]);
    const map = resolveEntities(hass, { type: "x", device_id: "dev1" });
    expect(map.detection_distance).toBe(`sensor.${base}_radar_detection_distance`);
  });

  it("falls back to device_base_name when no device_id", () => {
    const hass = hassWith([]);
    const map = resolveEntities(hass, { type: "x", device_base_name: base });
    expect(map.engineering_mode).toBe(`switch.${base}_radar_engineering_mode`);
  });

  it("lets manual entities override resolved ids", () => {
    const hass = hassWith([]);
    const map = resolveEntities(hass, {
      type: "x",
      device_base_name: base,
      entities: { engineering_mode: "switch.custom_mode" },
    });
    expect(map.engineering_mode).toBe("switch.custom_mode");
  });

  it("returns empty gate arrays when nothing resolves", () => {
    const map = resolveEntities(hassWith([]), { type: "x" });
    expect(map.move_threshold).toEqual([]);
  });
});

describe("exists", () => {
  const hass = hassWith([`switch.${base}_radar_engineering_mode`]);
  it("is true for present ids and false otherwise", () => {
    expect(exists(hass, `switch.${base}_radar_engineering_mode`)).toBe(true);
    expect(exists(hass, `switch.${base}_missing`)).toBe(false);
    expect(exists(hass, undefined)).toBe(false);
  });
});
