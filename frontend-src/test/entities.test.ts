import { describe, it, expect } from "vitest";
import {
  baseNameFromDevice,
  classifyObjectId,
  detectProfileFromEntities,
  entityMapFromBaseName,
  entityMapFromDevice,
  resolveEntities,
  resolveProfile,
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

describe("classifyObjectId", () => {
  it("classifies gate entities and parses the gate index", () => {
    expect(classifyObjectId("number", `${base}_g1_move_threshold`)).toEqual({
      slot: "move_threshold",
      gate: 1,
    });
    expect(classifyObjectId("sensor", `${base}_g8_still_energy`)).toEqual({
      slot: "still_energy",
      gate: 8,
    });
  });

  it("tolerates HA dedup suffixes without misparsing the gate", () => {
    // `_2` here is HA's collision suffix, NOT gate 2.
    expect(classifyObjectId("number", `${base}_g3_move_threshold_2`)).toEqual({
      slot: "move_threshold",
      gate: 3,
    });
    expect(classifyObjectId("switch", `${base}_radar_engineering_mode_2`)).toEqual({
      slot: "engineering_mode",
    });
  });

  it("classifies zero-padded LD2412 gate names", () => {
    expect(
      classifyObjectId("number", `${base}_ld2412_g05_still_threshold`)
    ).toEqual({ slot: "still_threshold", gate: 5 });
  });

  it("classifies LD2412 scalar names into shared slots", () => {
    expect(classifyObjectId("switch", `${base}_ld2412_engineering_mode`)).toEqual({
      slot: "engineering_mode",
    });
    expect(classifyObjectId("number", `${base}_ld2412_max_distance_gate`)).toEqual({
      slot: "max_move_distance",
    });
    expect(classifyObjectId("binary_sensor", `${base}_ld2412_presence`)).toEqual({
      slot: "radar_target",
    });
  });

  it("does not confuse target with moving/still target", () => {
    expect(classifyObjectId("binary_sensor", `${base}_radar_moving_target`)).toEqual({
      slot: "moving_target",
    });
    expect(classifyObjectId("binary_sensor", `${base}_radar_target_2`)).toEqual({
      slot: "radar_target",
    });
  });

  it("rejects a matching suffix in the wrong domain", () => {
    expect(classifyObjectId("automation", `${base}_radar_engineering_mode`)).toBeUndefined();
    expect(classifyObjectId("sensor", `${base}_g3_move_threshold`)).toBeUndefined();
  });

  it("returns undefined for unrelated object ids", () => {
    expect(classifyObjectId("sensor", "kitchen_temperature")).toBeUndefined();
  });
});

describe("entityMapFromDevice", () => {
  it("builds the map from the device's actual (renamed) entity ids", () => {
    // Each entity keeps its firmware suffix but the user renamed the prefixes —
    // base-name extraction would disagree across entities, device lookup won't.
    const ids = [
      "switch.kitchen_presence_radar_engineering_mode",
      "number.some_other_name_g3_move_threshold_2",
      "sensor.foo_g8_still_energy",
      "binary_sensor.bar_radar_target",
    ];
    const hass = hassWith(ids);
    const map = entityMapFromDevice(hass, "dev1")!;
    expect(map.engineering_mode).toBe(ids[0]);
    expect(map.move_threshold[3]).toBe(ids[1]);
    expect(map.still_energy[8]).toBe(ids[2]);
    expect(map.radar_target).toBe(ids[3]);
  });

  it("ignores entities belonging to other devices", () => {
    const hass = hassWith([`switch.${base}_radar_engineering_mode`]);
    hass.states["switch.other_radar_engineering_mode"] = {
      entity_id: "switch.other_radar_engineering_mode",
      state: "off",
      attributes: {},
    };
    hass.entities["switch.other_radar_engineering_mode"] = { device_id: "dev2" };
    const map = entityMapFromDevice(hass, "dev1")!;
    expect(map.engineering_mode).toBe(`switch.${base}_radar_engineering_mode`);
  });

  it("returns undefined when nothing classifies", () => {
    expect(entityMapFromDevice(hassWith(["sensor.kitchen_temperature"]), "dev1")).toBeUndefined();
    expect(entityMapFromDevice(hassWith([]), "dev1")).toBeUndefined();
  });
});

describe("detectProfileFromEntities", () => {
  it("detects LD2412 from ld2412-marked entities", () => {
    const hass = hassWith([`switch.${base}_ld2412_engineering_mode`]);
    expect(detectProfileFromEntities(hass, "dev1")?.key).toBe("ld2412");
  });

  it("detects LD2410 from its concrete markers", () => {
    const hass = hassWith([`number.${base}_g3_move_threshold`]);
    expect(detectProfileFromEntities(hass, "dev1")?.key).toBe("ld2410");
  });

  it("is inconclusive on chip-agnostic entities (e.g. esp_reboot)", () => {
    const hass = hassWith([`button.${base}_esp_reboot`]);
    expect(detectProfileFromEntities(hass, "dev1")).toBeUndefined();
  });
});

describe("resolveEntities via device_id with dedup/renamed ids", () => {
  it("resolves deduped entity ids that base-name construction would miss", () => {
    // HA appended `_2` on collision — constructed ids would point at the
    // other device's entities.
    const ids = [
      `switch.${base}_radar_engineering_mode_2`,
      `number.${base}_g0_move_threshold_2`,
      `sensor.${base}_radar_detection_distance_2`,
    ];
    const map = resolveEntities(hassWith(ids), { type: "x", device_id: "dev1" });
    expect(map.engineering_mode).toBe(ids[0]);
    expect(map.move_threshold[0]).toBe(ids[1]);
    expect(map.detection_distance).toBe(ids[2]);
  });
});

describe("resolveProfile", () => {
  it("prefers the registry model when entity probing is blind", () => {
    const hass = hassWith([`button.${base}_esp_reboot`]);
    hass.devices.dev1 = { manufacturer: "ApolloAutomation", model: "R-PRO-1-W" };
    expect(resolveProfile(hass, { type: "x", device_id: "dev1" })?.key).toBe("ld2412");
  });

  it("prefers a concrete entity match over a conflicting registry model", () => {
    const hass = hassWith([`switch.${base}_radar_engineering_mode`]);
    hass.devices.dev1 = { manufacturer: "ApolloAutomation", model: "R-PRO-1-W" };
    expect(resolveProfile(hass, { type: "x", device_id: "dev1" })?.key).toBe("ld2410");
  });

  it("returns no profile for a registry-matched zone-only model (MTR-1)", () => {
    const hass = hassWith(["sensor.foo_ld2450_target_1_x"]);
    hass.devices.dev1 = { manufacturer: "ApolloAutomation", model: "MTR-1" };
    expect(resolveProfile(hass, { type: "x", device_id: "dev1" })).toBeUndefined();
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
