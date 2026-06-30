/** Parse an LD2410 gate-size select state like "0.75m" / "0.2 m" into meters.
 *  Returns undefined if no numeric value can be parsed. */
export function parseGateSizeMeters(state: string | undefined): number | undefined {
  if (!state) return undefined;
  const match = state.replace(",", ".").match(/[0-9]*\.?[0-9]+/);
  if (!match) return undefined;
  const value = parseFloat(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Map a value in [0, maxRange] onto [0, width] pixels, clamped. */
export function scaleX(value: number, maxRange: number, width: number): number {
  if (maxRange <= 0) return 0;
  return clamp((value / maxRange) * width, 0, width);
}

/** X pixel positions for gate ticks G1..Gcount along a chart of pixel `width`
 *  representing 0..(gateSizeChart * count) in chart units. */
export function gateTicks(
  gateSizeChart: number,
  count: number,
  width: number
): number[] {
  const maxRange = gateSizeChart * count;
  const ticks: number[] = [];
  for (let i = 1; i <= count; i++) {
    ticks.push(scaleX(gateSizeChart * i, maxRange, width));
  }
  return ticks;
}
