import type { EntityMap, HomeAssistant } from "../types";
import { exists } from "../entities";

export interface Row {
  entity: string;
  name: string;
}

function row(entity: string | undefined, name: string): Row[] {
  return entity ? [{ entity, name }] : [];
}

export function controlRows(m: EntityMap): Row[] {
  return [
    ...row(m.engineering_mode, "Radar Engineering Mode"),
    ...row(m.bluetooth, "Bluetooth"),
    ...row(m.restart_radar, "Restart Radar"),
    ...row(m.factory_reset_radar, "Factory Reset Radar"),
    ...row(m.esp_reboot, "ESP Reboot"),
  ];
}

/** Detection range / timeout / gate-size — kept separate from the threshold sliders. */
export function rangeRows(
  m: EntityMap,
  rangeLabels: [string, string],
  gateSizeLabel: string
): Row[] {
  return [
    ...row(m.radar_timeout, "Radar Timeout"),
    ...row(m.gate_size, gateSizeLabel),
    ...row(m.max_move_distance, rangeLabels[0]),
    ...row(m.max_still_distance, rangeLabels[1]),
  ];
}

export function zoneConfigRows(m: EntityMap): Row[] {
  return [
    ...row(m.zone_1_start, "Start Zone 1"),
    ...row(m.end_zone_1, "End Zone 1"),
    ...row(m.end_zone_2, "End Zone 2"),
    ...row(m.end_zone_3, "End Zone 3"),
  ];
}

/** Per-gate move thresholds, labelled just by gate (the card title says "Move"). */
export function moveThresholdRows(m: EntityMap): Row[] {
  const rows: Row[] = [];
  for (let n = 0; n < m.move_threshold.length; n++) {
    rows.push(...row(m.move_threshold[n], `G${n}`));
  }
  return rows;
}

/** Per-gate still thresholds. */
export function stillThresholdRows(m: EntityMap): Row[] {
  const rows: Row[] = [];
  for (let n = 0; n < m.still_threshold.length; n++) {
    rows.push(...row(m.still_threshold[n], `G${n}`));
  }
  return rows;
}

export function occupancyRows(m: EntityMap): Row[] {
  return [
    ...row(m.radar_target, "Radar Target"),
    ...row(m.moving_target, "Radar Moving Target"),
    ...row(m.still_target, "Radar Still Target"),
    ...row(m.zone_1_occupancy, "Radar Zone 1 Occupancy"),
    ...row(m.zone_2_occupancy, "Radar Zone 2 Occupancy"),
    ...row(m.zone_3_occupancy, "Radar Zone 3 Occupancy"),
  ];
}

export function presentRows(hass: HomeAssistant, rows: Row[]): Row[] {
  return rows.filter((r) => exists(hass, r.entity));
}
