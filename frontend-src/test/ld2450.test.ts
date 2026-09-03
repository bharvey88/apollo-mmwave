import { describe, it, expect } from "vitest";
import {
  hasLd2450,
  hasLd2450Device,
  ld2450EntityIds,
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

describe("MTR-1 firmware naming (no chip prefix)", () => {
  // The MTR-1 firmware names its targets "Target-1 X", so the entity id is
  // `sensor.<base>_target_1_x`. The R-PRO-1 firmware says "LD2450 Target-1 X".
  const mtr = [
    "sensor.apollo_mtr_1_cbbdb4_target_1_x",
    "sensor.apollo_mtr_1_cbbdb4_target_1_y",
  ];

  it("hasLd2450Device accepts the MTR-1 spelling", () => {
    expect(hasLd2450Device(hassWith(mtr), "dev1")).toBe(true);
  });

  it("ld2450EntityIds lists both MTR-1 target sensors", () => {
    expect(ld2450EntityIds(hassWith(mtr), "dev1").sort()).toEqual([...mtr].sort());
  });

  it("hasLd2450 (base-name fallback) accepts the MTR-1 spelling", () => {
    expect(hasLd2450(hassWith(mtr), "apollo_mtr_1_cbbdb4")).toBe(true);
    expect(hasLd2450(hassWith(mtr), "apollo_other")).toBe(false);
  });

  it("does not mistake an unrelated `_target` entity for a coordinate", () => {
    expect(
      hasLd2450Device(hassWith(["binary_sensor.office_radar_target"]), "dev1")
    ).toBe(false);
    expect(hasLd2450Device(hassWith(["sensor.office_target_1_xy"]), "dev1")).toBe(
      false
    );
  });
});
