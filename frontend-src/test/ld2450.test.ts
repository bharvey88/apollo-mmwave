import { describe, it, expect } from "vitest";
import {
  hasLd2450Device,
  ld2450PairsFromDevice,
  ld2450TargetPairs,
} from "../src/ld2450";
import type { HomeAssistant, HassEntity } from "../src/types";

function hassWith(entityIds: string[], deviceId = "dev1"): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, { device_id?: string }> = {};
  for (const id of entityIds) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: deviceId };
  }
  return { states, entities, devices: { [deviceId]: { name: "R-PRO" } } };
}

describe("ld2450PairsFromDevice", () => {
  it("pairs X/Y sensors by target number from actual entities", () => {
    const hass = hassWith([
      "sensor.office_ld2450_target_1_x",
      "sensor.office_ld2450_target_1_y",
      "sensor.office_ld2450_target_2_x",
      "sensor.office_ld2450_target_2_y",
    ]);
    expect(ld2450PairsFromDevice(hass, "dev1")).toEqual([
      { x: "sensor.office_ld2450_target_1_x", y: "sensor.office_ld2450_target_1_y" },
      { x: "sensor.office_ld2450_target_2_x", y: "sensor.office_ld2450_target_2_y" },
    ]);
  });

  it("tolerates dedup suffixes and renamed prefixes", () => {
    // `_2` on the X sensor is HA dedup, not target 2; the pair is matched by
    // the target number even though the prefixes differ.
    const hass = hassWith([
      "sensor.foo_ld2450_target_1_x_2",
      "sensor.bar_ld2450_target_1_y",
    ]);
    expect(ld2450PairsFromDevice(hass, "dev1")).toEqual([
      { x: "sensor.foo_ld2450_target_1_x_2", y: "sensor.bar_ld2450_target_1_y" },
    ]);
  });

  it("drops targets missing their Y sensor and ignores other devices", () => {
    const hass = hassWith(["sensor.office_ld2450_target_3_x"]);
    hass.entities["sensor.other_ld2450_target_1_x"] = { device_id: "dev2" };
    expect(ld2450PairsFromDevice(hass, "dev1")).toEqual([]);
  });
});

describe("hasLd2450Device", () => {
  it("is true when the device has any target X sensor", () => {
    expect(
      hasLd2450Device(hassWith(["sensor.office_ld2450_target_1_x"]), "dev1")
    ).toBe(true);
  });

  it("is false without target sensors or for another device", () => {
    const hass = hassWith(["sensor.office_ld2450_target_1_x"]);
    expect(hasLd2450Device(hassWith(["sensor.office_temperature"]), "dev1")).toBe(false);
    expect(hasLd2450Device(hass, "dev2")).toBe(false);
  });
});

describe("ld2450TargetPairs (base-name fallback)", () => {
  it("constructs the three target pairs from a base", () => {
    const pairs = ld2450TargetPairs("office");
    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toEqual({
      x: "sensor.office_ld2450_target_1_x",
      y: "sensor.office_ld2450_target_1_y",
    });
  });
});
