"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { css } from "@/lib/css";

type Event = { ts: string; invoiceNumber: string; actor: string; action: string; field: string; oldValue: string; newValue: string; message: string };

function shortTs(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function AuditLog() {
  const { data } = useQuery({ queryKey: ["audit"], queryFn: () => api.get<{ rows: Event[] }>("/audit"), refetchInterval: 4000 });
  const rows = data?.rows || [];

  return (
    <div style={css("padding: 18px 22px; display: flex; flex-direction: column; gap: 12px;")}>
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
        <div style={css("display: flex; padding: 9px 18px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE;")}>
          {[["Time", "150px"], ["Invoice", "110px"], ["Actor", "130px"], ["Action", "130px"], ["Detail", "1"]].map(([t, wd], i) => (
            <span key={i} style={css(`${wd === "1" ? "flex: 1;" : `width: ${wd}; flex: none;`} font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #4C5571; padding-right: 12px;`)}>{t}</span>
          ))}
        </div>
        {rows.length === 0 && <div style={css("padding: 20px 18px; font-size: 12px; color: #5B6788; text-align: center;")}>No audit events yet — edit an invoice, approve, or release to Sage to populate the log.</div>}
        {rows.map((e, i) => (
          <div key={i} style={css("display: flex; padding: 9px 18px; border-bottom: 1px solid #EDEFF6; align-items: center;")}>
            <span style={css("width: 150px; flex: none; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #4C5571; padding-right: 12px;")}>{shortTs(e.ts)}</span>
            <span style={css("width: 110px; flex: none; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #2E3391; padding-right: 12px;")}>{e.invoiceNumber || "—"}</span>
            <span style={css("width: 130px; flex: none; font-size: 11.5px; font-weight: 600; padding-right: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{e.actor}</span>
            <span style={css("width: 130px; flex: none; font-size: 10px; font-weight: 700; color: #2E3391; padding-right: 12px;")}>{e.action}</span>
            <span style={css("flex: 1; font-size: 11.5px; color: #4C5571; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
