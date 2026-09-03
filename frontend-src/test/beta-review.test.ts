/**
 * Regressions from the 2.0.1 adversarial review: base names that survive HA's
 * `_2` dedup tail, the MSR-1 firmware's own spellings, unique view paths, and
 * the zone websocket opening exactly once per card.
 */

import { describe, it, expect, vi } from "vitest";
import { baseNameFromDevice, entityMapFromDevice } from "../src/entities";
import { generateViews } from "../src/strategy-core";
import {
  CONFIG_ENTRIES_SUBSCRIBE,
  ZONES_SUBSCRIBE,
  connectZones,
} from "../src/zone-map/api";
import type { HomeAssistant, HassEntity } from "../src/types";

function hassWith(
  entityIds: Record<string, string>,
  devices: HomeAssistant["devices"]
): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, { device_id?: string }> = {};
  for (const [id, deviceId] of Object.entries(entityIds)) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: deviceId };
  }
  return { states, entities, devices };
}

describe("base name derivation", () => {
  it("survives the `_2` dedup tail on every LD2410 suffix", () => {
    const hass = hassWith(
      {
        "switch.office_radar_engineering_mode_2": "d",
        "number.office_g3_move_threshold_2": "d",
        "binary_sensor.office_radar_zone_1_occupancy_2": "d",
      },
      { d: { name: "Office" } }
    );
    expect(baseNameFromDevice(hass, "d")).toBe("office");
  });

  it("derives a base from MSR-1 firmware names", () => {
    const hass = hassWith(
      {
        "switch.apollo_multisensor_mk1_msr_1_abc_radar_control_bluetooth": "d",
        "select.apollo_multisensor_mk1_msr_1_abc_radar_distance_resolution": "d",
      },
      { d: { name: "MSR-1" } }
    );
    expect(baseNameFromDevice(hass, "d")).toBe("apollo_multisensor_mk1_msr_1_abc");
  });
});

describe("MSR-1 firmware entity names", () => {
  it("maps Radar Control Bluetooth and Radar Distance Resolution into the tuning cards", () => {
    const base = "apollo_multisensor_mk1_msr_1_abc";
    const hass = hassWith(
      {
        [`switch.${base}_radar_control_bluetooth`]: "d",
        [`select.${base}_radar_distance_resolution`]: "d",
        [`switch.${base}_radar_engineering_mode`]: "d",
      },
      { d: { name: "MSR-1" } }
    );
    const map = entityMapFromDevice(hass, "d")!;
    expect(map.bluetooth).toBe(`switch.${base}_radar_control_bluetooth`);
    expect(map.gate_size).toBe(`select.${base}_radar_distance_resolution`);
  });
});

describe("dashboard view paths", () => {
  it("keeps two radars with the same base on distinct paths", () => {
    // Two R-PRO-1s renamed to the same name with "rename entity ids" ticked:
    // the second one's ids carry `_2`, which the `_ld2412_.+` suffix swallows,
    // so both bases are `office`. HA opens the first view matching the URL.
    const hass = hassWith(
      {
        "switch.office_ld2412_engineering_mode": "a",
        "switch.office_ld2412_engineering_mode_2": "b",
      },
      { a: { name: "Office" }, b: { name: "Office" } }
    );
    const paths = generateViews(hass, {}).map((v) => v.path);
    expect(paths).toHaveLength(2);
    expect(new Set(paths).size).toBe(2);
    expect(paths[0]).toBe("office");
  });
});

type Handler = (message: any) => void;

function fakeConnection() {
  const handlers: Record<string, Handler[]> = {};
  const closed: string[] = [];
  const subscribeMessage = vi.fn(async (cb: Handler, msg: any) => {
    (handlers[msg.type] ||= []).push(cb);
    return () => {
      closed.push(msg.type);
    };
  });
  return { subscribeMessage, handlers, closed };
}

function apiHass() {
  return {
    callWS: vi.fn().mockResolvedValue({
      zones: {},
      entities: null,
      rotation_deg: null,
      label: null,
      suggested_entities: [],
    }),
    connection: fakeConnection(),
  } as any;
}

function zoneSubscribes(hass: any): number {
  return hass.connection.subscribeMessage.mock.calls.filter(
    (call: any[]) => call[1].type === ZONES_SUBSCRIBE
  ).length;
}

describe("connectZones opens once", () => {
  it("does not reopen on the config entry feed's initial dump", async () => {
    // The feed answers a new subscriber with every existing entry, typed null.
    // Treating that as a reload opened every card twice on every mount.
    const hass = apiHass();
    const onConfig = vi.fn();
    await connectZones(hass, "dev1", { onConfig, onError: vi.fn() });

    hass.connection.handlers[CONFIG_ENTRIES_SUBSCRIBE][0]([
      { type: null, entry: { domain: "apollo_mmwave", state: "loaded" } },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(zoneSubscribes(hass)).toBe(1);
    expect(onConfig).toHaveBeenCalledTimes(1);
  });

  it("serialises overlapping reopens so no subscription is orphaned", async () => {
    // A reload emits several entry updates in a row. Two opens racing each
    // other both found nothing to close and the second handle overwrote the
    // first, leaving it open server side and delivering every payload twice.
    const hass = apiHass();
    await connectZones(hass, "dev1", { onConfig: vi.fn(), onError: vi.fn() });
    const reload = [{ type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } }];

    hass.connection.handlers[CONFIG_ENTRIES_SUBSCRIBE][0](reload);
    hass.connection.handlers[CONFIG_ENTRIES_SUBSCRIBE][0](reload);
    await vi.waitFor(() => expect(zoneSubscribes(hass)).toBe(3));

    // Each reopen closed the one before it: nothing left dangling.
    expect(
      hass.connection.closed.filter((t: string) => t === ZONES_SUBSCRIBE)
    ).toHaveLength(2);
  });

  it("closes a reopen's subscription that resolves after dispose", async () => {
    // A reload triggers a reopen; the card is detached while that subscribe is
    // still in flight. The teardown finds nothing to close, so the late handle
    // has to close itself instead of staying open server side.
    const hass = apiHass();
    const closed: string[] = [];
    const pending: ((unsub: () => void) => void)[] = [];
    let zoneSubscribeCount = 0;
    hass.connection.subscribeMessage = vi.fn(
      (_cb: Handler, msg: any) =>
        new Promise<() => void>((resolve) => {
          const unsub = () => {
            closed.push(msg.type);
          };
          if (msg.type === ZONES_SUBSCRIBE && ++zoneSubscribeCount === 2) {
            pending.push(resolve);
          } else if (msg.type === CONFIG_ENTRIES_SUBSCRIBE) {
            (hass.connection.handlers[msg.type] ||= []).push(_cb);
            resolve(unsub);
          } else {
            resolve(unsub);
          }
        })
    );

    const dispose = await connectZones(hass, "dev1", { onConfig: vi.fn(), onError: vi.fn() });
    hass.connection.handlers[CONFIG_ENTRIES_SUBSCRIBE][0]([
      { type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } },
    ]);
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    await dispose();
    pending[0](() => {
      closed.push("late");
    });
    await vi.waitFor(() => expect(closed).toContain("late"));
  });
});
