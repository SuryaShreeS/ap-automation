import type { CSSProperties } from "react";

/**
 * Parse a prototype inline-style string ("padding: 6px; color: #2E3391") into a
 * React CSSProperties object. Lets the ported styles be copied verbatim from the
 * design — the lowest-risk path to pixel parity.
 */
export function css(style: string | CSSProperties | undefined): CSSProperties {
  if (!style) return {};
  if (typeof style !== "string") return style;
  const out: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const rawProp = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!rawProp || !val) continue;
    const prop = rawProp.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[prop] = val;
  }
  return out as CSSProperties;
}

/** Merge several style strings/objects left-to-right into one CSSProperties. */
export function merge(...styles: (string | CSSProperties | undefined)[]): CSSProperties {
  return Object.assign({}, ...styles.map(css));
}
