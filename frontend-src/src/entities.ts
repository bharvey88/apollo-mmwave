import type { EntityMap, HomeAssistant, Ld2410CardConfig } from "./types";
import {
  LD2410_PROFILE,
  detectProfile,
  type RadarProfile,
} from "./profiles";

/** Known radar entity-name suffixes (everything after the device base name).
 *  Stripping one of these from an entity's object_id yields the base name. */
const KNOWN_SUFFIXES: RegExp[] = [
  // LD2412 — every entity is `{base}_ld2412_...`, so one pattern covers all.
  /_ld2412_.+$/,
  // LD2450 tracking radar — every entity is `{base}_ld2450_...`. Needed so
  // zone-only devices (e.g. MTR-1, no gate radar) still resolve to a base name.
  /_ld2450_.+$/,
  // LD2410 (MSR) — varied prefixes.
  /_radar_engineering_mode$/,
  /_ld2410_bluetooth$/,
  /_restart_radar$/,
  /_factory_reset_radar$/,
  /_esp_reboot$/,
  /_radar_timeout$/,
  /_radar_zone_\d+_start$/,
  /_radar_end_zone_\d+$/,
  /_radar_max_move_distance$/,
  /_radar_max_still_distance$/,
  /_ld2410_gate_size$/,
  /_g\d+_move_threshold$/,
  /_g\d+_still_threshold$/,
  /_g\d+_move_energy$/,
  /_g\d+_still_energy$/,
  /_radar_still_distance$/,
  /_radar_moving_distance$/,
  /_radar_detection_distance$/,
  /_radar_moving_target$/,
  /_radar_still_target$/,
  /_radar_target$/,
  /_radar_zone_\d+_occupancy$/,
];

function baseFromObjectId(objectId: string): string | undefined {
  for (const re of KNOWN_SUFFIXES) {
    if (re.test(objectId)) return objectId.replace(re, "");
  }
  return undefined;
}

export function baseNameFromDevice(
  hass: HomeAssistant,
  deviceId: string
): string | undefined {
  const objectIds = Object.entries(hass.entities)
    .filter(([, e]) => e.device_id === deviceId)
    .map(([id]) => id.slice(id.indexOf(".") + 1));

  const counts = new Map<string, number>();
  for (const oid of objectIds) {
    const base = baseFromObjectId(oid);
    if (base) counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [base, count] of counts) {
    if (count > bestCount) {
      best = base;
      bestCount = count;
    }
  }
  return best;
}

/** LD2410 entity map for a base name — kept as a named export for tests. */
export function entityMapFromBaseName(base: string): EntityMap {
  return LD2410_PROFILE.entityMap(base);
}

function resolveBase(
  hass: HomeAssistant,
  config: Ld2410CardConfig
): string | undefined {
  let base: string | undefined;
  if (config.device_id) base = baseNameFromDevice(hass, config.device_id);
  if (!base && config.device_base_name) base = config.device_base_name;
  return base;
}

/** Detect the radar profile for a configured device (defaults to LD2410). */
export function resolveProfile(
  hass: HomeAssistant,
  config: Ld2410CardConfig
): RadarProfile | undefined {
  const base = resolveBase(hass, config);
  if (!base) return undefined;
  return detectProfile(hass, base) ?? LD2410_PROFILE;
}

function emptyMap(): EntityMap {
  return {
    move_threshold: [],
    still_threshold: [],
    move_energy: [],
    still_energy: [],
  };
}

export function resolveEntities(
  hass: HomeAssistant,
  config: Ld2410CardConfig
): EntityMap {
  const base = resolveBase(hass, config);
  const profile = base ? detectProfile(hass, base) ?? LD2410_PROFILE : undefined;
  const resolved = base && profile ? profile.entityMap(base) : emptyMap();
  if (config.entities) {
    return { ...resolved, ...config.entities } as EntityMap;
  }
  return resolved;
}

export function exists(hass: HomeAssistant, id?: string): boolean {
  return !!id && id in hass.states;
}
