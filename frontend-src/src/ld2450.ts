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

/** True when the device exposes LD2450 target-position sensors. */
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
