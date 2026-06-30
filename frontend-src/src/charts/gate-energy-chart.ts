import { html, svg, nothing, type TemplateResult } from "lit";
import type { EntityMap, HomeAssistant } from "../types";
import { numState } from "./entity-read";

const MOVE_COLOR = "#4b0082";
const MOVE_THR_COLOR = "#9467bd";
const STILL_COLOR = "#274e13";
const STILL_THR_COLOR = "#8cb640";

export interface GateRow {
  index: number;
  move: number;
  still: number;
  moveThr?: number;
  stillThr?: number;
}

export interface GateEnergyModel {
  engineeringMode: boolean;
  present: boolean;
  gates: GateRow[];
}

export function gateEnergyModel(hass: HomeAssistant, m: EntityMap): GateEnergyModel {
  let present = false;
  const seen = (id?: string) => {
    if (id && id in hass.states) present = true;
  };

  const count = m.move_threshold.length;
  const gates: GateRow[] = Array.from({ length: count }, (_, n) => {
    seen(m.move_energy[n]);
    seen(m.still_energy[n]);
    seen(m.move_threshold[n]);
    seen(m.still_threshold[n]);
    return {
      index: n,
      move: numState(hass, m.move_energy[n]) ?? 0,
      still: numState(hass, m.still_energy[n]) ?? 0,
      moveThr: numState(hass, m.move_threshold[n]),
      stillThr: numState(hass, m.still_threshold[n]),
    };
  });

  return {
    engineeringMode:
      !!m.engineering_mode && hass.states[m.engineering_mode]?.state === "on",
    present,
    gates,
  };
}

const WIDTH = 470;
const HEIGHT = 220;
const PAD_L = 26;
const PAD_B = 24;
const PAD_T = 10;
const PLOT_H = HEIGHT - PAD_B - PAD_T;
const MAX_ENERGY = 100;

/** Y pixel for an energy value 0..100 (0 at the bottom axis). */
function yFor(energy: number): number {
  const clamped = Math.max(0, Math.min(MAX_ENERGY, energy));
  return PAD_T + PLOT_H * (1 - clamped / MAX_ENERGY);
}

export function renderGateEnergyChart(
  hass: HomeAssistant,
  m: EntityMap
): TemplateResult | typeof nothing {
  const model = gateEnergyModel(hass, m);
  if (!model.present) return nothing;

  const slot = (WIDTH - PAD_L) / model.gates.length;
  const barW = slot * 0.32;
  const baseY = yFor(0);

  const bars = model.gates.map((g) => {
    const cx = PAD_L + slot * g.index + slot / 2;
    const moveX = cx - barW - 2;
    const stillX = cx + 2;
    const els: TemplateResult[] = [];
    els.push(svg`
      <rect x=${moveX} y=${yFor(g.move)} width=${barW} height=${baseY - yFor(g.move)}
        fill=${MOVE_COLOR}></rect>
      <rect x=${stillX} y=${yFor(g.still)} width=${barW} height=${baseY - yFor(g.still)}
        fill=${STILL_COLOR}></rect>
      <text x=${cx} y=${HEIGHT - 7} font-size="13" text-anchor="middle"
        fill="var(--secondary-text-color)">G${g.index}</text>`);
    if (model.engineeringMode && g.moveThr !== undefined) {
      const ty = yFor(g.moveThr);
      const tx = moveX + barW / 2;
      // right-pointing triangle = move threshold
      els.push(svg`<path d="M ${tx - 5} ${ty - 5} L ${tx - 5} ${ty + 5} L ${tx + 5} ${ty} Z"
        fill=${MOVE_THR_COLOR}></path>`);
    }
    if (model.engineeringMode && g.stillThr !== undefined) {
      const ty = yFor(g.stillThr);
      const tx = stillX + barW / 2;
      // left-pointing triangle = still threshold
      els.push(svg`<path d="M ${tx + 5} ${ty - 5} L ${tx + 5} ${ty + 5} L ${tx - 5} ${ty} Z"
        fill=${STILL_THR_COLOR}></path>`);
    }
    return els;
  });

  const gridlines = [0, 25, 50, 75, 100].map(
    (v) => svg`
      <line x1=${PAD_L} y1=${yFor(v)} x2=${WIDTH} y2=${yFor(v)}
        stroke="var(--divider-color, #888)" stroke-width="1" opacity="0.3"></line>
      <text x=${PAD_L - 4} y=${yFor(v) + 3} font-size="11" text-anchor="end"
        fill="var(--secondary-text-color)">${v}</text>`
  );

  const overlay = model.engineeringMode
    ? nothing
    : svg`
        <rect x=${PAD_L} y=${PAD_T} width=${WIDTH - PAD_L} height=${PLOT_H}
          fill="var(--card-background-color, #000)" opacity="0.78"></rect>
        <text x=${(WIDTH + PAD_L) / 2} y=${PAD_T + PLOT_H / 2} font-size="20"
          font-weight="600" text-anchor="middle" fill="var(--primary-text-color, #e6e6e6)">
          <tspan x=${(WIDTH + PAD_L) / 2} dy="-4">Turn on Radar Engineering Mode</tspan>
          <tspan x=${(WIDTH + PAD_L) / 2} dy="28">to see gate energy values</tspan>
        </text>`;

  return html`
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img"
      aria-label="LD2410 gate energy">
      <title>
        Per-gate signal energy (bars) vs your thresholds (triangles). A gate
        detects a target when its energy rises above the threshold. Turn on
        Radar Engineering Mode to see live energy.
      </title>
      ${gridlines} ${bars} ${overlay}
    </svg>
    <div class="chart-legend">
      <span><span style="color:${MOVE_COLOR}">■</span> Move energy</span>
      <span><span style="color:${STILL_COLOR}">■</span> Still energy</span>
      <span><span style="color:${MOVE_THR_COLOR}">▶</span> Move threshold</span>
      <span><span style="color:${STILL_THR_COLOR}">◀</span> Still threshold</span>
    </div>
  `;
}
