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

/** A fakeHass with hass.themes.darkMode set, for the theme-follow tests. */
function themedHass(darkMode: boolean) {
  const hass = fakeHass();
  hass.themes = { darkMode };
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
  // Only the answer is worth waiting for. A card whose subscribe is refused
  // never reaches the read, and the card's only other websocket calls (the
  // registry lists the deleted pickers needed) are gone.
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
    const stub = ZoneMapCard.getStubConfig(fakeHass()) as any;
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

describe("zone map card theme", () => {
  it("follows the Home Assistant theme when dark_mode is not in the config", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "dev123" } as any);

    card.hass = themedHass(true);

    expect((card as any).darkMode).toBe(true);
    expect(
      card.shadowRoot!.querySelector(".container")?.classList.contains("dark")
    ).toBe(true);
  });

  it("lets an explicit dark_mode win over the theme in both directions", () => {
    const forcedLight = new ZoneMapCard();
    forcedLight.setConfig({ device_id: "dev123", dark_mode: false } as any);
    forcedLight.hass = themedHass(true);
    expect((forcedLight as any).darkMode).toBe(false);

    const forcedDark = new ZoneMapCard();
    forcedDark.setConfig({ device_id: "dev123", dark_mode: true } as any);
    forcedDark.hass = themedHass(false);
    expect((forcedDark as any).darkMode).toBe(true);
  });

  it("repaints the canvas when the theme flips while mounted, not just the field", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "dev123" } as any);
    card.hass = themedHass(false);

    const canvasBefore = card.shadowRoot!.querySelector("canvas");
    expect(
      card.shadowRoot!.querySelector(".container")?.classList.contains("dark")
    ).toBe(false);

    card.hass = themedHass(true);

    const canvasAfter = card.shadowRoot!.querySelector("canvas");
    expect((card as any).darkMode).toBe(true);
    expect(
      card.shadowRoot!.querySelector(".container")?.classList.contains("dark")
    ).toBe(true);
    // A fresh element, not the same node with a class swapped in: proves the
    // setter actually rebuilt the canvas rather than only flipping a field.
    expect(canvasAfter).not.toBe(canvasBefore);

    // The LD2450 pushes coordinates several times a second through this same
    // setter. A second call with no theme change must not rebuild again.
    card.hass = themedHass(true);
    expect(card.shadowRoot!.querySelector("canvas")).toBe(canvasAfter);
  });

  it("omits dark_mode from the stub config so a manually added card follows the theme", () => {
    // HA's "Add Card" picker seeds a new card from this stub. A hardcoded key
    // here would ship every manually added card as a light-mode override, on
    // any dashboard, which is the exact bug this task exists to fix.
    const stub = ZoneMapCard.getStubConfig(fakeHass());
    expect(stub).not.toHaveProperty("dark_mode");

    const card = new ZoneMapCard();
    // fakeHass has no device registry, so the stub's own device_id lookup
    // comes back empty; that lookup is not what this test is about.
    card.setConfig({ ...stub, device_id: "dev123" } as any);
    card.hass = themedHass(true);

    expect((card as any).darkMode).toBe(true);
  });

  it("reverts to the theme when dark_mode is removed from a mounted card's config", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "dev123", dark_mode: true } as any);
    // The theme is light, but the config override still wins.
    card.hass = themedHass(false);
    expect((card as any).darkMode).toBe(true);

    // Home Assistant re-calls setConfig on a live element whenever the config
    // changes; this is what a user editing the card to delete that line looks
    // like. Without reverting darkMode here, the render() at the end of
    // setConfig would still paint the stale (dark) value until the next hass
    // push happened to correct it, a wrong-theme flash on a card that is
    // theme-following the whole time.
    card.setConfig({ device_id: "dev123" } as any);
    expect((card as any).darkMode).toBe(false);
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
    expect(card.shadowRoot!.querySelector("canvas")).toBeNull();
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

  it("drops undo, rotation and lock state when pointed at another radar", async () => {
    // The undo snapshot holds the OLD radar's geometry and _performUndo writes
    // it with whatever deviceId the card holds when the button is clicked, so a
    // snapshot that survives a retarget is the cross-device overwrite again,
    // reached through Undo instead of a drag.
    const hass = fakeHass();
    const card = await mountCard(hass);
    card._setUndoSnapshot([
      { zoneId: 1, shape: "rect", data: { x_min: 0, x_max: 1, y_min: 0, y_max: 1 } },
    ]);
    card.isLocked = true;
    expect(card.shadowRoot.getElementById("btnUndo").disabled).toBe(false);
    expect(card.coneAngleDeg).toBe(12);

    card.setConfig({ type: "custom:apollo-radar-zone-map-card", device_id: "devB" });

    expect(card._undoSnapshot).toBeNull();
    expect(card.shadowRoot.getElementById("btnUndo").disabled).toBe(true);
    // Not the previous radar's angle or lock for the round trip it takes the
    // new one to answer.
    expect(card.coneAngleDeg).toBe(0);
    expect(card.isLocked).toBe(false);
    expect(card._autoLockApplied).toBeFalsy();

    hass.callService.mockClear();
    card.shadowRoot.getElementById("btnUndo").click();
    expect(hass.callService).not.toHaveBeenCalled();
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
    expect(card.shadowRoot.getElementById("entityStatus").textContent).toMatch(
      /tracking 1 target pair\./i
    );
  });

  it("takes every payload, having nothing half-typed to protect", async () => {
    // The pair rows are gone, so there is no unsaved edit to hold a payload
    // off any more, and the hold that used to do it is gone with them.
    const hass = fakeHass({ ...ZONE_PAYLOAD, entities: [] });
    const card = await mountCard(hass);
    expect(card._entitiesDirty).toBeUndefined();

    hass.handlers[ZONES_SUBSCRIBE][0]({
      ...ZONE_PAYLOAD,
      entities: [{ x: "sensor.pushed_x", y: "sensor.pushed_y" }],
    });

    expect(card.trackedEntities).toEqual([{ x: "sensor.pushed_x", y: "sensor.pushed_y" }]);
  });

  it("offers no pair-editing UI, only the read-only status line", async () => {
    // The pair pickers were a hand-rolled combobox whose list closed on a
    // 200ms blur timer, so a click held longer than that silently did nothing.
    // Pairs are resolved by the integration and overridden by the service.
    const card = await mountCard(fakeHass());

    expect(card.shadowRoot.getElementById("btnAddPair")).toBeNull();
    expect(card.shadowRoot.getElementById("btnApplyEntities")).toBeNull();
    expect(card.shadowRoot.getElementById("entityPairs")).toBeNull();
    expect(card.shadowRoot.getElementById("deviceComboWrapper")).toBeNull();
    expect(card.shadowRoot!.querySelector(".combo-list")).toBeNull();
    expect(card.shadowRoot.getElementById("entityStatus")).toBeTruthy();
  });

  it("never asks Home Assistant for the registries the pickers needed", async () => {
    // Two registry list calls per card on first hass, for dropdowns that are
    // no longer there.
    const hass = fakeHass();
    await mountCard(hass);

    const types = hass.callWS.mock.calls.map((call: any[]) => call[0].type);
    expect(types).not.toContain("config/device_registry/list");
    expect(types).not.toContain("config/entity_registry/list");
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
