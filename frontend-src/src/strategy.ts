import type { HomeAssistant } from "./types";
import {
  generateSections,
  generateViews,
  type StrategyConfig,
} from "./strategy-core";

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
