import { describe, it, expect } from "vitest";
import { shouldRegenerate } from "../src/strategy";
import type { HomeAssistant, HassEntity } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const eng = `switch.${base}_radar_engineering_mode`;

function hassWith(
  states: Record<string, HassEntity>,
  entities: Record<string, { device_id?: string }>,
  devices: Record<string, { name?: string }>
): HomeAssistant {
  return { states, entities, devices };
}

describe("shouldRegenerate", () => {
  const devices = { dev1: { name: "Living Room MSR-2" } };
  const baseStates: Record<string, HassEntity> = {
    [eng]: { entity_id: eng, state: "off", attributes: {} },
  };
  const baseEntities = { [eng]: { device_id: "dev1" } };
  const oldHass = hassWith(baseStates, baseEntities, devices);

  it("does NOT regenerate when only entities change (e.g. a zone sensor appears)", () => {
    const zone = `sensor.${base}_zone_1`;
    // Same `devices` object reference (registry unchanged) -> fast path false.
    const newHass = hassWith(
      { ...baseStates, [zone]: { entity_id: zone, state: "1", attributes: {} } },
      { ...baseEntities, [zone]: { device_id: "dev1" } },
      devices
    );
    expect(shouldRegenerate({}, oldHass, newHass)).toBe(false);
  });

  it("regenerates when a new radar device is added", () => {
    const b2 = "apollo_r_pro_1_abcd";
    const eng2 = `switch.${b2}_ld2412_engineering_mode`;
    const newHass = hassWith(
      { ...baseStates, [eng2]: { entity_id: eng2, state: "off", attributes: {} } },
      { ...baseEntities, [eng2]: { device_id: "dev2" } },
      { ...devices, dev2: { name: "Office R-PRO-1" } }
    );
    expect(shouldRegenerate({}, oldHass, newHass)).toBe(true);
  });

  it("does NOT regenerate when devices object changes but the device set is the same", () => {
    // New registry object, same radar devices -> no rebuild.
    const newHass = hassWith(baseStates, baseEntities, { ...devices });
    expect(shouldRegenerate({}, oldHass, newHass)).toBe(false);
  });

  it("regenerates when a device added earlier becomes detectable via a later entities update", () => {
    // Race on device add: the device-registry event arrives before the
    // device's entities register. At that point detection fails, so no regen.
    const b2 = "apollo_r_pro_1_abcd";
    const eng2 = `switch.${b2}_ld2412_engineering_mode`;
    const devicesWithNew = { ...devices, dev2: { name: "Office R-PRO-1" } };
    const bareHass = hassWith(baseStates, baseEntities, devicesWithNew);
    expect(shouldRegenerate({}, oldHass, bareHass)).toBe(false);

    // The entities then register: `devices` is reference-equal, only
    // `entities`/`states` changed. This MUST regenerate (previously the
    // devices-only fast path returned false forever -> tab never appeared).
    const readyHass = hassWith(
      { ...baseStates, [eng2]: { entity_id: eng2, state: "off", attributes: {} } },
      { ...baseEntities, [eng2]: { device_id: "dev2" } },
      devicesWithNew
    );
    expect(shouldRegenerate({}, bareHass, readyHass)).toBe(true);
  });

  it("does NOT regenerate on entity churn while a zone is being drawn", () => {
    // Zone sensors belong to no radar device, so the detected key is stable
    // even though `hass.entities` changed and the key is recomputed.
    const zone = `sensor.zone_mapper_living_room_zone_1`;
    const newHass = hassWith(
      { ...baseStates, [zone]: { entity_id: zone, state: "1", attributes: {} } },
      { ...baseEntities, [zone]: {} },
      devices
    );
    expect(shouldRegenerate({}, oldHass, newHass)).toBe(false);
  });
});
