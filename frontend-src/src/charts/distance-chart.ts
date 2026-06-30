import { html, svg, nothing, type TemplateResult } from "lit";
import type { EntityMap, HomeAssistant } from "../types";
import { convert, type Uom } from "./unit-convert";
import { numState, uomOf } from "./entity-read";
import { parseGateSizeMeters, scaleX } from "./geometry";

const DEFAULT_GATE_SIZE_M = 0.75;
const GATE_COUNT = 8;

const STILL_COLOR = "#2e7d32";
const MOVE_COLOR = "#6a1b9a";
const DETECTION_COLOR = "#b71c1c";
const ZONE_COLORS = ["#d32f2f", "#1565c0", "#2e7d32"];
/** Blue -> red rainbow for gate `i` of `count` (works for any gate count). */
function gateColor(i: number, count: number): string {
  const hue = 220 - (220 * i) / Math.max(1, count - 1);
  return `hsl(${hue}, 64%, 48%)`;
}

const TXT = "var(--primary-text-color, #e6e6e6)";
const TXT2 = "var(--secondary-text-color, #9aa0a6)";

export interface DistanceBar {
  label: string;
  value: number;
  color: string;
}

export interface DistanceZone {
  label: string;
  start: number;
  end: number;
  color: string;
  occupied: boolean;
}

export interface DistanceModel {
  unit: Uom;
  gateSizeChart: number;
  gateCount: number;
  maxRange: number;
  bars: DistanceBar[];
  zones: DistanceZone[];
  maxStill?: number;
  maxMove?: number;
  maxStillGate?: number;
  maxMoveGate?: number;
}

/** Convert an entity's numeric value from its own UOM into the chart unit. */
function distInUnit(
  hass: HomeAssistant,
  id: string | undefined,
  unit: Uom
): number | undefined {
  const v = numState(hass, id);
  if (v === undefined) return undefined;
  return convert(v, uomOf(hass, id, unit), unit);
}

export function distanceModel(
  hass: HomeAssistant,
  m: EntityMap,
  unit: Uom
): DistanceModel {
  const gateSizeM =
    parseGateSizeMeters(m.gate_size ? hass.states[m.gate_size]?.state : undefined) ??
    DEFAULT_GATE_SIZE_M;
  const gateSizeChart = convert(gateSizeM, "m", unit);
  const gateCount =
    m.move_threshold.length > 1 ? m.move_threshold.length - 1 : GATE_COUNT;
  const maxRange = gateSizeChart * gateCount;

  const bars: DistanceBar[] = [];
  const pushBar = (id: string | undefined, label: string, color: string) => {
    // Keep the row whenever the entity exists; show 0 when there's no target
    // (the distance sensors read non-numeric / unavailable with no target).
    if (!id || !(id in hass.states)) return;
    bars.push({ label, value: distInUnit(hass, id, unit) ?? 0, color });
  };
  // Order matches the reference: Detection, Moving, Still.
  pushBar(m.detection_distance, "Detection", DETECTION_COLOR);
  pushBar(m.moving_distance, "Moving", MOVE_COLOR);
  pushBar(m.still_distance, "Still", STILL_COLOR);

  const zones: DistanceZone[] = [];
  const bounds = [
    distInUnit(hass, m.zone_1_start, unit),
    distInUnit(hass, m.end_zone_1, unit),
    distInUnit(hass, m.end_zone_2, unit),
    distInUnit(hass, m.end_zone_3, unit),
  ];
  const occ = [m.zone_1_occupancy, m.zone_2_occupancy, m.zone_3_occupancy];
  for (let i = 0; i < 3; i++) {
    const start = bounds[i];
    const end = bounds[i + 1];
    if (start === undefined || end === undefined) continue;
    const occId = occ[i];
    zones.push({
      label: `Zone ${i + 1}`,
      start,
      end,
      color: ZONE_COLORS[i],
      occupied: !!occId && hass.states[occId]?.state === "on",
    });
  }

  const maxStillGate = numState(hass, m.max_still_distance);
  const maxMoveGate = numState(hass, m.max_move_distance);

  return {
    unit,
    gateSizeChart,
    gateCount,
    maxRange,
    bars,
    zones,
    maxStill: maxStillGate === undefined ? undefined : maxStillGate * gateSizeChart,
    maxMove: maxMoveGate === undefined ? undefined : maxMoveGate * gateSizeChart,
    maxStillGate,
    maxMoveGate,
  };
}

// Coordinate space is kept close to the rendered card width so text doesn't
// shrink when the SVG is scaled to fit.
const WIDTH = 478;
const LBL = 64;
const RPAD = 12;
const INNER = WIDTH - LBL - RPAD;
const TOP = 6;
const ROW_H = 30;
const BAR_H = ROW_H - 8;
const AXIS_H = 36;
const MID = BAR_H / 2 + 4; // text baseline offset to vertically center in a bar

type Row =
  | { kind: "zones" }
  | { kind: "bar"; bar: DistanceBar }
  | { kind: "gates" }
  | { kind: "max"; label: string; value: number; gate?: number; color: string };

function rowLabel(r: Row): string {
  if (r.kind === "zones") return "Zones";
  if (r.kind === "gates") return "Gates";
  if (r.kind === "bar") return r.bar.label;
  return r.label;
}

/** Hover-tooltip text (rendered as an SVG <title>) explaining each row. */
function rowTip(r: Row): string {
  if (r.kind === "zones")
    return "Detection zones. The circle shows whether a target is currently in each zone (filled = present).";
  if (r.kind === "gates")
    return "The radar splits its range into gates — each colored segment is one distance bin (G1, G2, ...).";
  if (r.kind === "max")
    return `${r.label}: the configured detection-range limit, shown as a gate number.`;
  if (r.bar.label === "Detection")
    return "Current distance to the detected target.";
  if (r.bar.label === "Moving")
    return "Current distance to a moving target.";
  return "Current distance to a still (stationary) target.";
}

/** Value label that sits outside a short bar, or inside a long one. */
function valueLabel(xEnd: number, text: string, y: number) {
  const inside = xEnd > WIDTH * 0.62;
  return inside
    ? svg`<text x=${xEnd - 6} y=${y + MID} font-size="13" text-anchor="end" fill="#fff">${text}</text>`
    : svg`<text x=${xEnd + 6} y=${y + MID} font-size="13" fill=${TXT}>${text}</text>`;
}

export function renderDistanceChart(
  hass: HomeAssistant,
  m: EntityMap,
  unit: Uom,
  maxLabels: [string, string] = ["Max Move", "Max Still"]
): TemplateResult | typeof nothing {
  // Only bail when there's no device at all. A configured radar always has a
  // gate setup, so the chart renders (Gates row + axis) even if the optional
  // distance sensors are disabled — it just won't show those bars.
  if (m.move_threshold.length === 0) return nothing;
  const model = distanceModel(hass, m, unit);

  const x = (v: number) => LBL + scaleX(v, model.maxRange, INNER);
  const fmt = (v: number) => `${v.toFixed(1)} ${unit}`;

  const rows: Row[] = [];
  if (model.zones.length) rows.push({ kind: "zones" });
  for (const bar of model.bars) rows.push({ kind: "bar", bar });
  rows.push({ kind: "gates" });
  if (model.maxMove !== undefined)
    rows.push({ kind: "max", label: maxLabels[0], value: model.maxMove, gate: model.maxMoveGate, color: MOVE_COLOR });
  if (model.maxStill !== undefined)
    rows.push({ kind: "max", label: maxLabels[1], value: model.maxStill, gate: model.maxStillGate, color: STILL_COLOR });

  const plotBottom = TOP + rows.length * ROW_H;
  const height = plotBottom + AXIS_H;

  // Gate-boundary gridlines + rotated distance axis labels.
  const axis: TemplateResult[] = [];
  for (let i = 0; i <= model.gateCount; i++) {
    const gx = x(model.gateSizeChart * i);
    const val = model.gateSizeChart * i;
    axis.push(svg`
      <line x1=${gx} y1=${TOP} x2=${gx} y2=${plotBottom}
        stroke="var(--divider-color, #555)" stroke-width="1" opacity="0.3"></line>
      <text x=${gx} y=${plotBottom + 13} font-size="11" text-anchor="end"
        transform="rotate(-45 ${gx} ${plotBottom + 13})" fill=${TXT2}>${val.toFixed(0)} ${unit}</text>`);
  }

  const rowEls = rows.map((r, i) => {
    const y = TOP + i * ROW_H;
    const label = svg`<text x=${LBL - 6} y=${y + MID} font-size="12"
      text-anchor="end" fill=${TXT2}>${rowLabel(r)}</text>`;

    let content;
    if (r.kind === "zones") {
      content = model.zones.map((z, idx) => {
        const x0 = x(z.start);
        const x1 = x(z.end);
        const w = x1 - x0;
        // Label left, occupancy circle right; hide the label if the zone is too
        // narrow to fit both without overlapping.
        const showLabel = w >= 40;
        return svg`
          <rect x=${x0} y=${y} width=${Math.max(1, w)} height=${BAR_H}
            rx="4" fill=${z.color} opacity=${z.occupied ? 0.95 : 0.6}></rect>
          ${showLabel
            ? svg`<text x=${x0 + 6} y=${y + MID} font-size="13" font-weight="600"
                fill="#fff">Z${idx + 1}</text>`
            : nothing}
          <circle cx=${x1 - 11} cy=${y + BAR_H / 2} r="5"
            fill=${z.occupied ? "#fff" : "none"} stroke="#fff" stroke-width="2"></circle>`;
      });
    } else if (r.kind === "bar") {
      const xe = x(r.bar.value);
      content = svg`
        <rect x=${LBL} y=${y} width=${Math.max(1, xe - LBL)} height=${BAR_H}
          rx="4" fill=${r.bar.color}></rect>
        ${valueLabel(xe, fmt(r.bar.value), y)}`;
    } else if (r.kind === "gates") {
      const segs = [];
      for (let g = 0; g < model.gateCount; g++) {
        const x0 = x(model.gateSizeChart * g);
        const x1 = x(model.gateSizeChart * (g + 1));
        segs.push(svg`
          <rect x=${x0} y=${y} width=${Math.max(1, x1 - x0)} height=${BAR_H}
            fill=${gateColor(g, model.gateCount)}></rect>
          <text x=${(x0 + x1) / 2} y=${y + MID} font-size="12" font-weight="600"
            text-anchor="middle" fill="#fff">G${g + 1}</text>`);
      }
      content = segs;
    } else {
      // max bar — gate count centered, like the reference
      const xe = x(r.value);
      const text = r.gate !== undefined ? `G${r.gate}` : fmt(r.value);
      content = svg`
        <rect x=${LBL} y=${y} width=${Math.max(1, xe - LBL)} height=${BAR_H}
          rx="4" fill=${r.color} opacity="0.6"></rect>
        <text x=${(LBL + xe) / 2} y=${y + MID} font-size="13" font-weight="600"
          text-anchor="middle" fill="#fff">${text}</text>`;
    }

    // Wrap the whole row so an SVG <title> tooltip shows on hover anywhere in it.
    return svg`<g>
      <title>${rowTip(r)}</title>
      <rect x="0" y=${y} width=${WIDTH} height=${BAR_H} fill="transparent"></rect>
      ${label}${content}
    </g>`;
  });

  return html`
    <svg viewBox="0 0 ${WIDTH} ${height}" width="100%" role="img"
      aria-label="LD2410 distances">
      ${axis} ${rowEls}
    </svg>
  `;
}
