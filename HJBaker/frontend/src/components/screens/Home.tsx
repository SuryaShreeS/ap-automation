"use client";

import Box from "../Box";
import { css } from "@/lib/css";
import { useGet, useOpenResults } from "@/lib/hooks";
import { useApp } from "@/lib/state";
import { tone } from "@/lib/tone";

type HomeData = {
  user: { name: string; role: string; limit: string; initials: string };
  kpis: { label: string; value: string; trend: string; tone: string }[];
  pipeline: { label: string; count: number; tone: string; filters: Record<string, string> }[];
  myWork: { label: string; count: number; target?: Record<string, string>; screen?: string; tone: string }[];
  alerts: { text: string; tone: string }[];
  recent: { ts: string; actor: string; action: string; message: string; invoiceNumber: string }[];
};

function shortTs(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const { set } = useApp();
  const openResults = useOpenResults();
  const { data } = useGet<HomeData>(["home"], "/home");
  if (!data) return null;
  const first = data.user.name.split(" ")[0];

  const goWork = (w: HomeData["myWork"][number]) => {
    if (w.screen) set({ screen: w.screen });
    else openResults(w.target || { company: "all" });
  };

  const quickActions: { label: string; onClick: () => void; primary?: boolean }[] = [
    { label: "+ New Invoice", onClick: () => set({ screen: "create" }), primary: true },
    { label: "Search Invoices", onClick: () => set({ screen: "search", searchTab: "filter" }) },
    { label: "Inflow (Classifier)", onClick: () => set({ screen: "inflow" }) },
    { label: "Dashboards", onClick: () => set({ screen: "dashboard", dashVariant: "all" }) },
  ];

  return (
    <div style={css("padding: 18px 22px; display: flex; flex-direction: column; gap: 16px;")}>
      {/* Greeting + quick actions */}
      <div style={css("display: flex; align-items: center; gap: 14px; flex-wrap: wrap;")}>
        <div style={css("width: 44px; height: 44px; border-radius: 999px; background: #2E3391; color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; flex: none;")}>{data.user.initials}</div>
        <div style={css("flex: 1; min-width: 200px;")}>
          <div style={css("font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;")}>Welcome back, {first}</div>
          <div style={css("font-size: 12px; color: #4C5571; margin-top: 2px;")}>{data.user.role} · approval limit <span style={css("font-family: 'JetBrains Mono', monospace; color: #2E3391;")}>{data.user.limit}</span> · Jul 13, 2026</div>
        </div>
        <div style={css("display: flex; gap: 8px; flex-wrap: wrap;")}>
          {quickActions.map((a) => (
            <Box
              key={a.label}
              onClick={a.onClick}
              style={`font-size: 12px; font-weight: 700; padding: 9px 16px; border-radius: 9px; cursor: pointer; ${a.primary ? "color: #fff; background: #2E3391;" : "color: #2E3391; background: #ECEDF7;"}`}
              hoverStyle={a.primary ? "background: #262A78" : "background: #D7D9EE"}
            >
              {a.label}
            </Box>
          ))}
        </div>
      </div>

      {/* My work */}
      <div>
        <div style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: #4C5571; margin-bottom: 8px;")}>Your work</div>
        <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px;")}>
          {data.myWork.map((w) => (
            <Box
              key={w.label}
              onClick={() => goWork(w)}
              style="background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; padding: 15px 17px; cursor: pointer;"
              hoverStyle="box-shadow: 0 6px 18px rgba(20,22,60,0.10), inset 0 0 0 1px #C3CADD"
            >
              <div style={css(`font-family: 'Sora', sans-serif; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; color: ${w.count > 0 ? tone(w.tone) : "#5B6788"};`)}>{w.count}</div>
              <div style={css("font-size: 12px; font-weight: 600; color: #4C5571; margin-top: 3px;")}>{w.label}</div>
            </Box>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; padding: 16px 18px;")}>
        <div style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; margin-bottom: 12px;")}>Invoice pipeline · arrival → payment</div>
        <div style={css("display: flex; align-items: stretch; gap: 0; flex-wrap: wrap;")}>
          {data.pipeline.map((p, i) => (
            <div key={p.label} style={css("display: flex; align-items: center; flex: 1; min-width: 120px;")}>
              <Box
                onClick={() => openResults(p.filters)}
                style="flex: 1; text-align: center; padding: 10px 6px; border-radius: 10px; cursor: pointer;"
                hoverStyle="background: #F6F7FB"
              >
                <div style={css(`font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; color: ${p.count > 0 ? tone(p.tone) : "#5B6788"};`)}>{p.count}</div>
                <div style={css("font-size: 10.5px; font-weight: 700; color: #4C5571; margin-top: 2px; white-space: nowrap;")}>{p.label}</div>
              </Box>
              {i < data.pipeline.length - 1 && <span style={css("color: #5B6788; font-size: 15px; font-weight: 700; padding: 0 2px;")}>›</span>}
            </div>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;")}>
        {data.kpis.map((k, i) => (
          <div key={i} style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; padding: 16px 18px;")}>
            <div style={css("font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #4C5571;")}>{k.label}</div>
            <div style={css("font-family: 'Sora', sans-serif; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin-top: 4px;")}>{k.value}</div>
            <div style={css(`font-size: 11px; font-weight: 700; color: ${tone(k.tone)}; margin-top: 3px;`)}>{k.trend}</div>
          </div>
        ))}
      </div>

      {/* Alerts + Recent activity */}
      <div style={css("display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start;")}>
        <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; overflow: hidden;")}>
          <div style={css("padding: 12px 16px; border-bottom: 1px solid #EDEFF6; font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700;")}>Attention needed</div>
          {data.alerts.length === 0 && <div style={css("padding: 14px 16px; font-size: 12px; color: #5B6788;")}>Nothing needs attention.</div>}
          {data.alerts.map((a, i) => (
            <div key={i} style={css("display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #EDEFF6;")}>
              <span style={css(`width: 8px; height: 8px; border-radius: 999px; flex: none; background: ${tone(a.tone)};`)} />
              <span style={css("font-size: 12px; color: #4C5571; line-height: 1.4;")}>{a.text}</span>
            </div>
          ))}
        </div>
        <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; overflow: hidden;")}>
          <div style={css("padding: 12px 16px; border-bottom: 1px solid #EDEFF6; display: flex; align-items: center;")}>
            <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>Recent activity</span>
            <Box onClick={() => set({ screen: "audit" })} style="font-size: 11px; font-weight: 700; color: #2E3391; cursor: pointer;" hoverStyle="text-decoration: underline">View audit log ›</Box>
          </div>
          {data.recent.length === 0 && <div style={css("padding: 14px 16px; font-size: 12px; color: #5B6788;")}>No activity yet.</div>}
          {data.recent.map((e, i) => (
            <div key={i} style={css("display: flex; gap: 10px; padding: 9px 16px; border-bottom: 1px solid #EDEFF6; align-items: baseline;")}>
              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #5B6788; width: 78px; flex: none;")}>{shortTs(e.ts)}</span>
              <span style={css("font-size: 12px; color: #4C5571; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>
                <strong style={css("color: #14163C;")}>{e.actor}</strong> · {e.message || e.action}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
