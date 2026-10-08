"use client";

import Box from "../Box";
import Analytics from "./Analytics";
import { BarChart, ChartCard, ColumnChart, LineChart, StatTile } from "../Charts";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useGet, useOpenResults } from "@/lib/hooks";
import { useApp } from "@/lib/state";
import { PANEL_ACCENT, tone } from "@/lib/tone";
import { VIZ, thousands } from "@/lib/viz";

// One sidebar entry ("Dashboards") — every view is a tab inside this screen.
const DASH_TABS: [string, string][] = [
  ["all", "Overview (All)"], ["aging", "Aging"], ["erp", "ERP & Cancelled"], ["nonpo", "Non-PO"],
  ["po", "PO Only"], ["co405410", "405/410"], ["reports", "Reports"], ["kpis", "Invoice Dashboard"],
  ["analytics", "Analytics"],
];

type Cell = {
  text: string;
  n?: number;
  clickable?: boolean;
  tone?: string;
  filters?: { values: Record<string, string>; ops: Record<string, string> } | null;
};
type Row = { label: string; total?: boolean; wide?: boolean; cells: Cell[] };
type Panel = { id: string; title: string; tag: string; header: { label: string; cells: string[] } | null; rows: Row[] };

export default function HomeDashboards() {
  const { state, set } = useApp();
  const v = state.dashVariant;
  const isPanel = ["all", "aging", "erp", "nonpo", "po", "co405410"].includes(v);

  return (
    <div style={css("padding: 18px 22px; display: flex; flex-direction: column; gap: 16px;")}>
      <div style={css("display: flex; gap: 3px; background: #fff; border: 1px solid #DEE2EE; border-radius: 10px; padding: 4px; align-self: flex-start; flex-wrap: wrap;")}>
        {DASH_TABS.map(([k, label]) => (
          <div
            key={k}
            onClick={() => set({ dashVariant: k })}
            style={css(`font-size: 11.5px; font-weight: 700; padding: 6px 12px; border-radius: 7px; cursor: pointer; white-space: nowrap; color: ${v === k ? "#fff" : "#6B7493"}; background: ${v === k ? "#2E3391" : "transparent"};`)}
          >
            {label}
          </div>
        ))}
      </div>

      {isPanel && <Panels variant={v} />}
      {v === "reports" && <Reports />}
      {v === "kpis" && <Kpis />}
      {v === "analytics" && <Analytics embedded />}
    </div>
  );
}

function Panels({ variant }: { variant: string }) {
  const openResults = useOpenResults();
  const { data } = useGet<{ panels: Panel[] }>(["overview", variant], `/dashboards/overview?variant=${variant}`);
  const panels = data?.panels || [];
  const cellWidth = (p: Panel) => (p.id === "aging" ? "58px" : "64px");

  return (
    <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 14px; align-items: start;")}>
      {panels.map((p) => (
        <div key={p.id} style={css(`background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; overflow: hidden; border-top: 3px solid ${PANEL_ACCENT[p.id] || "#2E3391"};`)}>
          <div style={css("padding: 11px 16px; border-bottom: 1px solid #DEE2EE; background: #F6F7FB; display: flex; align-items: baseline; gap: 8px;")}>
            <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>{p.title}</span>
            <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #4C5571;")}>{p.tag}</span>
          </div>

          {p.header && (
            <div style={css("display: flex; padding: 6px 16px; border-bottom: 1px solid #EDEFF6; align-items: center; background: #FBFBFE;")}>
              <span style={css("font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #5B6788; flex: 1;")}>{p.header.label}</span>
              {p.header.cells.map((t, i) => (
                <span key={i} style={css(`font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #5B6788; width: ${cellWidth(p)}; text-align: right; flex: none;`)}>{t}</span>
              ))}
            </div>
          )}

          <div style={css("max-height: 300px; overflow-y: auto;")}>
            {p.rows.map((rw, ri) => (
              <div key={ri} style={css(`display: flex; padding: 5.5px 16px; border-bottom: 1px solid #EDEFF6; align-items: center; border-top: ${rw.total ? "2px solid #DEE2EE" : "none"};`)}>
                <span style={css(`font-size: 12px; font-weight: ${rw.total ? "800" : "600"}; color: ${rw.total ? "#14163C" : "#353D57"}; flex: 1;`)}>{rw.label}</span>
                {rw.cells.map((c, ci) => (
                  <span
                    key={ci}
                    onClick={c.clickable && c.filters ? () => openResults(c.filters!.values, c.filters!.ops) : undefined}
                    style={css(`font-family: 'JetBrains Mono', monospace; font-size: 11.5px; width: ${rw.wide ? "130px" : cellWidth(p)}; text-align: right; color: ${tone(c.tone)}; font-weight: ${rw.total ? "800" : "600"}; cursor: ${c.clickable ? "pointer" : "default"}; flex: none;`)}
                  >
                    {c.text}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Reports() {
  const { toast } = useApp();
  const { data } = useGet<{ rows: { name: string; desc: string; rows: number; share: number }[] }>(["reports"], "/reports");
  const rows = data?.rows || [];
  const run = async (name: string) => {
    const r = await api.post<{ message: string }>(`/reports/run?name=${encodeURIComponent(name)}`);
    toast(r.message);
  };
  return (
    <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; overflow: hidden;")}>
      <div style={css("padding: 12px 18px; border-bottom: 1px solid #DEE2EE; background: #F6F7FB; font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700;")}>Reports (All)</div>
      {rows.map((r) => {
        const n = r.rows ?? 0;
        const share = r.share ?? 0;
        return (
        <div key={r.name} style={css("display: flex; align-items: center; gap: 14px; padding: 11px 18px; border-bottom: 1px solid #EDEFF6;")}>
          <div style={css("flex: 1; min-width: 0;")}>
            <div style={css("font-size: 13px; font-weight: 700;")}>{r.name}</div>
            <div style={css("font-size: 11.5px; color: #4C5571; margin-top: 1px;")}>{r.desc}</div>
          </div>
          {/* Live extent of the export — one hue, magnitude only. */}
          <div style={css("width: 150px; flex: none; display: flex; align-items: center; gap: 9px;")}>
            <div style={css("flex: 1; height: 8px; display: flex; align-items: center;")}>
              <div style={css(`height: 8px; width: ${Math.max(share, n > 0 ? 3 : 0)}%; background: ${VIZ.series1}; border-radius: 0 4px 4px 0;`)} />
            </div>
            <span style={css(`font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: ${n ? "#14163C" : "#5B6788"}; width: 46px; text-align: right; font-variant-numeric: tabular-nums;`)}>{n.toLocaleString()}</span>
          </div>
          <Box onClick={() => run(r.name)} style="font-size: 11.5px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 6px 14px; border-radius: 8px; cursor: pointer; white-space: nowrap;" hoverStyle="background: #D7D9EE">Export to Excel</Box>
        </div>
        );
      })}
      <div style={css("display: flex; padding: 8px 18px; background: #FBFBFE;")}>
        <span style={css("flex: 1;")} />
        <span style={css("width: 150px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #5B6788;")}>Rows in export</span>
        <span style={css("width: 118px;")} />
      </div>
    </div>
  );
}

type KpiData = {
  kpis: { label: string; value: string; trend: string; tone: string; spark?: number[] }[];
  volumeTrend: { month: string; invoices: number; autoMatchPct: number }[];
  vendorMatch: { name: string; pct: number }[];
  autoMatchTarget: number;
};

function Kpis() {
  const { data } = useGet<KpiData>(["kpis"], "/dashboards/kpis");
  if (!data) return null;
  return (
    <div style={css("display: flex; flex-direction: column; gap: 14px;")}>
      <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;")}>
        {data.kpis.map((k) => (
          <StatTile key={k.label} label={k.label} value={k.value} trend={k.trend} trendColor={tone(k.tone)} spark={k.spark} />
        ))}
      </div>
      <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 14px;")}>
        <ChartCard title="Invoice volume by month">
          <ColumnChart data={data.volumeTrend.map((v) => ({ label: v.month, value: v.invoices }))} valueFormat={thousands} unit="invoices" />
        </ChartCard>
        <ChartCard title="Auto-match rate by month">
          <LineChart data={data.volumeTrend.map((v) => ({ label: v.month, value: v.autoMatchPct }))} target={data.autoMatchTarget} unit="auto-matched" />
        </ChartCard>
      </div>
      <ChartCard title="Auto-match by vendor">
        <BarChart
          data={data.vendorMatch.map((v) => ({ label: v.name, value: v.pct }))}
          target={data.autoMatchTarget}
          labelWidth={140}
          note={(d) => (d.value < data.autoMatchTarget ? "⚠ below target" : null)}
        />
      </ChartCard>
    </div>
  );
}
