export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities: Record<string, { device_id?: string }>;
  devices: Record<string, { name?: string; name_by_user?: string }>;
}

export type PanelKey =
  | "controls"
  | "zone_config"
  | "gate_config"
  | "occupancy"
  | "distance_chart"
  | "gate_energy_chart"
  | "occupancy_history";

export const ALL_PANEL_KEYS: PanelKey[] = [
  "controls",
  "zone_config",
  "gate_config",
  "occupancy",
  "distance_chart",
  "gate_energy_chart",
  "occupancy_history",
];

/** Resolved entity ids. Arrays are indexed by gate 0..8. Any field may be
 *  an id that does not exist in hass.states; callers must existence-check. */
export interface EntityMap {
  // controls
  engineering_mode?: string;
  bluetooth?: string;
  restart_radar?: string;
  factory_reset_radar?: string;
  esp_reboot?: string;
  // zone config
  radar_timeout?: string;
  zone_1_start?: string;
  end_zone_1?: string;
  end_zone_2?: string;
  end_zone_3?: string;
  // gate config + charts
  max_move_distance?: string;
  max_still_distance?: string;
  gate_size?: string;
  move_threshold: string[];
  still_threshold: string[];
  move_energy: string[];
  still_energy: string[];
  // distances
  still_distance?: string;
  moving_distance?: string;
  detection_distance?: string;
  // occupancy
  radar_target?: string;
  moving_target?: string;
  still_target?: string;
  zone_1_occupancy?: string;
  zone_2_occupancy?: string;
  zone_3_occupancy?: string;
}

export interface Ld2410CardConfig {
  type: string;
  device_id?: string;
  device_base_name?: string;
  entities?: Partial<EntityMap>;
  panels?: Partial<Record<PanelKey, boolean>>;
  title?: string;
  distance_unit?: "mm" | "cm" | "m" | "in" | "ft" | "yd";
}
