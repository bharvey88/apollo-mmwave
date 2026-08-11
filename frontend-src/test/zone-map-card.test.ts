/**
 * The card's identity and config contract.
 *
 * The element name is the load-bearing part here. `zone-mapper-card` is also
 * the name the standalone card registers, and whichever bundle a browser loads
 * first wins it, so a user running both got one integration's card writing to
 * the other's backend. We take a name in our own namespace and never answer to
 * the old one.
 */

import { describe, it, expect, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import { CONFIG_ENTRIES_SUBSCRIBE, ZONES_GET, ZONES_SUBSCRIBE } from "../src/zone-map/api";

type Handler = (message: any) => void;

const ZONE_PAYLOAD = {
  zones: {
    "1": {
      shape: "rect",
      data: { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 },
      name: "Doorway",
    },
  },
  entities: null as any,
  rotation_deg: 12,
  label: "Office radar",
  suggested_entities: [{ x: "sensor.a_x", y: "sensor.a_y" }],
};

/** A hass whose zone read answers from the store, never from attributes. */
function fakeHass(payload: any = ZONE_PAYLOAD, error?: any) {
  const handlers: Record<string, Handler[]> = {};
  const hass: any = {
    states: {},
    entities: {},
    devices: {},
    handlers,
    // Mutable, so a test can point the store at a second radar mid-life.
    payload,
    error,
    callService: vi.fn(),
    callWS: vi.fn(async (msg: any) => {
      if (msg.type === ZONES_GET) {
        if (hass.error) throw hass.error;
        return hass.payload;
      }
      return [];
    }),
    connection: {
      subscribeMessage: vi.fn(async (cb: Handler, msg: any) => {
        if (hass.error && msg.type === ZONES_SUBSCRIBE) throw hass.error;
        (handlers[msg.type] ||= []).push(cb);
        return () => {
          hass.closed.push(msg.type);
        };
      }),
    },
    closed: [] as string[],
  };
  return hass;
}

/** Collect the toasts the card raises. */
function notifications(card: any): string[] {
  const seen: string[] = [];
  card.addEventListener("hass-notification", (event: any) => {
    seen.push(event.detail?.message);
  });
  return seen;
}

/** Attach a configured card to a hass and wait for the first payload. */
async function mountCard(hass: any, config: Record<string, any> = {}) {
  const card = new ZoneMapCard();
  card.setConfig({ device_id: "dev123", ...config } as any);
  (card as any).hass = hass;
  await vi.waitFor(() => expect(hass.callWS).toHaveBeenCalled());
  await vi.waitFor(() =>
    expect((card as any)._zoneConfigPayload || (card as any)._loadError).toBeTruthy()
  );
  return card as any;
}

describe("zone map card registration", () => {
  it("registers under the apollo-radar namespace and not the old name", async () => {
    await import("../src/zone-map/card");
    expect(customElements.get("apollo-radar-zone-map-card")).toBeDefined();
    expect(customElements.get("zone-mapper-card")).toBeUndefined();
  });

  it("advertises itself in the card picker with the LD2450 description", () => {
    const entry = (window as any).customCards.find(
      (c: any) => c.type === "apollo-radar-zone-map-card"
    );
    expect(entry.name).toBe("Apollo Zone Map");
    expect(entry.description).toContain("LD2450");
  });

  it("offers a stub config under the new type, keyed by device id", () => {
    const stub = ZoneMapCard.getStubConfig() as any;
    expect(stub.type).toBe("custom:apollo-radar-zone-map-card");
    expect(stub).not.toHaveProperty("location");
  });
});

describe("zone map card config", () => {
  it("rejects a config with no device_id and says what to do about it", () => {
    const card = new ZoneMapCard();
    expect(() => card.setConfig({} as any)).toThrow(/device_id/);
  });

  it("still rejects the old location-only config", () => {
    const card = new ZoneMapCard();
    expect(() => card.setConfig({ location: "Office" } as any)).toThrow();
  });

  it("renders with a device id, exercising the canvas stub", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "abc123" } as any);
    expect(card.shadowRoot?.querySelector("canvas")).toBeTruthy();
  });

  it("keeps title as display only, separate from the device id", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "abc123", title: "Kitchen" } as any);
    // Cast: the card is still @ts-nocheck, so its fields aren't declared.
    expect((card as any).deviceId).toBe("abc123");
    expect((card as any).cardTitle).toBe("Kitchen");
  });

  it("does not leak the title onto the host element's tooltip", () => {
    // `title` is a native HTMLElement accessor: assigning it would reflect to
    // the title attribute and put a browser tooltip over the whole card.
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "abc123", title: "Kitchen" } as any);
    expect(card.hasAttribute("title")).toBe(false);
  });

  it("keeps no location string at all", () => {
    // The location string was the backend key AND the slug the card built
    // entity ids from. Both are gone; the device id is the only key.
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "abc123", title: "Kitchen" } as any);
    expect((card as any).location).toBeUndefined();
    expect((card as any).updateZonesFromEntities).toBeUndefined();
  });
});

describe("zone map card zone loading", () => {
  it("reads zones from the store, not from entity attributes", async () => {
    const hass = fakeHass();
    // A stale zone entity carrying different geometry. The card must not look.
    hass.states["sensor.apollo_mmwave_dev123_zone_1"] = {
      entity_id: "sensor.apollo_mmwave_dev123_zone_1",
      state: "off",
      attributes: { shape: "rect", data: { x_min: -9, x_max: -8, y_min: -9, y_max: -8 } },
    };

    const card = await mountCard(hass);

    expect(hass.callWS).toHaveBeenCalledWith({ type: ZONES_GET, device_id: "dev123" });
    expect(card.zones).toEqual([
      { id: 1, shape: "rect", data: { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 } },
    ]);
    expect(card.zoneConfig).toEqual([{ id: 1, name: "Doorway" }]);
    expect(card.coneAngleDeg).toBe(12);
  });

  it("applies a pushed payload without a page reload", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);

    hass.handlers[ZONES_SUBSCRIBE][0]({
      ...ZONE_PAYLOAD,
      zones: {},
      rotation_deg: -30,
    });

    expect(card.zones).toEqual([]);
    expect(card.coneAngleDeg).toBe(-30);
  });

  it("watches for the config entry reloading so it does not sit on stale data", async () => {
    const hass = fakeHass();
    await mountCard(hass);
    const zoneSubscribes = () =>
      hass.connection.subscribeMessage.mock.calls.filter(
        (call: any[]) => call[1].type === ZONES_SUBSCRIBE
      ).length;

    hass.handlers[CONFIG_ENTRIES_SUBSCRIBE][0]([
      { type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } },
    ]);

    await vi.waitFor(() => expect(zoneSubscribes()).toBe(2));
  });

  it("shows an error for an unknown device instead of an empty map", async () => {
    const hass = fakeHass(ZONE_PAYLOAD, {
      code: "not_found",
      message: "No Home Assistant device with id dev123",
    });

    const card = await mountCard(hass);

    expect(card._loadError).toBeTruthy();
    // Names the id the card asked about, so the fix is obvious.
    expect(card.shadowRoot.textContent).toContain("dev123");
    // An empty canvas reads as "this radar has no zones yet", which is exactly
    // the ambiguity this rework removes.
    expect(card.shadowRoot.querySelector("canvas")).toBeNull();
  });

  it("retargets its reads when the card is pointed at another radar", async () => {
    // Home Assistant reuses a live element and calls setConfig again whenever
    // the config changes. A card that retargets its writes but keeps reading
    // the old radar will save one radar's geometry into the other's store.
    const hass = fakeHass();
    const card = await mountCard(hass);
    expect(card.zones).toHaveLength(1);

    hass.payload = { ...ZONE_PAYLOAD, zones: {}, label: "Bedroom" };
    card.setConfig({ type: "custom:apollo-radar-zone-map-card", device_id: "devB" });

    // Nothing from the old radar may survive the retarget, not even for the
    // round trip it takes the new one to answer.
    expect(card.zones).toEqual([]);
    expect(card._zoneConfigPayload).toBeNull();
    await vi.waitFor(() =>
      expect(hass.callWS).toHaveBeenCalledWith({ type: ZONES_GET, device_id: "devB" })
    );
    await vi.waitFor(() => expect(hass.closed).toContain(ZONES_SUBSCRIBE));
    expect(card.zones).toEqual([]);
    expect(
      hass.connection.subscribeMessage.mock.calls.filter(
        (call: any[]) => call[1].type === ZONES_SUBSCRIBE
      ).at(-1)[1].device_id
    ).toBe("devB");
  });

  it("keeps its subscription when the config changes but the radar does not", async () => {
    // The manual card editor calls setConfig on every keystroke.
    const hass = fakeHass();
    const card = await mountCard(hass);

    card.setConfig({
      type: "custom:apollo-radar-zone-map-card",
      device_id: "dev123",
      title: "Kitc",
    });
    await Promise.resolve();

    expect(
      hass.connection.subscribeMessage.mock.calls.filter(
        (call: any[]) => call[1].type === ZONES_SUBSCRIBE
      )
    ).toHaveLength(1);
    expect(card.zones).toHaveLength(1);
  });

  it("closes its subscription when it leaves the page", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);

    card.disconnectedCallback();

    await vi.waitFor(() => expect(hass.closed).toContain(ZONES_SUBSCRIBE));
  });
});

describe("zone map card target pairs", () => {
  it("uses the radar's detected targets when none were ever configured", async () => {
    const card = await mountCard(fakeHass({ ...ZONE_PAYLOAD, entities: null }));

    expect(card.trackedEntities).toEqual([{ x: "sensor.a_x", y: "sensor.a_y" }]);
    expect(card.shadowRoot.getElementById("entityStatus").textContent).toMatch(
      /detected targets/i
    );
  });

  it("tracks nothing when the user deliberately cleared the list", async () => {
    // [] is not the same as null. Falling back to the suggestions here would
    // re-enable auto-detection for the one user who switched it off.
    const card = await mountCard(fakeHass({ ...ZONE_PAYLOAD, entities: [] }));

    expect(card.trackedEntities).toEqual([]);
    expect(card.shadowRoot.getElementById("entityStatus").textContent).toMatch(
      /no targets/i
    );
  });

  it("uses the saved pairs when the user chose them", async () => {
    const chosen = [{ x: "sensor.chosen_x", y: "sensor.chosen_y" }];
    const card = await mountCard(fakeHass({ ...ZONE_PAYLOAD, entities: chosen }));

    expect(card.trackedEntities).toEqual(chosen);
  });

  it("does not overwrite pairs the user is still editing", async () => {
    const hass = fakeHass({ ...ZONE_PAYLOAD, entities: [] });
    const card = await mountCard(hass);

    card.shadowRoot.getElementById("btnAddPair").click();
    card.trackedEntities[0].x = "sensor.half_typed_x";
    hass.handlers[ZONES_SUBSCRIBE][0]({ ...ZONE_PAYLOAD, entities: [] });

    expect(card.trackedEntities).toEqual([{ x: "sensor.half_typed_x", y: "" }]);
  });

  it("saves an emptied pair list as a real clear, not as no change", async () => {
    // The service treats `entities: []` as "no change", so a user who emptied
    // the list used to get a "saved" toast and no save.
    const hass = fakeHass({ ...ZONE_PAYLOAD, entities: [{ x: "sensor.x", y: "sensor.y" }] });
    const card = await mountCard(hass);
    card.trackedEntities = [];

    card.shadowRoot.getElementById("btnApplyEntities").click();

    expect(hass.callService).toHaveBeenCalledWith("apollo_mmwave", "update_zone", {
      device_id: "dev123",
      clear_entities: true,
    });
  });

  it("does not claim a save Home Assistant rejected", async () => {
    // Clicking Apply while the entry is reloading used to toast "saved", clear
    // the unsaved-edit hold, and then let the next payload revert the list.
    const hass = fakeHass({ ...ZONE_PAYLOAD, entities: [] });
    const card = await mountCard(hass);
    const toasts = notifications(card);
    hass.callService.mockRejectedValue(new Error("Apollo mmWave is not loaded"));
    card.shadowRoot.getElementById("btnAddPair").click();
    card.trackedEntities[0] = { x: "sensor.x", y: "sensor.y" };

    card.shadowRoot.getElementById("btnApplyEntities").click();
    await vi.waitFor(() => expect(toasts).toHaveLength(1));

    expect(toasts[0]).toMatch(/could not save/i);
    expect(toasts[0]).toMatch(/not loaded/i);
    // The hold stays, so the user's list is still theirs to retry.
    expect(card._entitiesDirty).toBe(true);
    expect(card.trackedEntities).toEqual([{ x: "sensor.x", y: "sensor.y" }]);
  });

  it("releases the unsaved-edit hold once the save lands", async () => {
    const hass = fakeHass({ ...ZONE_PAYLOAD, entities: [] });
    const card = await mountCard(hass);
    card.shadowRoot.getElementById("btnAddPair").click();
    card.trackedEntities[0] = { x: "sensor.x", y: "sensor.y" };

    card.shadowRoot.getElementById("btnApplyEntities").click();
    await vi.waitFor(() => expect(card._entitiesDirty).toBe(false));
  });

  it("does not hold unsaved edits past a re-attach or a config change", async () => {
    // Nothing else clears the hold, so a user who clicked Remove out of
    // curiosity and wandered off froze the pair list for the element's life.
    const hass = fakeHass();
    const card = await mountCard(hass);

    card.shadowRoot.getElementById("btnAddPair").click();
    expect(card._entitiesDirty).toBe(true);
    card.connectedCallback();
    expect(card._entitiesDirty).toBe(false);

    card.shadowRoot.getElementById("btnAddPair").click();
    card.setConfig({ type: "custom:apollo-radar-zone-map-card", device_id: "dev123" });
    expect(card._entitiesDirty).toBe(false);

    hass.handlers[ZONES_SUBSCRIBE][0](ZONE_PAYLOAD);
    expect(card.trackedEntities).toEqual(ZONE_PAYLOAD.suggested_entities);
  });

  it("saves chosen pairs by device id", async () => {
    const pairs = [{ x: "sensor.x", y: "sensor.y" }];
    const hass = fakeHass({ ...ZONE_PAYLOAD, entities: pairs });
    const card = await mountCard(hass);

    card.shadowRoot.getElementById("btnApplyEntities").click();

    expect(hass.callService).toHaveBeenCalledWith("apollo_mmwave", "update_zone", {
      device_id: "dev123",
      entities: pairs,
    });
  });
});

describe("zone map card writes", () => {
  it("saves a shape by device id and never carries the pair list along", async () => {
    // Sending the card's in-memory pair list on every zone edit is what erased
    // two customers' configuration.
    const hass = fakeHass();
    const card = await mountCard(hass);
    hass.callService.mockClear();

    card.updateHomeAssistantShape(1, "rect", { x_min: 0, x_max: 1, y_min: 0, y_max: 1 });

    expect(hass.callService).toHaveBeenCalledWith("apollo_mmwave", "update_zone", {
      device_id: "dev123",
      zone_id: 1,
      shape: "rect",
      data: { x_min: 0, x_max: 1, y_min: 0, y_max: 1 },
    });
  });

  it("says a zone was saved only once the store took it", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    const toasts = notifications(card);

    await card.updateHomeAssistantShape(1, "rect", { x_min: 0, x_max: 1 }, "Zone 1 saved");
    expect(toasts).toEqual(["Zone 1 saved"]);

    hass.callService.mockRejectedValue(new Error("no such device"));
    await card.updateHomeAssistantShape(1, "rect", { x_min: 0, x_max: 1 }, "Zone 1 saved");
    expect(toasts).toHaveLength(2);
    expect(toasts[1]).toMatch(/could not save/i);
  });

  it("persists rotation by device id", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    hass.callService.mockClear();
    card.coneAngleDeg = 45;

    card._persistRotation();

    expect(hass.callService).toHaveBeenCalledWith("apollo_mmwave", "update_zone", {
      device_id: "dev123",
      rotation_deg: 45,
    });
  });

  it("adds a zone by device id", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    hass.callService.mockClear();

    card._handleAddZone();

    const payload = hass.callService.mock.calls[0][2];
    expect(payload.device_id).toBe("dev123");
    expect(payload).not.toHaveProperty("location");
  });
});
