/**
 * The zone card's data protocol.
 *
 * Before 2.0 the card built `sensor.apollo_mmwave_<slug>_zone_<n>` out of a
 * display name and read zone geometry from that entity's attributes. An
 * unavailable entity has its attributes stripped, so the card read an empty
 * config and wrote the emptiness back over the real one. These tests pin the
 * replacement: the store answers over the websocket, keyed by device id, and
 * nothing here builds an entity id.
 */

import { describe, it, expect, vi } from "vitest";
import {
  CONFIG_ENTRIES_SUBSCRIBE,
  RETRY_DELAYS_MS,
  ZONES_GET,
  ZONES_SUBSCRIBE,
  connectZones,
  fetchZones,
  subscribeZones,
} from "../src/zone-map/api";

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

const PAYLOAD = {
  zones: { "1": { shape: "rect", data: { x_min: 0, x_max: 10, y_min: 0, y_max: 10 } } },
  entities: [] as any,
  rotation_deg: 15,
  label: "Kitchen",
  suggested_entities: [{ x: "sensor.a_x", y: "sensor.a_y" }],
};

function fakeHass(overrides: Record<string, any> = {}) {
  return {
    callWS: vi.fn().mockResolvedValue(PAYLOAD),
    connection: fakeConnection(),
    ...overrides,
  } as any;
}

describe("fetchZones", () => {
  it("reads zones over the websocket, not from entity attributes", async () => {
    const hass = fakeHass();

    const config = await fetchZones(hass, "dev123");

    expect(hass.callWS).toHaveBeenCalledWith({
      type: ZONES_GET,
      device_id: "dev123",
    });
    expect(ZONES_GET).toBe("apollo_mmwave/zones/get");
    expect(config.rotation_deg).toBe(15);
    expect(config.suggested_entities).toHaveLength(1);
  });

  it("passes a null entities list through untouched", async () => {
    // null means never configured and [] means deliberately cleared. Anything
    // that normalises one into the other is the original bug.
    const hass = fakeHass({
      callWS: vi.fn().mockResolvedValue({ ...PAYLOAD, entities: null }),
    });

    const config = await fetchZones(hass, "dev123");

    expect(config.entities).toBeNull();
  });
});

describe("subscribeZones", () => {
  it("subscribes by device id and forwards every pushed payload", async () => {
    const hass = fakeHass();
    const seen: any[] = [];

    const unsubscribe = await subscribeZones(hass, "dev123", (c) => seen.push(c));

    expect(hass.connection.subscribeMessage).toHaveBeenCalledWith(expect.any(Function), {
      type: ZONES_SUBSCRIBE,
      device_id: "dev123",
    });
    hass.connection.handlers[ZONES_SUBSCRIBE][0](PAYLOAD);
    expect(seen).toEqual([PAYLOAD]);

    await unsubscribe();
    expect(hass.connection.closed).toContain(ZONES_SUBSCRIBE);
  });
});

describe("connectZones", () => {
  it("delivers the current configuration on connect", async () => {
    const hass = fakeHass();
    const onConfig = vi.fn();

    await connectZones(hass, "dev123", { onConfig, onError: vi.fn() });

    expect(onConfig).toHaveBeenCalledWith(PAYLOAD);
  });

  it("prefers a pushed payload over the slower initial read", async () => {
    // The subscription opens first so no change is missed between the two
    // calls, which means a push can land before the read answers. The push is
    // the newer of the two and must not be overwritten by it.
    const hass = fakeHass({ callWS: vi.fn() });
    let resolveRead: (value: any) => void = () => {};
    hass.callWS.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      })
    );
    const onConfig = vi.fn();

    const pending = connectZones(hass, "dev123", { onConfig, onError: vi.fn() });
    await vi.waitFor(() => expect(hass.connection.handlers[ZONES_SUBSCRIBE]).toBeDefined());
    hass.connection.handlers[ZONES_SUBSCRIBE][0]({ ...PAYLOAD, rotation_deg: 90 });
    resolveRead(PAYLOAD);
    await pending;

    expect(onConfig).toHaveBeenCalledTimes(1);
    expect(onConfig.mock.calls[0][0].rotation_deg).toBe(90);
  });

  it("surfaces an unknown device as an error, not as a radar with no zones", async () => {
    const hass = fakeHass({
      connection: {
        ...fakeConnection(),
        subscribeMessage: vi.fn().mockRejectedValue({
          code: "not_found",
          message: "No Home Assistant device with id ghost",
        }),
      },
    });
    const onConfig = vi.fn();
    const onError = vi.fn();

    await connectZones(hass, "ghost", { onConfig, onError });

    expect(onConfig).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("ghost"));
  });

  it("re-subscribes when the config entry is reloaded", async () => {
    // Unloading the entry tears the live subscription down without telling the
    // client, so the card would sit on stale data until a page reload.
    const hass = fakeHass();
    const onConfig = vi.fn();

    await connectZones(hass, "dev123", { onConfig, onError: vi.fn() });
    const zoneSubscribes = () =>
      hass.connection.subscribeMessage.mock.calls.filter(
        (call: any[]) => call[1].type === ZONES_SUBSCRIBE
      ).length;
    expect(zoneSubscribes()).toBe(1);

    hass.connection.handlers[CONFIG_ENTRIES_SUBSCRIBE][0]([
      { type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } },
    ]);

    await vi.waitFor(() => expect(zoneSubscribes()).toBe(2));
    expect(onConfig).toHaveBeenCalledTimes(2);
  });

  it("ignores config entry churn from other integrations", async () => {
    const hass = fakeHass();

    await connectZones(hass, "dev123", { onConfig: vi.fn(), onError: vi.fn() });
    hass.connection.handlers[CONFIG_ENTRIES_SUBSCRIBE][0]([
      { type: "updated", entry: { domain: "hue", state: "loaded" } },
    ]);
    await Promise.resolve();

    expect(
      hass.connection.subscribeMessage.mock.calls.filter(
        (call: any[]) => call[1].type === ZONES_SUBSCRIBE
      )
    ).toHaveLength(1);
  });

  it("still reads zones for a user who may not watch config entries", async () => {
    // config_entries/subscribe is admin only. A non-admin viewing the dashboard
    // loses reload recovery, not the card.
    const connection = fakeConnection();
    const subscribeMessage = vi.fn(async (cb: Handler, msg: any) => {
      if (msg.type === CONFIG_ENTRIES_SUBSCRIBE) {
        throw { code: "unauthorized", message: "Unauthorized" };
      }
      return connection.subscribeMessage(cb, msg);
    });
    const hass = fakeHass({ connection: { ...connection, subscribeMessage } });
    const onConfig = vi.fn();
    const onError = vi.fn();

    await connectZones(hass, "dev123", { onConfig, onError });

    expect(onConfig).toHaveBeenCalledWith(PAYLOAD);
    expect(onError).not.toHaveBeenCalled();
  });

  it("retries by itself while the integration is not loaded", async () => {
    // The error text promises the zones come back on their own. The config
    // entry feed is admin only, so for a non-admin mounting during a reload
    // this retry is the only thing that keeps that promise.
    vi.useFakeTimers();
    try {
      const connection = fakeConnection();
      let attempts = 0;
      const subscribeMessage = vi.fn(async (cb: Handler, msg: any) => {
        if (msg.type === ZONES_SUBSCRIBE) {
          attempts += 1;
          if (attempts === 1) throw { code: "not_loaded", message: "not loaded" };
        }
        return connection.subscribeMessage(cb, msg);
      });
      const hass = fakeHass({ connection: { ...connection, subscribeMessage } });
      const onConfig = vi.fn();
      const onError = vi.fn();

      await connectZones(hass, "dev123", { onConfig, onError });
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onConfig).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);

      expect(onConfig).toHaveBeenCalledWith(PAYLOAD);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up retrying rather than hammering forever", async () => {
    vi.useFakeTimers();
    try {
      const connection = fakeConnection();
      const subscribeMessage = vi.fn(async (cb: Handler, msg: any) => {
        if (msg.type === ZONES_SUBSCRIBE) {
          throw { code: "not_loaded", message: "not loaded" };
        }
        return connection.subscribeMessage(cb, msg);
      });
      const hass = fakeHass({ connection: { ...connection, subscribeMessage } });

      await connectZones(hass, "dev123", { onConfig: vi.fn(), onError: vi.fn() });
      const total = RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);
      await vi.advanceTimersByTimeAsync(total * 2);

      expect(subscribeMessage.mock.calls.filter((c: any[]) => c[1].type === ZONES_SUBSCRIBE))
        .toHaveLength(RETRY_DELAYS_MS.length + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry an error that retrying cannot fix", async () => {
    vi.useFakeTimers();
    try {
      const connection = fakeConnection();
      const subscribeMessage = vi.fn(async (cb: Handler, msg: any) => {
        if (msg.type === ZONES_SUBSCRIBE) throw { code: "not_found", message: "gone" };
        return connection.subscribeMessage(cb, msg);
      });
      const hass = fakeHass({ connection: { ...connection, subscribeMessage } });

      await connectZones(hass, "dev123", { onConfig: vi.fn(), onError: vi.fn() });
      await vi.advanceTimersByTimeAsync(60_000);

      expect(subscribeMessage.mock.calls.filter((c: any[]) => c[1].type === ZONES_SUBSCRIBE))
        .toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a pending retry when disposed", async () => {
    vi.useFakeTimers();
    try {
      const connection = fakeConnection();
      const subscribeMessage = vi.fn(async (cb: Handler, msg: any) => {
        if (msg.type === ZONES_SUBSCRIBE) throw { code: "not_loaded", message: "no" };
        return connection.subscribeMessage(cb, msg);
      });
      const hass = fakeHass({ connection: { ...connection, subscribeMessage } });

      const dispose = await connectZones(hass, "dev123", {
        onConfig: vi.fn(),
        onError: vi.fn(),
      });
      await dispose();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(subscribeMessage.mock.calls.filter((c: any[]) => c[1].type === ZONES_SUBSCRIBE))
        .toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes both subscriptions when disposed", async () => {
    const hass = fakeHass();

    const dispose = await connectZones(hass, "dev123", {
      onConfig: vi.fn(),
      onError: vi.fn(),
    });
    await dispose();

    expect(hass.connection.closed).toContain(ZONES_SUBSCRIBE);
    expect(hass.connection.closed).toContain(CONFIG_ENTRIES_SUBSCRIBE);
  });

  it("stops delivering payloads once disposed", async () => {
    const hass = fakeHass();
    const onConfig = vi.fn();

    const dispose = await connectZones(hass, "dev123", { onConfig, onError: vi.fn() });
    onConfig.mockClear();
    await dispose();
    hass.connection.handlers[ZONES_SUBSCRIBE][0](PAYLOAD);

    expect(onConfig).not.toHaveBeenCalled();
  });
});
