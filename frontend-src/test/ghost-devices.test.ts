/**
 * Offline and ghost devices. A registry-matched Apollo radar gets a tab
 * whether or not it is online (an unplugged testbench is still the user's
 * radar); its tab carries an offline note until it reports in. A device with
 * no registry model has only its entity names to vouch for it, so it needs a
 * live radar entity to count at all.
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
  it("keeps a registry-matched radar whose states are all unavailable, marked offline", () => {
    const { states, entities } = mtrFixture("unavailable");
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].online).toBe(false);
    expect(devices[0].ld2450).toBe(true);
    const cards = buildDeviceCards(hass, devices[0]);
    expect(cards[0].content).toContain("Offline right now");
  });

  it("keeps a registry-matched radar with registered entities but no states", () => {
    const { states, entities } = mtrFixture(undefined);
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    expect(detectRadarDevices(hass)[0].online).toBe(false);
  });

  it("keeps a registry-matched device with zero entities (add race), offline", () => {
    const hass = hassWith({}, {}, { mtr: MTR_DEVICE });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].online).toBe(false);
  });

  it("detects a live MTR-1 with no offline note", () => {
    const { states, entities } = mtrFixture("1200");
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].ld2450).toBe(true);
    expect(devices[0].online).toBe(true);
    expect(buildDeviceCards(hass, devices[0])[0].content).not.toContain("Offline");
  });

  it("skips a device with no registry model until a radar entity is live", () => {
    // DIY / pre-project firmware: entity names are the only evidence.
    const x = "sensor.diy_ld2450_target_1_x";
    const dead = hassWith(
      { [x]: state(x, "unavailable") },
      { [x]: { device_id: "diy" } },
      { diy: { name: "DIY radar" } }
    );
    expect(detectRadarDevices(dead)).toHaveLength(0);
    const live = hassWith(
      { [x]: state(x, "10") },
      { [x]: { device_id: "diy" } },
      { diy: { name: "DIY radar" } }
    );
    expect(detectRadarDevices(live)).toHaveLength(1);
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
    const hass = hassWith(states, entities, { mtr: { name: "Unknown radar" } });
    // No registry model and nothing live: auto-detection skips it…
    expect(strategyDevices(hass, {})).toHaveLength(0);
    // …but an explicit selection forces it, capabilities from its entities.
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

describe("MTR-1 firmware entity naming", () => {
  // Shipped MTR-1 firmware names the target sensors "Target-1 X" (no LD2450
  // prefix). Before 2.0.1 nothing recognised them: the tab appeared only via
  // the registry model, and the zone card had no targets to draw.
  const x = "sensor.apollo_mtr_1_cbbdb4_target_1_x";
  const y = "sensor.apollo_mtr_1_cbbdb4_target_1_y";
  const entities: Entities = { [x]: { device_id: "mtr" }, [y]: { device_id: "mtr" } };
  const states: States = { [x]: state(x, "1200"), [y]: state(y, "800") };

  it("detects a live MTR-1 by its target sensors even without a registry model", () => {
    const hass = hassWith(states, entities, { mtr: { name: "Apollo MTR-1 cbbdb4" } });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].ld2450).toBe(true);
    expect(devices[0].base).toBe("apollo_mtr_1_cbbdb4");
  });

  it("marks it offline once its target sensors go unavailable", () => {
    const dead: States = { [x]: state(x, "unavailable"), [y]: state(y, "unavailable") };
    const hass = hassWith(dead, entities, { mtr: MTR_DEVICE });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].online).toBe(false);
  });
});
