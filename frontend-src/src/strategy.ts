import type { HomeAssistant } from "./types";
import { registerElement } from "./register";
import {
  detectRadarDevices,
  generateCards,
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
 * Only rebuild the dashboard when the *set of detected devices* changes.
 *
 * HA regenerates a strategy dashboard whenever `hass.entities`/`devices`/`areas`
 * changes. Drawing a zone creates new `apollo_mmwave` zone sensors, which mutates
 * `hass.entities` — regenerating mid-draw would tear down the zone-mapper card
 * ("Subscription not found") and wipe the in-progress zone. Comparing the actual
 * detected-device key keeps "add a device → a tab appears" while ignoring that
 * churn (zone sensors belong to no radar device, so the key is unchanged).
 *
 * The fast path must include `entities`: a freshly added ESPHome device lands
 * in the device registry *before* its entities/states register, so detection
 * fails at that moment. The follow-up updates only touch `hass.entities` — if
 * we short-circuited on `devices` alone, the new device's tab would never
 * appear until a manual page reload.
 */
export function shouldRegenerate(
  _config: StrategyConfig,
  oldHass: HomeAssistant,
  newHass: HomeAssistant
): boolean {
  // Fast path: registry objects are replaced (not mutated) on registry
  // changes, so routine state churn (moving targets) short-circuits here.
  if (oldHass.devices === newHass.devices && oldHass.entities === newHass.entities) {
    return false;
  }
  return radarDeviceKey(oldHass) !== radarDeviceKey(newHass);
}

const EMPTY_VIEW = {
  title: "Apollo Radar Tuning",
  cards: [
    {
      type: "markdown",
      content:
        "No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), " +
        "R-PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant.",
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

/**
 * Section strategy: a single grid section with the mmWave cards, for dropping
 * into an existing sections dashboard (add section → "Apollo Radar Tuning").
 * Pass `device_id` to limit it to one device; otherwise every detected device's
 * cards are included (each group starts with a help card naming the device).
 * Usage in a section config:
 *   strategy:
 *     type: custom:apollo-radar-tuning
 *     device_id: abc123...   # optional
 */
class ApolloRadarSectionStrategy extends HTMLElement {
  static shouldRegenerate = shouldRegenerate;

  static async generate(
    config: StrategyConfig,
    hass: HomeAssistant
  ): Promise<Record<string, any>> {
    return { type: "grid", cards: generateCards(hass, config) };
  }
}

registerElement("ll-strategy-view-apollo-radar-tuning", ApolloLd2410ViewStrategy);
registerElement(
  "ll-strategy-section-apollo-radar-tuning",
  ApolloRadarSectionStrategy
);
registerElement(
  "ll-strategy-dashboard-apollo-radar-tuning",
  ApolloLd2410DashboardStrategy
);

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
