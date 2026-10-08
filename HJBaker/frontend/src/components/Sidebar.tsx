"use client";

import { useQuery } from "@tanstack/react-query";
import Box from "./Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp, type AppState } from "@/lib/state";

type NavItem = { label?: string; screen?: string; patch?: Partial<AppState>; countKey?: string; h?: string };

// Queue items carry a live count (from /queues-v2 and /inflow), like a real work tool.
const NAV: NavItem[] = [
  { label: "Home", screen: "home" },
  { h: "Invoices" },
  { label: "Search", screen: "search", patch: { searchTab: "filter" } },
  { label: "Detail View", screen: "detail" },
  { label: "Invoice Create", screen: "create" },
  { h: "Dashboards" },
  { label: "Dashboards", screen: "dashboard" },
  { h: "Queues" },
  { label: "Inflow (Classifier)", screen: "inflow", countKey: "INFLOW" },
  { label: "PO", screen: "pqueues", patch: { procQueue: "PO", procBucket: "all" }, countKey: "PO" },
  { label: "Non-PO", screen: "pqueues", patch: { procQueue: "NONPO", procBucket: "all" }, countKey: "NONPO" },
  { label: "Prepayments", screen: "pqueues", patch: { procQueue: "PREPAY", procBucket: "all" }, countKey: "PREPAY" },
  { label: "Credits", screen: "pqueues", patch: { procQueue: "CREDIT", procBucket: "all" }, countKey: "CREDIT" },
  { label: "Rebills", screen: "pqueues", patch: { procQueue: "REBILL", procBucket: "all" }, countKey: "REBILL" },
  { h: "Administration" },
  { label: "List Administration", screen: "listadmin" },
  { label: "User Administration", screen: "useradmin" },
  { label: "Audit Log", screen: "audit" },
];

export default function Sidebar() {
  const { state, set } = useApp();
  const { data: totals } = useQuery({
    queryKey: ["queues-v2"],
    queryFn: () => api.get<{ queues: { key: string; count: number }[] }>("/queues-v2"),
  });
  const { data: inflow } = useQuery({
    queryKey: ["inflow"],
    queryFn: () => api.get<{ counts: { master: number; review: number } }>("/inflow"),
  });
  const counts: Record<string, number> = Object.fromEntries((totals?.queues || []).map((q) => [q.key, q.count]));
  if (inflow) counts.INFLOW = inflow.counts.master + inflow.counts.review;

  return (
    <nav style={css("width: 236px; flex: none; background: #0A0F1C; display: flex; flex-direction: column; overflow: hidden;")}>
      <div style={css("padding: 18px 18px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 9px;")}>
        <div style={css("display: flex; align-items: center; justify-content: center; padding: 6px 0 2px;")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/alferix-logo-white.png" alt="Alferix" style={css("height: 30px; width: auto;")} />
        </div>
        <div style={css("font-size: 10.5px; color: #A7B2CE; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; text-align: center;")}>AP Invoice Platform</div>
      </div>

      <div style={css("padding: 10px 10px 14px; display: flex; flex-direction: column; gap: 1px; flex: 1; overflow-y: auto;")}>
        {NAV.map((n, i) => {
          if (n.h) {
            return (
              <div key={i} style={css("font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #7C88AE; padding: 12px 10px 5px;")}>
                {n.h}
              </div>
            );
          }
          const act =
            state.screen === n.screen &&
            (n.screen !== "pqueues" || state.procQueue === n.patch?.procQueue);
          const count = n.countKey ? counts[n.countKey] : undefined;
          return (
            <Box
              key={i}
              onClick={() => set({ screen: n.screen!, ...(n.patch || {}) })}
              style={`display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 7px; cursor: pointer; background: ${act ? "rgba(58,64,171,0.38)" : "transparent"};`}
              hoverStyle={act ? "" : "background: rgba(255,255,255,0.06)"}
            >
              <span style={css(`font-size: 12.5px; font-weight: 600; color: ${act ? "#fff" : "#97A0BC"}; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>
                {n.label}
              </span>
              {count ? (
                <span style={css(`font-family: 'JetBrains Mono', monospace; font-size: 10px; color: ${act ? "#fff" : "#97A0BC"}; background: rgba(255,255,255,0.07); padding: 1px 6px; border-radius: 999px;`)}>
                  {count}
                </span>
              ) : null}
            </Box>
          );
        })}
      </div>

      <div style={css("padding: 12px 14px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 10px;")}>
        <div style={css("display: flex; align-items: center; gap: 10px;")}>
          <div style={css("width: 28px; height: 28px; border-radius: 999px; background: #2E3391; color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Sora', sans-serif; font-size: 11px; font-weight: 700; flex: none;")}>
            IC
          </div>
          <div style={css("flex: 1; min-width: 0;")}>
            <div style={css("font-size: 12px; font-weight: 700; color: #fff;")}>Ivy Chen</div>
            <div style={css("font-size: 10.5px; color: #A7B2CE;")}>Processor · $10k limit</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
