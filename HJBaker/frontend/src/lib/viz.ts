/** Data-visualisation tokens.
 *
 * Every colour here was run through the palette validator (OKLCH lightness band,
 * chroma floor, protan/deutan CVD separation, normal-vision floor, contrast vs the
 * white chart surface) — none of it is eyeballed:
 *
 *   categorical  #3A40AB,#F1582A  → all checks PASS (CVD ΔE 28.1 · normal 39.0)
 *   ordinal      #A9AEE4→#3A40AB  → monotone L, ΔL ≥ 0.06, light end 2.13:1, 6° hue spread
 *
 * `series1` is the brand indigo snapped one step lighter (#2E3391 sits at L 0.38,
 * below the 0.43 mark band) — same hue, legible as a chart mark.
 */
export const VIZ = {
  surface: "#ffffff",
  grid: "#EDEFF6", // hairline gridline, one step off surface
  axis: "#DEE2EE", // baseline / axis rule
  inkPrimary: "#14163C",
  inkSecondary: "#4C5571",
  inkMuted: "#97A0BC",
  /** Categorical slots — assigned in fixed order, never cycled. */
  series1: "#3A40AB",
  series2: "#F1582A",
  /** Ordinal ramp (one hue, light → dark) for ordered stages. */
  ordinal: ["#A9AEE4", "#7C84D6", "#5058CC", "#3A40AB"],
  /** Status — reserved meaning, always shipped with an icon + label. */
  critical: "#B23413",
  good: "#1E9E6A",
} as const;

/** Nice round axis ticks (0 / 1,000 / 2,000 …) covering [0, max]. */
export function axisTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

export const compact = (n: number): string =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1_000 ? (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K"
  : String(n);

export const thousands = (n: number): string => n.toLocaleString("en-US");
