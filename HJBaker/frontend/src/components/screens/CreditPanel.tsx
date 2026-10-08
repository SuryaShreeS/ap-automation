"use client";

import { useQuery } from "@tanstack/react-query";
import Box from "../Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";
import { statusMeta } from "@/lib/tone";

const MONO = "'JetBrains Mono', monospace";

type CreditRow = {
  platformId: number; inv: string; vendor: string; co: string; amount: string; status: string;
  originalPin: string; pcm: string; linked: boolean; blocker: string | null;
};
type Parked = { inv: string; vendor: string; amt: string; state: string; queue: string; queueNote: string };

/** Credits: each credit memo reverses a specific purchase invoice. Sage builds the
 * PCM from that invoice's lines, so the original PIN is what the queue is about.
 * One table — the credit's own columns, not a generic invoice list repeated. */
export default function CreditPanel() {
  const { set } = useApp();
  const { data } = useQuery({
    queryKey: ["credit-view"],
    queryFn: () => api.get<{ rows: CreditRow[]; awaitingReference: number; parked: Parked[] }>("/credits/credits"),
  });
  if (!data) return null;

  const cols: [string, string][] = [
    ["Platform ID", "84px"], ["Credit document", "138px"], ["Vendor", "1"], ["Co.", "44px"],
    ["Amount", "112px"], ["Status", "112px"], ["Reverses (original PIN)", "158px"],
    ["Credit memo in Sage", "138px"], ["", "1"],
  ];

  return (
    <div style={css("display: flex; flex-direction: column; gap: 14px;")}>
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
        <div style={css("padding: 11px 16px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE; display: flex; align-items: center; gap: 10px;")}>
          <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>Credit memos · what each one reverses</span>
          {data.awaitingReference > 0 && (
            <span style={css("font-size: 10px; font-weight: 700; color: #8A6D05; background: #FDF6E3; padding: 3px 9px; border-radius: 999px;")}>
              {data.awaitingReference} awaiting an original invoice
            </span>
          )}
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
              <span style={css(`width: 112px; flex: none; font-family: ${MONO}; font-size: 11.5px; font-weight: 700; color: #B23413; padding-right: 10px;`)}>{r.amount}</span>
              <span style={css("width: 112px; flex: none; padding-right: 10px;")}>
                <span style={css(`font-size: 9.5px; font-weight: 700; color: ${sm[0]}; background: ${sm[1]}; padding: 2px 8px; border-radius: 999px;`)}>{r.status}</span>
              </span>
              <span style={css("width: 158px; flex: none; padding-right: 10px;")}>
                {r.linked
                  ? <span style={css(`font-family: ${MONO}; font-size: 11px; font-weight: 600; color: #177C53;`)}>{r.originalPin}</span>
                  : <span style={css("font-size: 10px; font-weight: 700; color: #8A6D05; background: #FDF6E3; padding: 2px 8px; border-radius: 999px;")}>⚠ not referenced</span>}
              </span>
              <span style={css(`width: 138px; flex: none; font-family: ${MONO}; font-size: 11px; color: ${r.pcm === "—" ? "#5B6788" : "#177C53"}; font-weight: 600; padding-right: 10px;`)}>{r.pcm}</span>
              <span style={css("flex: 1; font-size: 10.5px; color: #8A6D05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{r.blocker || ""}</span>
            </Box>
          );
        })}
      </div>

      {/* Provisional invoices AP has parked until their credit and rebill arrive.
       * One list, with the park queue as a column. */}
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
        <div style={css("padding: 11px 16px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE;")}>
          <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700;")}>Parked invoices · held until the credit and rebill arrive</span>
        </div>
        <div style={css("display: flex; gap: 10px; padding: 8px 16px; background: #FBFBFE; border-bottom: 1px solid #EDEFF6;")}>
          {([["Document", "100px"], ["Vendor", "1"], ["Provisional amount", "112px"], ["Park queue", "190px"], ["State", "104px"]] as [string, string][]).map(([t, wd], i) => (
            <span key={i} style={css(`${wd === "1" ? "flex: 1;" : `width: ${wd}; flex: none;`} font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5571;`)}>{t}</span>
          ))}
        </div>
        {data.parked.map((pk, j) => (
          <div key={j} style={css("display: flex; gap: 10px; padding: 9px 16px; border-bottom: 1px solid #F2F3F9; align-items: center;")}>
            <span style={css(`font-family: ${MONO}; font-size: 11.5px; color: #2E3391; width: 100px; flex: none;`)}>{pk.inv}</span>
            <span style={css("font-size: 12px; font-weight: 700; color: #14163C; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{pk.vendor}</span>
            <span style={css(`font-family: ${MONO}; font-size: 11.5px; font-weight: 700; width: 112px; flex: none;`)}>{pk.amt}</span>
            <span style={css("font-size: 11px; color: #4C5571; width: 190px; flex: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")} title={pk.queueNote}>{pk.queue}</span>
            <span style={css("font-size: 9.5px; font-weight: 700; color: #8A6D05; background: #FDF6E3; padding: 2px 8px; border-radius: 999px; white-space: nowrap;")}>{pk.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
