"use client";

import { BarChart, ChartCard, ColumnChart, GroupedBarChart, LineChart, StatTile } from "../Charts";
import { css } from "@/lib/css";
import { useGet } from "@/lib/hooks";
import { tone } from "@/lib/tone";
import { thousands } from "@/lib/viz";

type AnalyticsData = {
  kpis: { label: string; value: string; trend: string; tone: string; spark?: number[] }[];
  volumeTrend: { month: string; invoices: number; autoMatchPct: number }[];
  vendorMatch: { name: string; pct: number }[];
  autoMatchTarget: number;
  exceptionMix: { label: string; pct: number }[];
  cycleTime: { stage: string; minutes: number; display: string }[];
  throughput: { company: string; processed: number; exceptions: number }[];
};

export default function Analytics({ embedded = false }: { embedded?: boolean }) {
  const { data } = useGet<AnalyticsData>(["analytics"], "/dashboards/analytics");
  if (!data) return null;
  const target = data.autoMatchTarget;

  return (
    <div style={css(`${embedded ? "" : "padding: 18px 22px;"} display: flex; flex-direction: column; gap: 14px;`)}>
      <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;")}>
        {data.kpis.map((k) => (
          <StatTile key={k.label} label={k.label} value={k.value} trend={k.trend} trendColor={tone(k.tone)} spark={k.spark} />
        ))}
      </div>

      {/* Volume and auto-match are different measures — two charts on their own
          scales, never one dual-axis plot. */}
      <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 14px;")}>
        <ChartCard title="Invoice volume by month">
          <ColumnChart data={data.volumeTrend.map((v) => ({ label: v.month, value: v.invoices }))} valueFormat={thousands} unit="invoices" />
        </ChartCard>
        <ChartCard title="Auto-match rate by month">
          <LineChart data={data.volumeTrend.map((v) => ({ label: v.month, value: v.autoMatchPct }))} target={target} unit="auto-matched" />
        </ChartCard>
      </div>

      <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 14px; align-items: start;")}>
        <ChartCard title="Exception mix">
          <BarChart data={data.exceptionMix.map((e) => ({ label: e.label, value: e.pct }))} labelWidth={140} />
        </ChartCard>
        <ChartCard title="Auto-match by vendor">
          {/* Below-target vendors carry an icon + label, never colour alone. */}
          <BarChart
            data={data.vendorMatch.map((v) => ({ label: v.name, value: v.pct }))}
            target={target}
            labelWidth={124}
            note={(d) => (d.value < target ? "⚠ below target" : null)}
          />
        </ChartCard>
      </div>

      <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 14px; align-items: start;")}>
        <ChartCard title="Median cycle time by stage">
          {/* Ordered pipeline stages → one-hue ordinal ramp so the order reads in the colour. */}
          <BarChart
            data={data.cycleTime.map((c) => ({ label: c.stage, value: c.minutes, display: c.display }))}
            ordinal
            labelWidth={140}
            valueFormat={(n) => n + " min"}
          />
        </ChartCard>
        <ChartCard title="Throughput by company">
          {/* Sorted by activity so the companies with volume lead and idle ones
              fall to the bottom instead of filling the plot with empty rows. */}
          <GroupedBarChart
            data={[...data.throughput]
              .sort((x, y) => y.processed + y.exceptions - (x.processed + x.exceptions))
              .map((t) => ({ label: t.company, a: t.processed, b: t.exceptions }))}
            series={["Processed", "Exceptions"]}
          />
        </ChartCard>
      </div>
    </div>
  );
}
