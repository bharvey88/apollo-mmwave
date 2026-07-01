import type { EntityMap, HomeAssistant, Ld2410CardConfig } from "../types";
import { resolveEntities, resolveProfile } from "../entities";
import type { RadarProfile } from "../profiles";

/**
 * Memoized entity/profile resolution for the custom cards.
 *
 * Resolution scans every registry entry against ~25 suffix regexes — far too
 * heavy to redo on every hass tick (HA replaces `hass` on each state change).
 * The result only depends on the config object and the entity/device
 * registries, all of which HA replaces (never mutates) on change, so
 * reference equality on those three inputs is a sound cache key.
 */
export interface ResolvedRadar {
  config: Ld2410CardConfig;
  entities: HomeAssistant["entities"];
  devices: HomeAssistant["devices"];
  map: EntityMap;
  profile?: RadarProfile;
  /** Flat list of the map's entity ids, for cheap changed-state checks. */
  ids: string[];
}

/** Every entity id in the map (gate arrays flattened, holes skipped). */
export function entityIds(m: EntityMap): string[] {
  const out: string[] = [];
  for (const v of Object.values(m)) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const id of v) if (id) out.push(id);
  }
  return out;
}

/** Return `cache` untouched while its inputs are reference-equal, else resolve. */
export function resolveRadar(
  cache: ResolvedRadar | undefined,
  hass: HomeAssistant,
  config: Ld2410CardConfig
): ResolvedRadar {
  if (
    cache &&
    cache.config === config &&
    cache.entities === hass.entities &&
    cache.devices === hass.devices
  ) {
    return cache;
  }
  const map = resolveEntities(hass, config);
  return {
    config,
    entities: hass.entities,
    devices: hass.devices,
    map,
    profile: resolveProfile(hass, config),
    ids: entityIds(map),
  };
}

/** True when any of the resolved entities' state objects changed between hass
 *  ticks. HA replaces the state object of exactly the entities that changed,
 *  so reference comparison is both correct and cheap. */
export function resolvedStatesChanged(
  oldHass: HomeAssistant,
  newHass: HomeAssistant,
  ids: string[]
): boolean {
  return ids.some((id) => oldHass.states[id] !== newHass.states[id]);
}

/** True when any resolved entity id exists in states — a configured card whose
 *  device was removed/renamed resolves nothing and should say so, not blank. */
export function anyResolved(hass: HomeAssistant, ids: string[]): boolean {
  return ids.some((id) => id in hass.states);
}
