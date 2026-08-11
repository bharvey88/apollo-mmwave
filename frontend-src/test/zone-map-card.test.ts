/**
 * The card's identity and config contract.
 *
 * The element name is the load-bearing part here. `zone-mapper-card` is also
 * the name the standalone card registers, and whichever bundle a browser loads
 * first wins it, so a user running both got one integration's card writing to
 * the other's backend. We take a name in our own namespace and never answer to
 * the old one.
 */

import { describe, it, expect } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";

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
});
