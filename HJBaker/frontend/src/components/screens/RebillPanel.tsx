"use client";

import { useQuery } from "@tanstack/react-query";
import Box from "../Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";
import { statusMeta } from "@/lib/tone";

const MONO = "'JetBrains Mono', monospace";

type RebillRow = {
  platformId: number; inv: string; vendor: string; co: string; settledAmount: string; status: string; po: string;
  creditMemo: string; rebillPin: string; chainComplete: boolean; missing: string[];
};

/** Rebills: a rebill is a new invoice at the settled price, and its job is to close
 * a three-document chain — original invoice → credit memo → rebill. One table,
 * whose columns ARE the chain, so "is this provable?" is answered by reading across. */
export default function RebillPanel() {
  const { set } = useApp();
  const { data } = useQuery({
    queryKey: ["rebill-view"],
    queryFn: () => api.get<{ rows: RebillRow[]; complete: number; brokenLinks: number }>("/credits/rebills"),
  });
  if (!data) return null;

  const cols: [string, string][] = [
    ["Platform ID", "84px"], ["Rebill document", "138px"], ["Vendor", "1"], ["Co.", "44px"],
    ["Settled price", "112px"], ["Status", "112px"], ["Purchase order", "108px"],
    ["Settles credit memo", "140px"], ["Rebill PIN", "108px"], ["Chain", "1"],
  ];

  return (
    <div style={css("display: flex; flex-direction: column; gap: 14px;")}>
      <div style={css("display: flex; gap: 12px; flex-wrap: wrap;")}>
        {[["Chains complete", data.complete, "#177C53"], ["Links still missing", data.brokenLinks, "#8A6D05"]].map(([label, n, color]) => (
          <div key={label as string} style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 12px; padding: 10px 16px; min-width: 150px;")}>
            <div style={css(`font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; color: ${color};`)}>{n}</div>
            <div style={css("font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #5B6788;")}>{label}</div>
          </div>
        ))}
      </div>

      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
        <div style={css("padding: 11px 16px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE;")}>
          <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700;")}>Settlement chains · original invoice → credit memo → rebill</span>
        </div>
        <div style={css("display: flex; padding: 8px 16px; background: #FBFBFE; border-bottom: 1px solid #EDEFF6;")}>
          {cols.map(([t, wd], i) => (
            <span key={i} style={css(`${wd === "1" ? "flex: 1;" : `width: ${wd}; flex: none;`} font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5571; padding-right: 10px;`)}>{t}</span>
          ))}
        </div>
        {data.rows.map((r) => {
          const sm = statusMeta(r.status);
          return (
            <Box key={r.inv} onClick={() => set({ screen: "detail", detailId: r.inv, detailTab: "lines" })}
                 style="display: flex; align-items: center; padding: 8px 16px; border-bottom: 1px solid #F2F3F9; cursor: pointer;"
                 hoverStyle="background: #F6F7FB">
              <span style={css(`width: 84px; flex: none; font-family: ${MONO}; font-size: 11px; font-weight: 600; color: #2E3391; padding-right: 10px;`)}>{r.platformId}</span>
              <span style={css(`width: 138px; flex: none; font-family: ${MONO}; font-size: 11.5px; font-weight: 600; color: #14163C; padding-right: 10px;`)}>{r.inv}</span>
              <span style={css("flex: 1; font-size: 12px; font-weight: 700; color: #14163C; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{r.vendor}</span>
              <span style={css(`width: 44px; flex: none; font-family: ${MONO}; font-size: 11px; color: #4C5571;`)}>{r.co}</span>
              <span style={css(`width: 112px; flex: none; font-family: ${MONO}; font-size: 11.5px; font-weight: 700; color: #14163C; padding-right: 10px;`)}>{r.settledAmount}</span>
              <span style={css("width: 112px; flex: none; padding-right: 10px;")}>
                <span style={css(`font-size: 9.5px; font-weight: 700; color: ${sm[0]}; background: ${sm[1]}; padding: 2px 8px; border-radius: 999px;`)}>{r.status}</span>
              </span>
              <span style={css(`width: 108px; flex: none; font-family: ${MONO}; font-size: 11px; color: ${r.po === "—" ? "#5B6788" : "#2E3391"}; padding-right: 10px;`)}>{r.po}</span>
              <span style={css("width: 140px; flex: none; padding-right: 10px;")}>
                {r.creditMemo !== "—"
                  ? <span style={css(`font-family: ${MONO}; font-size: 11px; font-weight: 600; color: #177C53;`)}>{r.creditMemo}</span>
                  : <span style={css("font-size: 10px; font-weight: 700; color: #8A6D05; background: #FDF6E3; padding: 2px 8px; border-radius: 999px;")}>⚠ not tied</span>}
              </span>
              <span style={css(`width: 108px; flex: none; font-family: ${MONO}; font-size: 11px; color: ${r.rebillPin === "—" ? "#5B6788" : "#177C53"}; font-weight: 600; padding-right: 10px;`)}>{r.rebillPin}</span>
              <span style={css("flex: 1;")}>
                {r.chainComplete
                  ? <span style={css("font-size: 9.5px; font-weight: 700; color: #177C53; background: #EAF7F1; padding: 2px 8px; border-radius: 999px;")}>✓ all three linked</span>
                  : <span title={r.missing.join(" · ")} style={css("font-size: 9.5px; font-weight: 700; color: #8A6D05; background: #FDF6E3; padding: 2px 8px; border-radius: 999px; white-space: nowrap;")}>needs {r.missing.join(" + ")}</span>}
              </span>
            </Box>
          );
        })}
      </div>
    </div>
  );
}
