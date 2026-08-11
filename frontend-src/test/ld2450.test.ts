import { describe, it, expect } from "vitest";
import { hasLd2450Device, ld2450TargetPairs } from "../src/ld2450";
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

// Pairing X to Y sensors used to live here as `ld2450PairsFromDevice`. The
// integration resolves pairs itself now and hands them to the card as
// `suggested_entities`, so a second implementation in the frontend could only
// disagree with the one that counts.

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
