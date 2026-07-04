import type { HomeAssistant } from "./types";
import {
  baseNameFromDevice,
  detectProfileFromEntities,
  entityMapFromDevice,
} from "./entities";
import { ld2450EntityIds } from "./ld2450";
import { apolloModelInfo, type RadarProfile } from "./profiles";
import { hasLd2450, hasLd2450Device, zoneMapperCard } from "./ld2450";
import {
  controlRows,
  zoneConfigRows,
  moveThresholdRows,
  stillThresholdRows,
  occupancyRows,
  rangeRows,
  presentRows,
  type Row,
} from "./panels/entity-rows";
import { historyEntities } from "./panels/history";

export interface RadarDevice {
  deviceId: string;
  base: string;
  name: string;
  /** Gate-radar tuning profile (LD2410/LD2412). Undefined for zone-only
   *  devices such as the MTR-1, which has an LD2450 but no tunable gate radar. */
  profile?: RadarProfile;
  /** Whether the device exposes an LD2450 tracking radar (X/Y zones). */
  ld2450: boolean;
}

export interface StrategyConfig {
  device_id?: string;
  distance_unit?: string;
}

function isLive(hass: HomeAssistant, entityId: string | undefined): boolean {
  if (!entityId) return false;
  const state = hass.states[entityId];
  return state !== undefined && state.state !== "unavailable";
}

/**
 * A device earns a tab only with LIVE radar evidence.
 *
 * The device registry keeps entries for hardware that was reflashed or
 * re-added under a new name; those ghosts still carry an Apollo
 * manufacturer/model and stale registered entities (every state missing or
 * "unavailable" forever), so registry + registered-entity checks alone put
 * dead devices on the dashboard. Require at least one recognized radar entity
 * with a real state — or, for a registry-matched device whose entities were
 * renamed beyond recognition, any live entity at all.
 */
function hasLiveRadarEvidence(
  hass: HomeAssistant,
  deviceId: string,
  registryMatched: boolean
): boolean {
  const m = entityMapFromDevice(hass, deviceId);
  const radarIds: (string | undefined)[] = [];
  if (m) {
    radarIds.push(
      m.engineering_mode,
      m.radar_timeout,
      m.max_move_distance,
      m.max_still_distance,
      m.radar_target,
      m.moving_target,
      m.still_target,
      m.detection_distance,
      ...m.move_threshold,
      ...m.still_threshold,
      ...m.move_energy,
      ...m.still_energy
    );
  }
  radarIds.push(...ld2450EntityIds(hass, deviceId));
  if (radarIds.some((id) => isLive(hass, id))) return true;
  if (radarIds.some((id) => id !== undefined)) return false;

  // No recognizable radar entities: only a registry match keeps the device
  // (renamed-beyond-recognition case), and only while something is alive.
  return (
    registryMatched &&
    Object.entries(hass.entities).some(
      ([id, e]) => e.device_id === deviceId && isLive(hass, id)
    )
  );
}

function deviceFromId(
  hass: HomeAssistant,
  deviceId: string
): RadarDevice | undefined {
  const d = hass.devices[deviceId];
  // Registry-first: manufacturer/model survive entity renames and `_2` dedup.
  const reg = apolloModelInfo(d);
  const base = baseNameFromDevice(hass, deviceId);
  if (!reg && !base) return undefined;

  // Ghost/offline filter — also covers the freshly-added-device race (its
  // entities/states aren't in yet): the later entities-registry update still
  // counts as a device-set change and triggers a regeneration.
  if (!hasLiveRadarEvidence(hass, deviceId, !!reg)) return undefined;

  // Entities win over the registry model when they give a concrete chip match
  // (DIY/reflashed hardware); the registry decides when probing is blind
  // (e.g. every chip-specific entity disabled or renamed beyond recognition).
  const profile = detectProfileFromEntities(hass, deviceId) ?? reg?.profile;
  const ld2450 =
    hasLd2450Device(hass, deviceId) ||
    (base ? hasLd2450(hass, base) : false) ||
    (reg?.ld2450 ?? false);
  // Include the device if it has either a tunable gate radar or an LD2450.
  if (!profile && !ld2450) return undefined;
  return {
    deviceId,
    // The base doubles as the view path, so a registry-matched device whose
    // entity names yield no base still needs a stable unique key.
    base: base ?? deviceId,
    name: d?.name_by_user || d?.name || base || deviceId,
    profile,
    ld2450,
  };
}

/** Every Apollo mmWave device — a gate radar (LD2410/LD2412), an LD2450, or both. */
export function detectRadarDevices(hass: HomeAssistant): RadarDevice[] {
  const out: RadarDevice[] = [];
  for (const deviceId of Object.keys(hass.devices)) {
    const dev = deviceFromId(hass, deviceId);
    if (dev) out.push(dev);
  }
  return out;
}

function targetDevices(
  hass: HomeAssistant,
  config: StrategyConfig
): RadarDevice[] {
  if (config.device_id) {
    const d = deviceFromId(hass, config.device_id);
    return d ? [d] : [];
  }
  return detectRadarDevices(hass);
}

function entitiesCard(title: string, rows: Row[]): Record<string, any> | undefined {
  if (rows.length === 0) return undefined;
  return {
    type: "entities",
    title,
    show_header_toggle: false,
    entities: rows.map((r) => ({ entity: r.entity, name: r.name })),
  };
}

function helpCard(dev: RadarDevice): Record<string, any> {
  if (!dev.profile) {
    return {
      type: "markdown",
      content:
        `**${dev.name}** — Apollo mmWave (LD2450 tracking radar).\n\n` +
        `Draw occupancy zones over the live target positions below.`,
    };
  }
  return {
    type: "markdown",
    content:
      `**${dev.name}** — Apollo ${dev.profile.label} radar.\n\n` +
      `New to tuning? [How to configure this sensor →](${dev.profile.wikiUrl})`,
  };
}

function noteCard(text: string): Record<string, any> {
  return { type: "markdown", content: text };
}

interface DeviceCards {
  help: Record<string, any>;
  controls?: Record<string, any>;
  range?: Record<string, any>;
  rangeNote?: Record<string, any>;
  zone?: Record<string, any>;
  distance?: Record<string, any>;
  gateEnergy?: Record<string, any>;
  moveThr?: Record<string, any>;
  stillThr?: Record<string, any>;
  gateNote?: Record<string, any>;
  occupancy?: Record<string, any>;
  history?: Record<string, any>;
  // LD2450 zone-mapping (R-PRO-1 / MTR-1).
  zoneHeader?: Record<string, any>;
  zoneMap?: Record<string, any>;
}

function cardMap(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string
): DeviceCards {
  const cards: DeviceCards = { help: helpCard(dev) };

  // Gate-radar tuning cards (LD2410 / LD2412), only when the device has a
  // tunable gate radar.
  if (dev.profile) {
    const profile = dev.profile;
    // Prefer the device's actual entity ids (rename/dedup-proof); constructed
    // ids are only right when nothing was renamed.
    const m = entityMapFromDevice(hass, dev.deviceId) ?? profile.entityMap(dev.base);
    const label = profile.label;
    const historyRows = historyEntities(m).filter((r) => r.entity in hass.states);
    const range = entitiesCard(
      `${label} Detection Range`,
      presentRows(hass, rangeRows(m, profile.rangeLabels, profile.gateSizeLabel))
    );
    const moveThr = entitiesCard(
      `${label} Move Thresholds`,
      presentRows(hass, moveThresholdRows(m))
    );
    const stillThr = entitiesCard(
      `${label} Still Thresholds`,
      presentRows(hass, stillThresholdRows(m))
    );
    cards.controls = entitiesCard(
      `${label} Controls`,
      presentRows(hass, controlRows(m))
    );
    cards.range = range;
    cards.rangeNote = range ? noteCard(profile.rangeTip) : undefined;
    cards.zone = entitiesCard(
      `${label} Zone Config`,
      presentRows(hass, zoneConfigRows(m))
    );
    // device_id is the durable reference; device_base_name is kept so configs
    // still resolve on older card bundles (and as the in-card fallback).
    cards.distance = {
      type: "custom:apollo-radar-distance-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: `${label} Distances`,
      ...(distanceUnit ? { distance_unit: distanceUnit } : {}),
    };
    cards.gateEnergy = {
      type: "custom:apollo-radar-gate-energy-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: `${label} Gate Energy`,
    };
    cards.moveThr = moveThr;
    cards.stillThr = stillThr;
    cards.gateNote = moveThr || stillThr ? noteCard(profile.gateTip) : undefined;
    cards.occupancy = entitiesCard(
      `${label} Target / Occupancy`,
      presentRows(hass, occupancyRows(m))
    );
    cards.history = historyRows.length
      ? {
          type: "history-graph",
          title: `${label} Occupancy History`,
          hours_to_show: 1,
          entities: historyRows,
        }
      : undefined;
  }

  // LD2450 zone map (R-PRO-1 / MTR-1). Only labelled when it shares a tab with
  // tuning cards (R-PRO-1) — a thin native section heading, so it's clear the
  // LD2450 is a separate radar. Zone-only devices (MTR-1) get no header: the
  // card is the whole tab.
  if (dev.ld2450) {
    cards.zoneHeader = dev.profile
      ? { type: "heading", heading: "Zone Map" }
      : undefined;
    cards.zoneMap = zoneMapperCard(dev.base, dev.name);
  }

  return cards;
}

/** Flat card list for a device (used by the view strategy / tests). */
export function buildDeviceCards(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string
): Record<string, any>[] {
  const c = cardMap(hass, dev, distanceUnit);
  return [
    c.help,
    c.controls,
    c.range,
    c.rangeNote,
    c.zone,
    c.distance,
    c.gateEnergy,
    c.moveThr,
    c.stillThr,
    c.gateNote,
    c.occupancy,
    c.history,
    c.zoneHeader,
    c.zoneMap,
  ].filter(Boolean) as Record<string, any>[];
}

/** Sections for one device, grouped into the reference column layout. The
 *  Detection Range card sits under the distance chart, a help/wiki card on top. */
export function buildDeviceSections(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string
): Record<string, any>[] {
  const c = cardMap(hass, dev, distanceUnit);
  const columns: (Record<string, any> | undefined)[][] = [];

  // Gate-radar tuning columns: controls | distance+config | gate-energy+move |
  // history+still. LD2412 has no Zone Config, so column 1 is short — put
  // occupancy there instead of column 2 to balance it.
  if (dev.profile) {
    const col1 = [c.help, c.controls, c.zone];
    const col2: (Record<string, any> | undefined)[] = [
      c.distance,
      c.range,
      c.rangeNote,
    ];
    (c.zone ? col2 : col1).push(c.occupancy);
    columns.push(
      col1,
      col2,
      [c.gateEnergy, c.moveThr, c.gateNote],
      [c.history, c.stillThr]
    );
  }

  // LD2450 zone map gets its own column. On a shared tab (R-PRO-1) a thin
  // heading precedes it; on a zone-only device (MTR-1) it's just the card —
  // the tab title already names the device.
  if (c.zoneMap) {
    columns.push([c.zoneHeader, c.zoneMap]);
  }

  return columns
    .map((col) => col.filter(Boolean) as Record<string, any>[])
    .filter((col) => col.length > 0)
    .map((cards) => ({ type: "grid", cards }));
}

/** One full view (a tab) for a single device. */
export function deviceView(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string
): Record<string, any> {
  return {
    title: dev.name,
    path: dev.base,
    type: "sections",
    sections: buildDeviceSections(hass, dev, distanceUnit),
  };
}

/** One view (tab) per detected device — the dashboard strategy output. */
export function generateViews(
  hass: HomeAssistant,
  config: StrategyConfig
): Record<string, any>[] {
  return targetDevices(hass, config).map((d) =>
    deviceView(hass, d, config.distance_unit)
  );
}

/** All device sections in a single view — used by the view strategy. */
export function generateSections(
  hass: HomeAssistant,
  config: StrategyConfig
): Record<string, any>[] {
  return targetDevices(hass, config).flatMap((d) =>
    buildDeviceSections(hass, d, config.distance_unit)
  );
}

/** Flat card list across the targeted devices — used by the section strategy,
 *  which must return exactly one grid section. */
export function generateCards(
  hass: HomeAssistant,
  config: StrategyConfig
): Record<string, any>[] {
  return targetDevices(hass, config).flatMap((d) =>
    buildDeviceCards(hass, d, config.distance_unit)
  );
}
