import type { EntityMap, HomeAssistant } from "./types";

/** Describes one radar chip family and how its entities are named. */
export interface RadarProfile {
  key: "ld2410" | "ld2412";
  /** Shown in card titles, e.g. "LD2410" / "LD2412". */
  label: string;
  /** Labels for the two range bars on the distance chart. */
  maxBarLabels: [string, string];
  /** Labels for the max/min range rows on the Detection Range card. */
  rangeLabels: [string, string];
  /** Label for the gate-size / distance-resolution select control. */
  gateSizeLabel: string;
  /** One-line helper note shown under the Detection Range card. */
  rangeTip: string;
  /** One-line helper note shown under the Gate Config card. */
  gateTip: string;
  /** Apollo wiki page for tuning this radar. */
  wikiUrl: string;
  /** Build the entity map for a device base name. */
  entityMap(base: string): EntityMap;
}

function emptyZones(): Pick<
  EntityMap,
  | "zone_1_start"
  | "end_zone_1"
  | "end_zone_2"
  | "end_zone_3"
  | "zone_1_occupancy"
  | "zone_2_occupancy"
  | "zone_3_occupancy"
> {
  return {
    zone_1_start: undefined,
    end_zone_1: undefined,
    end_zone_2: undefined,
    end_zone_3: undefined,
    zone_1_occupancy: undefined,
    zone_2_occupancy: undefined,
    zone_3_occupancy: undefined,
  };
}

/** MSR-1 / MSR-2 — LD2410, 9 gates (g0..g8), `radar_`/bare-`g` naming, with
 *  configurable distance zones. */
export const LD2410_PROFILE: RadarProfile = {
  key: "ld2410",
  label: "LD2410",
  maxBarLabels: ["Max Move", "Max Still"],
  rangeLabels: ["Max Move Gate", "Max Still Gate"],
  gateSizeLabel: "Gate Size",
  rangeTip:
    "💡 **Gate Size** sets how far each gate reaches (e.g. 0.75 m). **Max Move / Still Gate** cap the farthest gate used to detect moving vs. still targets — lower them to ignore distant motion.",
  gateTip:
    "💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values.",
  wikiUrl: "https://wiki.apolloautomation.com/products/msr2/setup/zones-ha/",
  entityMap(base: string): EntityMap {
    const gates = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const g = (suffix: (n: number) => string) => gates.map((n) => suffix(n));
    return {
      engineering_mode: `switch.${base}_radar_engineering_mode`,
      bluetooth: `switch.${base}_ld2410_bluetooth`,
      restart_radar: `button.${base}_restart_radar`,
      factory_reset_radar: `button.${base}_factory_reset_radar`,
      esp_reboot: `button.${base}_esp_reboot`,
      radar_timeout: `number.${base}_radar_timeout`,
      zone_1_start: `number.${base}_radar_zone_1_start`,
      end_zone_1: `number.${base}_radar_end_zone_1`,
      end_zone_2: `number.${base}_radar_end_zone_2`,
      end_zone_3: `number.${base}_radar_end_zone_3`,
      max_move_distance: `number.${base}_radar_max_move_distance`,
      max_still_distance: `number.${base}_radar_max_still_distance`,
      gate_size: `select.${base}_ld2410_gate_size`,
      move_threshold: g((n) => `number.${base}_g${n}_move_threshold`),
      still_threshold: g((n) => `number.${base}_g${n}_still_threshold`),
      move_energy: g((n) => `sensor.${base}_g${n}_move_energy`),
      still_energy: g((n) => `sensor.${base}_g${n}_still_energy`),
      still_distance: `sensor.${base}_radar_still_distance`,
      moving_distance: `sensor.${base}_radar_moving_distance`,
      detection_distance: `sensor.${base}_radar_detection_distance`,
      radar_target: `binary_sensor.${base}_radar_target`,
      moving_target: `binary_sensor.${base}_radar_moving_target`,
      still_target: `binary_sensor.${base}_radar_still_target`,
      zone_1_occupancy: `binary_sensor.${base}_radar_zone_1_occupancy`,
      zone_2_occupancy: `binary_sensor.${base}_radar_zone_2_occupancy`,
      zone_3_occupancy: `binary_sensor.${base}_radar_zone_3_occupancy`,
    };
  },
};

/** R-PRO-1 — LD2412, 14 gates (g00..g13), `ld2412_` naming, no distance zones
 *  (those come from the LD2450, which this dashboard does not cover). */
export const LD2412_PROFILE: RadarProfile = {
  key: "ld2412",
  label: "LD2412",
  maxBarLabels: ["Max Gate", "Min Gate"],
  rangeLabels: ["Max Gate", "Min Gate"],
  gateSizeLabel: "Distance Resolution",
  rangeTip:
    "💡 **Distance Resolution** sets gate spacing — smaller (0.5 m) gives finer tuning over a shorter range, larger (0.75 m) reaches farther. **Min / Max Gate** limit which gates are used for detection.",
  gateTip:
    "💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values.",
  wikiUrl:
    "https://wiki.apolloautomation.com/products/rpro1/setup/zones-ha/#ld2412-configuration",
  entityMap(base: string): EntityMap {
    const gates = Array.from({ length: 14 }, (_, i) => i);
    const pad = (n: number) => String(n).padStart(2, "0");
    const g = (suffix: (p: string) => string) => gates.map((n) => suffix(pad(n)));
    return {
      engineering_mode: `switch.${base}_ld2412_engineering_mode`,
      bluetooth: `switch.${base}_ld2412_bluetooth`,
      restart_radar: `button.${base}_ld2412_restart`,
      factory_reset_radar: `button.${base}_ld2412_factory_reset`,
      esp_reboot: `button.${base}_esp_reboot`,
      radar_timeout: `number.${base}_ld2412_timeout`,
      ...emptyZones(),
      max_move_distance: `number.${base}_ld2412_max_distance_gate`,
      max_still_distance: `number.${base}_ld2412_min_distance_gate`,
      gate_size: `select.${base}_ld2412_distance_resolution`,
      move_threshold: g((p) => `number.${base}_ld2412_g${p}_move_threshold`),
      still_threshold: g((p) => `number.${base}_ld2412_g${p}_still_threshold`),
      move_energy: g((p) => `sensor.${base}_ld2412_g${p}_move_energy`),
      still_energy: g((p) => `sensor.${base}_ld2412_g${p}_still_energy`),
      // LD2412 distance sensors don't report usable values, so no distance bars
      // are shown — the chart is the gate range + min/max gate only.
      still_distance: undefined,
      moving_distance: undefined,
      detection_distance: undefined,
      radar_target: `binary_sensor.${base}_ld2412_presence`,
      moving_target: `binary_sensor.${base}_ld2412_moving_target`,
      still_target: `binary_sensor.${base}_ld2412_still_target`,
    };
  },
};

// LD2412 is checked first (more specific naming) so it wins on an R-PRO-1.
export const PROFILES: RadarProfile[] = [LD2412_PROFILE, LD2410_PROFILE];

/** Pick the profile whose engineering-mode switch exists for this device. */
export function detectProfile(
  hass: HomeAssistant,
  base: string
): RadarProfile | undefined {
  for (const p of PROFILES) {
    const id = p.entityMap(base).engineering_mode;
    if (id && id in hass.states) return p;
  }
  return undefined;
}
