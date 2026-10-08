"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Box from "../Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";

type RvRow = {
  inv: string; vendor: string; amount: string; rule: string; why: string;
  decided: boolean; state: string | null; decidedMsg: string; queue: string;
};

/** AP Final Review cards — rendered inside a processing queue's "AP Review"
 * sub-queue (FR-44). `queue` scopes the list to that queue's documents. */
export default function ReviewCards({ queue }: { queue: string }) {
  const { toast } = useApp();
  const qc = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const { data } = useQuery({ queryKey: ["ap-review"], queryFn: () => api.get<{ rows: RvRow[] }>("/ap-review") });
  const rows = (data?.rows || []).filter((r) => r.queue === queue);

  const act = async (inv: string, action: "release" | "sendback") => {
    try {
      const r = await api.post<{ flowSummary?: string[] }>(`/ap-review/${encodeURIComponent(inv)}/action`, { action, reason: reasons[inv] || "" });
      // Release lets the engine continue (PIN → In ERP → prepayment association…).
      for (const key of ["ap-review", "flow", "detail", "approvals", "prepayments", "credits",
                         "overview-matrix", "overview", "home", "audit", "queues-v2", "inflow", "search", "nav"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      (r.flowSummary || []).forEach((m) => toast("⚙ " + m));
    } catch (e: any) {
      toast(e.message);
    }
  };

  return (
    <div style={css("display: flex; flex-direction: column; gap: 11px;")}>
      {rows.length === 0 && (
        <div style={css("background: #fff; border: 1px dashed #DEE2EE; border-radius: 13px; padding: 18px; text-align: center; font-size: 12px; color: #5B6788;")}>
          Nothing held for AP review in this queue.
        </div>
      )}
      {rows.map((rv) => (
        <div key={rv.inv} style={css(`background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; padding: 14px 20px; display: flex; flex-direction: column; gap: 9px; opacity: ${rv.decided ? "0.6" : "1"};`)}>
          <div style={css("display: flex; align-items: center; gap: 10px;")}>
            <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: #2E3391;")}>{rv.inv}</span>
            <span style={css("font-size: 12.5px; font-weight: 700;")}>{rv.vendor}</span>
            <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11.5px;")}>{rv.amount}</span>
            <div style={css("flex: 1;")} />
            <span style={css("font-size: 10px; font-weight: 700; color: #B23413; background: #FDEDE7; padding: 3px 9px; border-radius: 999px;")}>⚑ {rv.rule}</span>
          </div>
          <div style={css("font-size: 11.5px; color: #4C5571; line-height: 1.5;")}>{rv.why}</div>
          {rv.decided ? (
            <div style={css(`font-size: 12px; font-weight: 700; color: ${rv.state === "released" ? "#177C53" : "#B23413"};`)}>{rv.decidedMsg}</div>
          ) : (
            <div style={css("display: flex; gap: 8px; align-items: center;")}>
              <Box as="input" value={reasons[rv.inv] || ""} onChange={(e: any) => setReasons({ ...reasons, [rv.inv]: e.target.value })} placeholder="Send-back reason…" style="flex: 1; font-size: 12px; border: 1px solid #DEE2EE; border-radius: 8px; padding: 7px 11px; outline: none;" focusStyle="border-color: #2E3391" />
              <Box onClick={() => act(rv.inv, "sendback")} style="font-size: 12px; font-weight: 700; color: #B23413; background: #FDEDE7; padding: 7px 14px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #FBD8CC">Send back</Box>
              <Box onClick={() => act(rv.inv, "release")} style="font-size: 12px; font-weight: 700; color: #fff; background: #2E3391; padding: 7px 14px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Release to Sage ›</Box>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
