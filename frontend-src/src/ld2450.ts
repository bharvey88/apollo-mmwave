import type { HomeAssistant } from "./types";

/**
 * LD2450 tracking radar support (X/Y target coordinates), used by R-PRO-1 and
 * MTR-1. This is deliberately separate from the gate-radar *tuning* profiles
 * (LD2410/LD2412): the LD2450 reports moving-target positions, which the
 * vendored `zone-mapper-card` draws occupancy zones over — it is not tuned with
 * per-gate thresholds, so it has no tuning profile.
 *
 * Entity naming is derived from R-PRO-1 firmware
 * (`Integrations/ESPHome/Core.yaml`): the three targets expose
 * `sensor.<base>_ld2450_target_<n>_x` / `_y`.
 */

export interface Ld2450TargetPair {
  x: string;
  y: string;
}

/** The three LD2450 target X/Y coordinate-sensor pairs for a device base. */
export function ld2450TargetPairs(base: string): Ld2450TargetPair[] {
  return [1, 2, 3].map((n) => ({
    x: `sensor.${base}_ld2450_target_${n}_x`,
    y: `sensor.${base}_ld2450_target_${n}_y`,
  }));
}

// Suffix-matched against actual entity ids so renamed prefixes and HA's `_2`
// dedup suffix don't break detection. The target number sits before the dedup
// digits, so it can't be misread.
const TARGET_X = /_ld2450_target_(\d+)_x(?:_\d+)?$/;
const TARGET_Y = /_ld2450_target_(\d+)_y(?:_\d+)?$/;

/** Resolve target X/Y pairs from the device's ACTUAL entities: each `_x`
 *  sensor is paired with the `_y` sensor carrying the same target number.
 *  Empty when the device has no LD2450 (or its entities aren't loaded). */
export function ld2450PairsFromDevice(
  hass: HomeAssistant,
  deviceId: string
): Ld2450TargetPair[] {
  const xs = new Map<number, string>();
  const ys = new Map<number, string>();
  for (const [id, e] of Object.entries(hass.entities)) {
    if (e.device_id !== deviceId || !id.startsWith("sensor.")) continue;
    const oid = id.slice(id.indexOf(".") + 1);
    const mx = TARGET_X.exec(oid);
    if (mx) {
      const n = parseInt(mx[1], 10);
      if (!xs.has(n)) xs.set(n, id);
      continue;
    }
    const my = TARGET_Y.exec(oid);
    if (my) {
      const n = parseInt(my[1], 10);
      if (!ys.has(n)) ys.set(n, id);
    }
  }
  const pairs: Ld2450TargetPair[] = [];
  for (const n of [...xs.keys()].sort((a, b) => a - b)) {
    const y = ys.get(n);
    if (y) pairs.push({ x: xs.get(n)!, y });
  }
  return pairs;
}

/** True when the device's registered entities include LD2450 target sensors.
 *  Only the X sensor is required — Y may be individually disabled. */
export function hasLd2450Device(hass: HomeAssistant, deviceId: string): boolean {
  for (const [id, e] of Object.entries(hass.entities)) {
    if (e.device_id !== deviceId || !id.startsWith("sensor.")) continue;
    if (TARGET_X.test(id.slice(id.indexOf(".") + 1))) return true;
  }
  return false;
}

/** Base-name fallback: true when constructed target ids exist in states. */
export function hasLd2450(hass: HomeAssistant, base: string): boolean {
  return ld2450TargetPairs(base).some((p) => p.x in hass.states);
}

/**
 * A `zone-mapper-card` config for this device's LD2450.
 *
 * The card persists its tracked X/Y entity pairs in the integration backend
 * (picked once via the card's own device/entity pickers), so the config only
 * needs the `location` key plus sensible display defaults.
 *
 * `location` is the device's *display name* (base name only as a fallback): the
 * card shows it as a label and the backend builds zone entity names from it.
 * Known limitation: renaming the device changes the key, orphaning previously
 * drawn zones — fixing that properly means keying zones by device id in the
 * backend store (planned rework), not a frontend-only change.
 */
export function zoneMapperCard(
  base: string,
  location: string
): Record<string, any> {
  return {
    type: "custom:zone-mapper-card",
    location: location || base,
    unit_display: true,
  };
}
