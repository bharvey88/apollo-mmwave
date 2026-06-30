import type { EntityMap } from "../types";

export interface HistoryRow {
  entity: string;
  name: string;
}

/** Occupancy history rows with short, readable names (the device prefix would
 *  otherwise repeat and truncate to the same thing on every row). */
export function historyEntities(m: EntityMap): HistoryRow[] {
  const rows: HistoryRow[] = [];
  const push = (entity: string | undefined, name: string) => {
    if (entity) rows.push({ entity, name });
  };
  push(m.radar_target, "Detected");
  push(m.zone_1_occupancy, "Zone 1");
  push(m.zone_2_occupancy, "Zone 2");
  push(m.zone_3_occupancy, "Zone 3");
  return rows;
}
