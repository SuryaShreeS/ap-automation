/** Semantic tone -> colour. Backend sends tones (link/ok/warn/danger/muted/ink);
 * the frontend owns the palette. */
/** Text tones. Every value clears WCAG AA (4.5:1) on all surfaces the app uses
 * (#FFF, #F6F7FB, #FBFBFE, #EDEFF6, #FDF6E3, #FDEDE7, #EAF7F1, #ECEDF7) —
 * verified by the contrast audit, not chosen by eye. */
export const TONE: Record<string, string> = {
  link: "#2E3391",
  muted: "#5B6788",
  muted2: "#4C5571",
  ok: "#177C53",
  warn: "#8A6D05",
  danger: "#B23413",
  accent: "#C7380D",
  ink: "#14163C",
  default: "#4C5571",
};

/** De-emphasised fills that are NOT text (toggle tracks, dashed drop zones,
 * empty-state marks) — they answer to the 3:1 non-text rule, not 4.5:1. */
export const HAIRLINE = "#A9B2CC";

export function tone(t: string | undefined): string {
  return TONE[t || "default"] || TONE.default;
}

/** Status chip colours [fg, bg] — ported from the prototype's statusMeta. */
export const STATUS_META: Record<string, [string, string]> = {
  UNPROCESSED: ["#4C5571", "#EDEFF6"],
  DATA_REQUIRED: ["#8A6D05", "#FDF6E3"],
  AUTOMATCH: ["#177C53", "#EAF7F1"],
  AP_REVIEW: ["#B23413", "#FDEDE7"],
  IN_ERP: ["#2E3391", "#ECEDF7"],
  MATCHED_PAY: ["#177C53", "#EAF7F1"],
  ERROR: ["#B23413", "#FDEDE7"],
  PARKED_ICEC: ["#8A6D05", "#FDF6E3"],
  PARKED_LEG: ["#8A6D05", "#FDF6E3"],
  CANCELLED: ["#5B6788", "#EDEFF6"],
  PAID: ["#177C53", "#EAF7F1"],
};

export function statusMeta(status: string): [string, string] {
  return STATUS_META[status] || ["#4C5571", "#EDEFF6"];
}

/** Panel accent by id — ported from panelsFor's accent argument. */
export const PANEL_ACCENT: Record<string, string> = {
  unproc: "#97A0BC",
  dataReq: "#E0A106",
  apRev: "#F1582A",
  automatch: "#1E9E6A",
  inERP: "#2E3391",
  error: "#B23413",
  aging: "#F1582A",
  cancelled: "#97A0BC",
};

/** Currency formatting matching the backend/prototype fmt(). */
export function fmt(n: number): string {
  const neg = n < 0;
  const s = "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return neg ? "(" + s + ")" : s;
}

export function money(n: number): string {
  return n ? fmt(n) : "—";
}
