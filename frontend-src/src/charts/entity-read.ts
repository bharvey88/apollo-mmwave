import type { HomeAssistant } from "../types";
import { isValidUom, type Uom } from "./unit-convert";

/** Numeric state of an entity, or undefined if absent / non-numeric / unknown. */
export function numState(hass: HomeAssistant, id?: string): number | undefined {
  if (!id) return undefined;
  const ent = hass.states[id];
  if (!ent) return undefined;
  const v = parseFloat(ent.state);
  return Number.isFinite(v) ? v : undefined;
}

/** Unit of measurement attribute of an entity, falling back when invalid/absent. */
export function uomOf(hass: HomeAssistant, id: string | undefined, fallback: Uom): Uom {
  const uom = id ? hass.states[id]?.attributes?.unit_of_measurement : undefined;
  return isValidUom(uom) ? uom : fallback;
}
