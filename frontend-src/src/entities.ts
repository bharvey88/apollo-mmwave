import type { EntityMap, HomeAssistant, Ld2410CardConfig } from "./types";
import {
  LD2410_PROFILE,
  LD2412_PROFILE,
  apolloModelInfo,
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

// ---------------------------------------------------------------------------
// Suffix classification — mapping a device's ACTUAL entity ids into EntityMap
// slots. Unlike constructing ids from a base name, this survives HA's `_2`
// entity-id dedup and user-renamed prefixes: only the trailing suffix matters.
// ---------------------------------------------------------------------------

type GateSlot = "move_threshold" | "still_threshold" | "move_energy" | "still_energy";
type ScalarSlot = Exclude<keyof EntityMap, GateSlot>;

export type ClassifiedSlot =
  | { slot: ScalarSlot }
  | { slot: GateSlot; gate: number };

/** HA appends `_2`, `_3`, ... to deduplicate colliding entity ids. Every
 *  pattern below ends with this so `_g3_move_threshold_2` still classifies —
 *  the gate digit is captured *before* the suffix, so it can't be misread. */
const DEDUP = "(?:_\\d+)?$";

interface ScalarPattern {
  slot: ScalarSlot;
  domain: string;
  re: RegExp;
}

const S = (slot: ScalarSlot, domain: string, suffix: string): ScalarPattern => ({
  slot,
  domain,
  re: new RegExp(suffix + DEDUP),
});

const SCALAR_PATTERNS: ScalarPattern[] = [
  // LD2410 (MSR) naming.
  S("engineering_mode", "switch", "_radar_engineering_mode"),
  S("bluetooth", "switch", "_ld2410_bluetooth"),
  S("restart_radar", "button", "_restart_radar"),
  S("factory_reset_radar", "button", "_factory_reset_radar"),
  S("esp_reboot", "button", "_esp_reboot"),
  S("radar_timeout", "number", "_radar_timeout"),
  S("zone_1_start", "number", "_radar_zone_1_start"),
  S("end_zone_1", "number", "_radar_end_zone_1"),
  S("end_zone_2", "number", "_radar_end_zone_2"),
  S("end_zone_3", "number", "_radar_end_zone_3"),
  S("max_move_distance", "number", "_radar_max_move_distance"),
  S("max_still_distance", "number", "_radar_max_still_distance"),
  S("gate_size", "select", "_ld2410_gate_size"),
  S("still_distance", "sensor", "_radar_still_distance"),
  S("moving_distance", "sensor", "_radar_moving_distance"),
  S("detection_distance", "sensor", "_radar_detection_distance"),
  S("moving_target", "binary_sensor", "_radar_moving_target"),
  S("still_target", "binary_sensor", "_radar_still_target"),
  S("radar_target", "binary_sensor", "_radar_target"),
  S("zone_1_occupancy", "binary_sensor", "_radar_zone_1_occupancy"),
  S("zone_2_occupancy", "binary_sensor", "_radar_zone_2_occupancy"),
  S("zone_3_occupancy", "binary_sensor", "_radar_zone_3_occupancy"),
  // LD2412 (R-PRO) naming.
  S("engineering_mode", "switch", "_ld2412_engineering_mode"),
  S("bluetooth", "switch", "_ld2412_bluetooth"),
  S("restart_radar", "button", "_ld2412_restart"),
  S("factory_reset_radar", "button", "_ld2412_factory_reset"),
  S("radar_timeout", "number", "_ld2412_timeout"),
  S("max_move_distance", "number", "_ld2412_max_distance_gate"),
  S("max_still_distance", "number", "_ld2412_min_distance_gate"),
  S("gate_size", "select", "_ld2412_distance_resolution"),
  S("radar_target", "binary_sensor", "_ld2412_presence"),
  S("moving_target", "binary_sensor", "_ld2412_moving_target"),
  S("still_target", "binary_sensor", "_ld2412_still_target"),
];

// Gate slots share their suffix with the slot name (`_g3_move_threshold`,
// `_ld2412_g05_still_energy`) — one pattern per slot covers both chips.
const GATE_PATTERNS: { slot: GateSlot; domain: string; re: RegExp }[] = (
  [
    ["move_threshold", "number"],
    ["still_threshold", "number"],
    ["move_energy", "sensor"],
    ["still_energy", "sensor"],
  ] as [GateSlot, string][]
).map(([slot, domain]) => ({
  slot,
  domain,
  re: new RegExp(`_g(\\d+)_${slot}${DEDUP}`),
}));

/** Classify one entity's object_id into an EntityMap slot. The entity's
 *  domain (the part before the ".") must match the slot's expected domain —
 *  a coincidentally-named entity in another domain is rejected. */
export function classifyObjectId(
  domain: string,
  objectId: string
): ClassifiedSlot | undefined {
  for (const p of GATE_PATTERNS) {
    const m = p.re.exec(objectId);
    if (m) return domain === p.domain ? { slot: p.slot, gate: parseInt(m[1], 10) } : undefined;
  }
  for (const p of SCALAR_PATTERNS) {
    if (p.re.test(objectId)) {
      return domain === p.domain ? { slot: p.slot } : undefined;
    }
  }
  return undefined;
}

/** Object-id markers that pin the gate-radar chip family. `_ld2412_` wins over
 *  the LD2410 markers because ld2412 gate names also match the generic `_g\d+_`
 *  patterns. Only *concrete* matches count — shared suffixes like `_esp_reboot`
 *  say nothing about the chip. */
const LD2410_MARKERS: RegExp[] = [
  /_ld2410_/,
  new RegExp(`_radar_engineering_mode${DEDUP}`),
  new RegExp(`_g\\d+_(?:move|still)_(?:threshold|energy)${DEDUP}`),
  new RegExp(`_radar_max_(?:move|still)_distance${DEDUP}`),
];

/** Detect the gate-radar chip from a device's actual entities. Undefined when
 *  the entities are inconclusive (zone-only MTR-1, or nothing registered yet). */
export function detectProfileFromEntities(
  hass: HomeAssistant,
  deviceId: string
): RadarProfile | undefined {
  let sawLd2410 = false;
  for (const [id, e] of Object.entries(hass.entities)) {
    if (e.device_id !== deviceId) continue;
    const oid = id.slice(id.indexOf(".") + 1);
    if (/_ld2412_/.test(oid)) return LD2412_PROFILE;
    if (!sawLd2410) sawLd2410 = LD2410_MARKERS.some((re) => re.test(oid));
  }
  return sawLd2410 ? LD2410_PROFILE : undefined;
}

/** Build the EntityMap from the device's registered entities. Returns
 *  undefined when nothing classifies (not a radar, or entities not loaded
 *  yet) so callers can fall back to base-name construction. First match wins
 *  per slot. Gate arrays may be sparse if some gates are disabled. */
export function entityMapFromDevice(
  hass: HomeAssistant,
  deviceId: string
): EntityMap | undefined {
  const map = emptyMap();
  let matched = false;
  for (const [id, e] of Object.entries(hass.entities)) {
    if (e.device_id !== deviceId) continue;
    const dot = id.indexOf(".");
    const c = classifyObjectId(id.slice(0, dot), id.slice(dot + 1));
    if (!c) continue;
    if ("gate" in c) {
      const arr = map[c.slot];
      if (arr[c.gate] === undefined) {
        arr[c.gate] = id;
        matched = true;
      }
    } else if (map[c.slot] === undefined) {
      map[c.slot] = id;
      matched = true;
    }
  }
  return matched ? map : undefined;
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

/** Detect the radar profile for a configured device. Entities win when they
 *  give a concrete answer (a reflashed/DIY device may not match its registry
 *  model), then the registry model, then base-name probing (default LD2410). */
export function resolveProfile(
  hass: HomeAssistant,
  config: Ld2410CardConfig
): RadarProfile | undefined {
  if (config.device_id) {
    const fromEntities = detectProfileFromEntities(hass, config.device_id);
    if (fromEntities) return fromEntities;
    const reg = apolloModelInfo(hass.devices[config.device_id]);
    // A registry match is authoritative even when profile-less (MTR-1): don't
    // fall through to the LD2410 default for a device with no gate radar.
    if (reg) return reg.profile;
  }
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
  // Preferred: the device's actual entities (rename/dedup-proof).
  let resolved: EntityMap | undefined;
  if (config.device_id) resolved = entityMapFromDevice(hass, config.device_id);
  // Fallback: construct ids from the base name (device_base_name configs,
  // or a device whose entities haven't registered yet).
  if (!resolved) {
    const base = resolveBase(hass, config);
    const profile = base ? detectProfile(hass, base) ?? LD2410_PROFILE : undefined;
    resolved = base && profile ? profile.entityMap(base) : emptyMap();
  }
  if (config.entities) {
    return { ...resolved, ...config.entities } as EntityMap;
  }
  return resolved;
}

export function exists(hass: HomeAssistant, id?: string): boolean {
  return !!id && id in hass.states;
}
