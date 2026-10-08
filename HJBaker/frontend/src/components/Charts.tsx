"use client";

/** Chart primitives built to one spec: thin marks (≤24px bars, 2px lines, ≥8px
 * markers), 4px rounded data-ends squared at the baseline, hairline solid
 * gridlines, recessive axes, selective direct labels, and a hover tooltip on
 * every mark. Colour comes from the validated tokens in lib/viz — never ad hoc. */

import { useState, type ReactNode } from "react";
import { css } from "@/lib/css";
import { VIZ, axisTicks, thousands } from "@/lib/viz";

const SANS = "'Manrope', sans-serif";
const MONO = "'JetBrains Mono', monospace";

// ---------- shared chrome ----------

export function ChartCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; min-width: 0;")}>
      <div style={css("display: flex; align-items: center; gap: 10px; margin-bottom: 4px;")}>
        <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Legend — always present for two or more series, so identity is never colour-alone. */
export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div style={css("display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 8px;")}>
      {items.map((it) => (
        <span key={it.label} style={css("display: inline-flex; align-items: center; gap: 6px;")}>
          <span style={css(`${it.line ? "width: 14px; height: 2px; border-radius: 2px;" : "width: 10px; height: 10px; border-radius: 3px;"} background: ${it.color}; flex: none;`)} />
          <span style={css(`font-size: 11px; font-weight: 600; color: ${VIZ.inkSecondary};`)}>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

type Tip = { x: number; y: number; title: string; rows: { label: string; value: string; color?: string }[] } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      style={css(`position: absolute; left: ${tip.x}px; top: ${tip.y}px; transform: translate(-50%, -100%); pointer-events: none; background: #fff; border: 1px solid #DEE2EE; border-radius: 9px; box-shadow: 0 8px 22px rgba(20,22,60,0.14); padding: 8px 11px; z-index: 20; white-space: nowrap;`)}
    >
      <div style={css(`font-size: 10.5px; font-weight: 700; color: ${VIZ.inkSecondary}; margin-bottom: 3px;`)}>{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} style={css("display: flex; align-items: center; gap: 7px;")}>
          {r.color && <span style={css(`width: 12px; height: 2px; border-radius: 2px; background: ${r.color}; flex: none;`)} />}
          {/* Values lead, labels follow — the reader has the series and wants the number. */}
          <span style={css(`font-family: ${MONO}; font-size: 12.5px; font-weight: 700; color: ${VIZ.inkPrimary};`)}>{r.value}</span>
          <span style={css(`font-size: 10.5px; color: ${VIZ.inkMuted};`)}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Table-view twin — every chart's values stay reachable without hovering. */
export function TableToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      style={css(`font-size: 10.5px; font-weight: 700; cursor: pointer; padding: 3px 9px; border-radius: 7px; color: ${on ? "#fff" : VIZ.inkSecondary}; background: ${on ? VIZ.series1 : "#EDEFF6"};`)}
    >
      {on ? "Chart" : "Table"}
    </span>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div style={css("overflow-x: auto;")}>
      <table style={css("width: 100%; border-collapse: collapse; font-size: 11.5px;")}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} style={css(`text-align: ${i === 0 ? "left" : "right"}; padding: 6px 8px; border-bottom: 1px solid ${VIZ.axis}; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${VIZ.inkMuted};`)}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} style={css(`text-align: ${ci === 0 ? "left" : "right"}; padding: 6px 8px; border-bottom: 1px solid ${VIZ.grid}; color: ${ci === 0 ? VIZ.inkPrimary : VIZ.inkSecondary}; ${ci === 0 ? "font-weight: 600;" : `font-family: ${MONO}; font-variant-numeric: tabular-nums;`}`)}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- column chart (magnitude over time, one series) ----------

export function ColumnChart({
  data, valueFormat = thousands, height = 190, unit = "",
}: {
  data: { label: string; value: number }[];
  valueFormat?: (n: number) => string;
  height?: number;
  unit?: string;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const [table, setTable] = useState(false);
  const padL = 46, padR = 10, padT = 16, padB = 24;
  const W = 560, H = height;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const ticks = axisTicks(Math.max(...data.map((d) => d.value)));
  const top = ticks[ticks.length - 1];
  const band = plotW / data.length;
  const barW = Math.min(24, band * 0.5);
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);

  if (table) {
    return (
      <>
        <div style={css("display: flex; justify-content: flex-end; margin-bottom: 6px;")}><TableToggle on onClick={() => setTable(false)} /></div>
        <DataTable head={["Period", unit || "Value"]} rows={data.map((d) => [d.label, valueFormat(d.value)])} />
      </>
    );
  }

  return (
    <>
      <div style={css("display: flex; justify-content: flex-end; margin-bottom: 2px;")}><TableToggle on={false} onClick={() => setTable(true)} /></div>
      <div style={css("position: relative; width: 100%;")}>
        <svg viewBox={`0 0 ${W} ${H}`} style={css("width: 100%; height: auto; display: block; overflow: visible;")} role="img">
          {ticks.map((t) => {
            const y = padT + plotH - (t / top) * plotH;
            return (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth={1} />
                <text x={padL - 8} y={y + 3.5} textAnchor="end" style={css(`font-family: ${MONO}; font-size: 9.5px; fill: ${VIZ.inkMuted}; font-variant-numeric: tabular-nums;`)}>{valueFormat(t)}</text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / top) * plotH;
            const x = padL + band * i + (band - barW) / 2;
            const y = padT + plotH - h;
            const r = Math.min(4, h);
            return (
              <g key={d.label}
                 onPointerMove={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top - 12, title: d.label, rows: [{ label: unit, value: valueFormat(d.value), color: VIZ.series1 }] }); }}
                 onPointerLeave={() => setTip(null)}>
                {/* hit target spans the whole band — bigger than the mark */}
                <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent" />
                {/* 4px rounded cap, square at the baseline */}
                <path d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`} fill={VIZ.series1} />
                {i === maxIdx && (
                  <text x={x + barW / 2} y={y - 6} textAnchor="middle" style={css(`font-family: ${MONO}; font-size: 10px; font-weight: 700; fill: ${VIZ.inkPrimary};`)}>{valueFormat(d.value)}</text>
                )}
                <text x={padL + band * i + band / 2} y={H - 7} textAnchor="middle" style={css(`font-family: ${SANS}; font-size: 10.5px; font-weight: 600; fill: ${VIZ.inkSecondary};`)}>{d.label}</text>
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </>
  );
}

// ---------- line chart (trend, one series, with an optional target rule) ----------

export function LineChart({
  data, target, height = 190, unit = "%", valueFormat = (n: number) => n.toFixed(1) + "%",
}: {
  data: { label: string; value: number }[];
  target?: number;
  height?: number;
  unit?: string;
  valueFormat?: (n: number) => string;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const [table, setTable] = useState(false);
  const padL = 40, padR = 30, padT = 16, padB = 24;
  const W = 560, H = height;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = data.map((d) => d.value).concat(target ?? []);
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 8) / 10) * 10);
  const hi = Math.ceil((Math.max(...vals) + 5) / 10) * 10;
  const yOf = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const xOf = (i: number) => padL + (plotW / Math.max(1, data.length - 1)) * i;
  const ticks = [lo, lo + (hi - lo) / 2, hi];

  if (table) {
    return (
      <>
        <div style={css("display: flex; justify-content: flex-end; margin-bottom: 6px;")}><TableToggle on onClick={() => setTable(false)} /></div>
        <DataTable head={["Period", unit]} rows={data.map((d) => [d.label, valueFormat(d.value)])} />
      </>
    );
  }

  const path = data.map((d, i) => `${i ? "L" : "M"}${xOf(i)},${yOf(d.value)}`).join(" ");
  const last = data[data.length - 1];

  return (
    <>
      <div style={css("display: flex; justify-content: flex-end; margin-bottom: 2px;")}><TableToggle on={false} onClick={() => setTable(true)} /></div>
      <div style={css("position: relative; width: 100%;")}>
        <svg viewBox={`0 0 ${W} ${H}`} style={css("width: 100%; height: auto; display: block; overflow: visible;")} role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={yOf(t)} y2={yOf(t)} stroke={VIZ.grid} strokeWidth={1} />
              <text x={padL - 8} y={yOf(t) + 3.5} textAnchor="end" style={css(`font-family: ${MONO}; font-size: 9.5px; fill: ${VIZ.inkMuted};`)}>{Math.round(t)}%</text>
            </g>
          ))}
          {target != null && (
            <g>
              <line x1={padL} x2={W - padR} y1={yOf(target)} y2={yOf(target)} stroke={VIZ.axis} strokeWidth={1} />
              {/* left-anchored so it never collides with the endpoint's direct label */}
              <text x={padL + 4} y={yOf(target) - 5} style={css(`font-family: ${SANS}; font-size: 9.5px; font-weight: 700; fill: ${VIZ.inkMuted};`)}>target {target}%</text>
            </g>
          )}
          <path d={path} fill="none" stroke={VIZ.series1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={d.label}
               onPointerMove={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top - 12, title: d.label, rows: [{ label: unit, value: valueFormat(d.value), color: VIZ.series1 }] }); }}
               onPointerLeave={() => setTip(null)}>
              <rect x={xOf(i) - plotW / (data.length * 2)} y={padT} width={plotW / data.length} height={plotH} fill="transparent" />
              {/* ≥8px marker with a 2px surface ring so it stays legible over the line */}
              <circle cx={xOf(i)} cy={yOf(d.value)} r={4} fill={VIZ.series1} stroke={VIZ.surface} strokeWidth={2} />
              <text x={xOf(i)} y={H - 7} textAnchor="middle" style={css(`font-family: ${SANS}; font-size: 10.5px; font-weight: 600; fill: ${VIZ.inkSecondary};`)}>{d.label}</text>
            </g>
          ))}
          {/* endpoint is the one direct label — never a number on every point */}
          <text x={xOf(data.length - 1) + 8} y={yOf(last.value) + 3.5} style={css(`font-family: ${MONO}; font-size: 10.5px; font-weight: 700; fill: ${VIZ.inkPrimary};`)}>{valueFormat(last.value)}</text>
        </svg>
        <Tooltip tip={tip} />
      </div>
    </>
  );
}

// ---------- horizontal bars (nominal categories, one hue — or an ordinal ramp) ----------

export function BarChart({
  data, valueFormat = (n: number) => n + "%", target, labelWidth = 128, ordinal = false, note,
}: {
  data: { label: string; value: number; display?: string }[];
  valueFormat?: (n: number) => string;
  target?: number;
  labelWidth?: number;
  ordinal?: boolean;
  note?: (d: { label: string; value: number }) => string | null;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(...data.map((d) => d.value));

  if (table) {
    return (
      <>
        <div style={css("display: flex; justify-content: flex-end; margin-bottom: 6px;")}><TableToggle on onClick={() => setTable(false)} /></div>
        <DataTable head={["Category", "Value"]} rows={data.map((d) => [d.label, d.display ?? valueFormat(d.value)])} />
      </>
    );
  }

  return (
    <>
      <div style={css("display: flex; justify-content: flex-end; margin-bottom: 4px;")}><TableToggle on={false} onClick={() => setTable(true)} /></div>
      <div style={css("position: relative; display: flex; flex-direction: column; gap: 7px;")}>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          const flag = note?.(d) ?? null;
          // Ordered stages read their order from the ramp; nominal categories all
          // take slot 1 — colour never re-encodes what bar length already shows.
          const fill = ordinal ? VIZ.ordinal[Math.min(i, VIZ.ordinal.length - 1)] : VIZ.series1;
          return (
            <div key={d.label}
                 onPointerMove={(e) => { const b = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top - 6, title: d.label, rows: [{ label: "", value: d.display ?? valueFormat(d.value), color: fill }] }); }}
                 onPointerLeave={() => setTip(null)}
                 style={css("display: flex; align-items: center; gap: 10px; min-height: 24px;")}>
              <span style={css(`width: ${labelWidth}px; flex: none; font-size: 11.5px; font-weight: 600; color: ${VIZ.inkPrimary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>{d.label}</span>
              <div style={css("flex: 1; position: relative; height: 14px; display: flex; align-items: center; min-width: 0;")}>
                {target != null && (
                  <span style={css(`position: absolute; left: ${(target / max) * 100}%; top: -3px; bottom: -3px; width: 1px; background: ${VIZ.axis};`)} />
                )}
                {/* 10px mark, 4px rounded data-end, square at the baseline */}
                <div style={css(`height: 10px; width: ${pct}%; background: ${fill}; border-radius: 0 4px 4px 0;`)} />
              </div>
              <span style={css(`font-family: ${MONO}; font-size: 11px; font-weight: 700; color: ${VIZ.inkPrimary}; width: 54px; text-align: right; flex: none; font-variant-numeric: tabular-nums;`)}>{d.display ?? valueFormat(d.value)}</span>
              {flag !== null && (
                <span style={css(`font-size: 9.5px; font-weight: 700; color: ${VIZ.critical}; background: #FDEDE7; padding: 2px 7px; border-radius: 999px; white-space: nowrap; flex: none;`)}>{flag}</span>
              )}
            </div>
          );
        })}
        <Tooltip tip={tip} />
      </div>
      {target != null && (
        <div style={css(`margin-top: 8px; font-size: 10px; color: ${VIZ.inkMuted};`)}>│ target {target}%</div>
      )}
    </>
  );
}

// ---------- grouped bars (two series, legend mandatory) ----------

export function GroupedBarChart({
  data, series, labelWidth = 150,
}: {
  data: { label: string; a: number; b: number }[];
  series: [string, string];
  labelWidth?: number;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));

  if (table) {
    return (
      <>
        <div style={css("display: flex; justify-content: flex-end; margin-bottom: 6px;")}><TableToggle on onClick={() => setTable(false)} /></div>
        <DataTable head={["Company", series[0], series[1]]} rows={data.map((d) => [d.label, d.a, d.b])} />
      </>
    );
  }

  return (
    <>
      <div style={css("display: flex; align-items: center; margin-bottom: 4px;")}>
        <div style={css("flex: 1;")}><Legend items={[{ label: series[0], color: VIZ.series1 }, { label: series[1], color: VIZ.series2 }]} /></div>
        <TableToggle on={false} onClick={() => setTable(true)} />
      </div>
      <div style={css("position: relative; display: flex; flex-direction: column; gap: 9px;")}>
        {data.map((d) => (
          <div key={d.label} style={css("display: flex; align-items: center; gap: 10px;")}>
            <span style={css(`width: ${labelWidth}px; flex: none; font-size: 11.5px; font-weight: 600; color: ${VIZ.inkPrimary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>{d.label}</span>
            {/* two 8px bars with a 2px surface gap — white does the separating */}
            <div style={css("flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;")}>
              {([["a", VIZ.series1, series[0]], ["b", VIZ.series2, series[1]]] as const).map(([k, color, name]) => {
                const v = d[k];
                return (
                  <div key={k}
                       onPointerMove={(e) => { const b = (e.currentTarget.closest("div[data-plot]") as HTMLElement).getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top - 6, title: d.label, rows: [{ label: name, value: String(v), color }] }); }}
                       onPointerLeave={() => setTip(null)}
                       style={css("display: flex; align-items: center; gap: 7px; height: 12px;")}>
                    <div style={css(`height: 8px; width: ${(v / max) * 100}%; background: ${color}; border-radius: 0 4px 4px 0; min-width: ${v > 0 ? "2px" : "0"};`)} />
                    <span style={css(`font-family: ${MONO}; font-size: 10.5px; font-weight: 700; color: ${v > 0 ? VIZ.inkSecondary : VIZ.inkMuted}; font-variant-numeric: tabular-nums;`)}>{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div data-plot style={css("position: absolute; inset: 0; pointer-events: none;")}><Tooltip tip={tip} /></div>
      </div>
    </>
  );
}

// ---------- stat tile ----------

export function StatTile({ label, value, trend, trendColor, spark }: {
  label: string; value: string; trend: string; trendColor: string; spark?: number[];
}) {
  const pts = spark && spark.length > 1 ? spark : null;
  let path = "", lastX = 0, lastY = 0;
  if (pts) {
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    path = pts.map((v, i) => {
      const x = (i / (pts.length - 1)) * 88;
      const y = 22 - ((v - lo) / span) * 20;
      if (i === pts.length - 1) { lastX = x; lastY = y; }
      return `${i ? "L" : "M"}${x},${y}`;
    }).join(" ");
  }
  return (
    <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; gap: 3px;")}>
      <div style={css(`font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${VIZ.inkSecondary};`)}>{label}</div>
      <div style={css("display: flex; align-items: flex-end; gap: 10px;")}>
        {/* proportional figures — tabular-nums makes a display number look loose */}
        <div style={css("font-family: 'Sora', sans-serif; font-size: 28px; font-weight: 800; letter-spacing: -0.02em; flex: 1;")}>{value}</div>
        {pts && (
          <svg viewBox="0 0 96 26" style={css("width: 96px; height: 26px; flex: none; overflow: visible;")} aria-hidden="true">
            <path d={path} fill="none" stroke={VIZ.ordinal[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lastX} cy={lastY} r={3.5} fill={VIZ.series1} stroke={VIZ.surface} strokeWidth={2} />
          </svg>
        )}
      </div>
      <div style={css(`font-size: 11px; font-weight: 700; color: ${trendColor};`)}>{trend}</div>
    </div>
  );
}
