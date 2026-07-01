import { describe, it, expect } from "vitest";
import {
  anyResolved,
  entityIds,
  resolveRadar,
  resolvedStatesChanged,
} from "../src/cards/resolution";
import type { EntityMap, HomeAssistant, HassEntity } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const eng = `switch.${base}_radar_engineering_mode`;
const thr = `number.${base}_g0_move_threshold`;

function hassWith(entityIds: string[]): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, { device_id?: string }> = {};
  for (const id of entityIds) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: "dev1" };
  }
  return { states, entities, devices: { dev1: { name: "MSR-2" } } };
}

describe("entityIds", () => {
  it("flattens scalars and gate arrays, skipping holes", () => {
    const m: EntityMap = {
      engineering_mode: eng,
      move_threshold: [thr, undefined as any, `number.${base}_g2_move_threshold`],
      still_threshold: [],
      move_energy: [],
      still_energy: [],
    };
    expect(entityIds(m)).toEqual([eng, thr, `number.${base}_g2_move_threshold`]);
  });
});

describe("resolveRadar memoization", () => {
  const config = { type: "x", device_id: "dev1" };

  it("returns the cached object while config and registries are reference-equal", () => {
    const hass = hassWith([eng, thr]);
    const first = resolveRadar(undefined, hass, config);
    // A state tick replaces `hass` but keeps the registry objects.
    const tick: HomeAssistant = { ...hass, states: { ...hass.states } };
    expect(resolveRadar(first, tick, config)).toBe(first);
  });

  it("recomputes when the entity registry object is replaced", () => {
    const hass = hassWith([eng]);
    const first = resolveRadar(undefined, hass, config);
    const changed: HomeAssistant = { ...hass, entities: { ...hass.entities } };
    const second = resolveRadar(first, changed, config);
    expect(second).not.toBe(first);
    expect(second.map.engineering_mode).toBe(eng);
  });

  it("recomputes when the device registry object or the config is replaced", () => {
    const hass = hassWith([eng]);
    const first = resolveRadar(undefined, hass, config);
    expect(
      resolveRadar(first, { ...hass, devices: { ...hass.devices } }, config)
    ).not.toBe(first);
    expect(resolveRadar(first, hass, { ...config })).not.toBe(first);
  });

  it("resolves the map, profile, and flat id list", () => {
    const hass = hassWith([eng, thr]);
    const r = resolveRadar(undefined, hass, config);
    expect(r.map.engineering_mode).toBe(eng);
    expect(r.profile?.key).toBe("ld2410");
    expect(r.ids).toContain(eng);
    expect(r.ids).toContain(thr);
  });
});

describe("resolvedStatesChanged", () => {
  const oldHass = hassWith([eng, thr]);

  it("is false when no tracked state object was replaced", () => {
    // hass replaced, but the tracked state objects are the same references.
    const newHass: HomeAssistant = { ...oldHass, states: { ...oldHass.states } };
    expect(resolvedStatesChanged(oldHass, newHass, [eng, thr])).toBe(false);
  });

  it("is true when a tracked entity's state object changed", () => {
    const newHass: HomeAssistant = {
      ...oldHass,
      states: {
        ...oldHass.states,
        [eng]: { entity_id: eng, state: "on", attributes: {} },
      },
    };
    expect(resolvedStatesChanged(oldHass, newHass, [eng, thr])).toBe(true);
  });

  it("ignores changes to entities outside the resolved set", () => {
    const other = "sensor.kitchen_temperature";
    const newHass: HomeAssistant = {
      ...oldHass,
      states: {
        ...oldHass.states,
        [other]: { entity_id: other, state: "21", attributes: {} },
      },
    };
    expect(resolvedStatesChanged(oldHass, newHass, [eng, thr])).toBe(false);
  });
});

describe("anyResolved", () => {
  const hass = hassWith([eng]);

  it("is true when at least one resolved id exists in states", () => {
    expect(anyResolved(hass, [eng, "number.gone_g0_move_threshold"])).toBe(true);
  });

  it("is false when nothing resolves (device removed/renamed)", () => {
    expect(anyResolved(hass, ["switch.gone_radar_engineering_mode"])).toBe(false);
    expect(anyResolved(hass, [])).toBe(false);
  });
});
