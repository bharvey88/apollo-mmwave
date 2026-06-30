export type Uom = "mm" | "cm" | "m" | "in" | "ft" | "yd";

export const VALID_UOMS: Uom[] = ["mm", "cm", "m", "in", "ft", "yd"];

/** Meters per one unit of each UOM. */
const METERS_PER: Record<Uom, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
};

export function isValidUom(u: string | undefined): u is Uom {
  return !!u && (VALID_UOMS as string[]).includes(u);
}

export function toMeters(value: number, uom: Uom): number {
  return value * METERS_PER[uom];
}

/** Convert a value from one UOM to another (meters as the common base). */
export function convert(value: number, from: Uom, to: Uom): number {
  if (from === to) return value;
  return toMeters(value, from) / METERS_PER[to];
}
