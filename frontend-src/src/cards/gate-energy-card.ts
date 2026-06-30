import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, Ld2410CardConfig } from "../types";
import { resolveEntities } from "../entities";
import { renderGateEnergyChart } from "../charts/gate-energy-chart";

export class ApolloLd2410GateEnergyCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: Ld2410CardConfig;

  public setConfig(config: Ld2410CardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 6;
  }

  static getStubConfig(): Ld2410CardConfig {
    return { type: "custom:apollo-radar-gate-energy-card" };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const m = resolveEntities(this.hass, this._config);
    const chart = renderGateEnergyChart(this.hass, m);
    if (chart === nothing) return nothing;
    return html`
      <ha-card .header=${this._config.title ?? "LD2410 Gate Energy"}>
        <div class="wrap">${chart}</div>
      </ha-card>
    `;
  }

  static styles = css`
    .wrap {
      padding: 4px 12px 12px;
    }
    .chart-legend {
      font-size: 0.8em;
      color: var(--secondary-text-color);
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      margin-top: 6px;
    }
  `;
}

if (!customElements.get("apollo-radar-gate-energy-card")) {
  customElements.define("apollo-radar-gate-energy-card", ApolloLd2410GateEnergyCard);
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "apollo-radar-gate-energy-card",
  name: "Apollo Radar Gate Energy Chart",
  description: "Per-gate move/still energy chart for Apollo MSR (LD2410) & R-PRO (LD2412).",
  documentationURL: "https://github.com/ApolloAutomation/dashboard-cards",
});
