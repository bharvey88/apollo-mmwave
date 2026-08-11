/**
 * First test the zone card has ever had. It exists to prove the card is inside
 * the build and importable; Tasks 10 to 13 grow real coverage as sections of
 * it get rewritten.
 */

import { describe, it, expect } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";

describe("zone map card", () => {
  it("is constructible and requires a location", () => {
    const card = new ZoneMapCard();
    expect(() => card.setConfig({} as any)).toThrow();
  });

  it("renders with a location, exercising the canvas stub", () => {
    const card = new ZoneMapCard();
    card.setConfig({ location: "Office" } as any);
    expect(card.shadowRoot?.querySelector("canvas")).toBeTruthy();
  });
});
