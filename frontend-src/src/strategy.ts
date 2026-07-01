import type { HomeAssistant } from "./types";
import {
  detectRadarDevices,
  generateSections,
  generateViews,
  type StrategyConfig,
} from "./strategy-core";

/** Stable key for the set of Apollo mmWave devices currently present. */
function radarDeviceKey(hass: HomeAssistant): string {
  return detectRadarDevices(hass)
    .map((d) => d.deviceId)
    .sort()
    .join(",");
}

/**
 * Only rebuild the dashboard when the *set of devices* changes.
 *
 * HA regenerates a strategy dashboard whenever `hass.entities`/`devices`/`areas`
 * changes. Drawing a zone creates new `apollo_mmwave` zone sensors, which mutates
 * `hass.entities` — regenerating mid-draw would tear down the zone-mapper card
 * ("Subscription not found") and wipe the in-progress zone. Gating on the actual
 * device set keeps "add a device → a tab appears" while ignoring entity churn.
 */
export function shouldRegenerate(
  _config: StrategyConfig,
  oldHass: HomeAssistant,
  newHass: HomeAssistant
): boolean {
  // Fast path: the device registry object only changes when devices do, so
  // routine entity/state churn (zone sensors, moving targets) short-circuits.
  if (oldHass.devices === newHass.devices) return false;
  return radarDeviceKey(oldHass) !== radarDeviceKey(newHass);
}

const EMPTY_VIEW = {
  title: "Apollo Radar Tuning",
  cards: [
    {
      type: "markdown",
      content:
        "No Apollo radar devices found. Make sure your MSR (LD2410) or R-PRO " +
        "(LD2412) is added to Home Assistant.",
    },
  ],
};

/**
 * View strategy: turns a single view into an auto-generated LD2410 tuning view.
 * Usage in a view config:
 *   strategy:
 *     type: custom:apollo-radar-tuning
 */
class ApolloLd2410ViewStrategy extends HTMLElement {
  static shouldRegenerate = shouldRegenerate;

  static async generate(
    config: StrategyConfig,
    hass: HomeAssistant
  ): Promise<Record<string, any>> {
    return { type: "sections", sections: generateSections(hass, config) };
  }
}

/**
 * Dashboard strategy: builds a whole dashboard (one "Tuning" view with a
 * section per MSR device). Usage in a dashboard config:
 *   strategy:
 *     type: custom:apollo-radar-tuning
 */
class ApolloLd2410DashboardStrategy extends HTMLElement {
  static shouldRegenerate = shouldRegenerate;

  static async generate(
    config: StrategyConfig,
    hass: HomeAssistant
  ): Promise<Record<string, any>> {
    const views = generateViews(hass, config);
    return {
      title: "Apollo Radar Tuning",
      views: views.length ? views : [EMPTY_VIEW],
    };
  }
}

if (!customElements.get("ll-strategy-view-apollo-radar-tuning")) {
  customElements.define(
    "ll-strategy-view-apollo-radar-tuning",
    ApolloLd2410ViewStrategy
  );
}
if (!customElements.get("ll-strategy-dashboard-apollo-radar-tuning")) {
  customElements.define(
    "ll-strategy-dashboard-apollo-radar-tuning",
    ApolloLd2410DashboardStrategy
  );
}

// Surface the dashboard strategy in HA's "New Dashboard → Community Dashboards"
// picker (HA 2026.5+), so users add the tuning dashboard with no YAML.
(window as any).customStrategies = (window as any).customStrategies || [];
if (
  !(window as any).customStrategies.some(
    (s: { type?: string }) => s.type === "apollo-radar-tuning"
  )
) {
  (window as any).customStrategies.push({
    type: "apollo-radar-tuning",
    strategyType: "dashboard",
    name: "Apollo Radar Tuning",
    description:
      "Auto-built tuning dashboard for Apollo radar devices (MSR / LD2410, R-PRO / LD2412).",
    documentationURL: "https://github.com/bharvey88/apollo-mmwave",
  });
}
