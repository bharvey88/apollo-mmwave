/**
 * Ghost/offline device filtering: reflashed or re-added hardware leaves stale
 * device-registry entries behind (Apollo manufacturer/model, registered
 * entities, every state missing or "unavailable"). Those must not get
 * dashboard tabs; devices with live radar entities must.
 */

import { describe, it, expect } from "vitest";
import {
  buildDeviceCards,
  detectRadarDevices,
  strategyDevices,
} from "../src/strategy-core";
import type { HassEntity, HomeAssistant } from "../src/types";

type Entities = Record<string, { device_id?: string }>;
type States = Record<string, HassEntity>;

function hassWith(
  states: States,
  entities: Entities,
  devices: HomeAssistant["devices"]
): HomeAssistant {
  return { states, entities, devices };
}

function state(id: string, value: string): HassEntity {
  return { entity_id: id, state: value, attributes: {} };
}

const MTR_DEVICE = {
  name: "Apollo MTR-1 cbbdb4",
  manufacturer: "ApolloAutomation",
  model: "MTR-1",
};

function mtrFixture(targetState: string | undefined): {
  states: States;
  entities: Entities;
} {
  const x = "sensor.apollo_mtr_1_cbbdb4_ld2450_target_1_x";
  const y = "sensor.apollo_mtr_1_cbbdb4_ld2450_target_1_y";
  const entities: Entities = {
    [x]: { device_id: "mtr" },
    [y]: { device_id: "mtr" },
  };
  const states: States = {};
  if (targetState !== undefined) {
    states[x] = state(x, targetState);
    states[y] = state(y, targetState);
  }
  return { states, entities };
}

describe("ghost/offline device filtering", () => {
  it("skips a registry-matched ghost whose states are all unavailable", () => {
    const { states, entities } = mtrFixture("unavailable");
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    expect(detectRadarDevices(hass)).toHaveLength(0);
  });

  it("skips a registry-matched ghost with registered entities but no states", () => {
    const { states, entities } = mtrFixture(undefined);
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    expect(detectRadarDevices(hass)).toHaveLength(0);
  });

  it("skips a registry-matched device with zero entities (add race)", () => {
    const hass = hassWith({}, {}, { mtr: MTR_DEVICE });
    expect(detectRadarDevices(hass)).toHaveLength(0);
  });

  it("detects a live MTR-1", () => {
    const { states, entities } = mtrFixture("1200");
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].ld2450).toBe(true);
  });

  it("skips a non-mmWave Apollo device with only generic live entities", () => {
    // e.g. a dev board exposing esp_reboot but no radar entities at all.
    const reboot = "button.apollo_dev_1_esp_reboot";
    const hass = hassWith(
      { [reboot]: state(reboot, "unknown") },
      { [reboot]: { device_id: "dev1" } },
      {
        dev1: {
          name: "Apollo DEV-1",
          manufacturer: "ApolloAutomation",
          model: "DEV-1",
        },
      }
    );
    expect(detectRadarDevices(hass)).toHaveLength(0);
  });

  it("shows an explicitly selected device even while offline (devices config)", () => {
    const { states, entities } = mtrFixture("unavailable");
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    // Auto-detection skips it…
    expect(strategyDevices(hass, {})).toHaveLength(0);
    // …but an explicit selection forces it, with capabilities from the registry.
    const devices = strategyDevices(hass, { devices: ["mtr"] });
    expect(devices).toHaveLength(1);
    expect(devices[0].ld2450).toBe(true);
  });

  it("shows exactly the selected devices, hiding unselected live ones", () => {
    const live = mtrFixture("1200");
    const hass = hassWith(live.states, live.entities, {
      mtr: MTR_DEVICE,
      other: { ...MTR_DEVICE, name: "Other MTR-1" },
    });
    const devices = strategyDevices(hass, { devices: ["other"] });
    expect(devices.map((d) => d.deviceId)).toEqual(["other"]);
  });

  it("drops a selected device that no longer exists in the registry", () => {
    const hass = hassWith({}, {}, {});
    expect(strategyDevices(hass, { devices: ["gone"] })).toHaveLength(0);
  });

  it("renders an offline note for a forced device with nothing detectable", () => {
    const hass = hassWith({}, {}, {
      mystery: { name: "Garage Sensor" }, // no manufacturer/model, no entities
    });
    const devices = strategyDevices(hass, { devices: ["mystery"] });
    expect(devices).toHaveLength(1);
    const cards = buildDeviceCards(hass, devices[0]);
    expect(cards[0].type).toBe("markdown");
    expect(cards[0].content).toContain("no radar data");
  });

  it("keeps a registry-matched device whose entities were renamed beyond recognition", () => {
    const renamed = "sensor.den_motion_distance";
    const hass = hassWith(
      { [renamed]: state(renamed, "42") },
      { [renamed]: { device_id: "msr" } },
      {
        msr: {
          name: "Den MSR-2",
          manufacturer: "ApolloAutomation",
          model: "MSR-2",
        },
      }
    );
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].profile?.key).toBe("ld2410");
  });
});
