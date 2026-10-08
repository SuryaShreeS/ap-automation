"use client";

import { useQuery } from "@tanstack/react-query";
import Box from "../Box";
import ApprovalCards from "./Approvals";
import ReviewCards from "./ApFinalReview";
import Prepayments from "./Prepayments";
import CreditPanel from "./CreditPanel";
import RebillPanel from "./RebillPanel";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";
import { money, statusMeta } from "@/lib/tone";

const MONO = "'JetBrains Mono', monospace";

type Bucket = { key: string; label: string; count: number; filters: { values: Record<string, string> } };
type QueueDetail = {
  queue: string; label: string; description: string;
  buckets: Bucket[];
  rows: any[];
};

/** One processing queue (selected in the sidebar): its lifecycle sub-queues,
 * with Approvals / AP Review handled INSIDE the queue, plus queue-specific
 * panels (prepayment positions, settlement chain). */
export default function ProcessingQueues() {
  const { state, set } = useApp();
  const q = state.procQueue;
  const bucket = state.procBucket;

  const { data } = useQuery({
    queryKey: ["queues-v2", q],
    queryFn: () => api.get<QueueDetail>(`/queues-v2/${q}`),
  });

  // Sub-queue rows come through /search with the bucket's OWN filters — the same
  // criteria that produced its count (virtual fields like awaiting-approval included).
  const activeBucket = (data?.buckets || []).find((b) => b.key === bucket);
  const cardBucket = bucket === "awaiting-approval" || bucket === "ap-review";
  // Credits and Rebills have their own table whose columns ARE the queue's job
  // (what a credit reverses; whether a rebill's chain is provable). Showing the
  // generic invoice list above it listed the same documents twice.
  const ownTable = bucket === "all" && (q === "CREDIT" || q === "REBILL");
  const { data: bucketRows } = useQuery({
    queryKey: ["queues-v2", q, bucket, JSON.stringify(activeBucket?.filters || {})],
    queryFn: () =>
      api.post<{ rows: any[] }>("/search", {
        criteria: Object.entries(activeBucket!.filters.values).map(([field, value]) => ({ field, op: "=", value })),
        sortField: "platformId", sortDir: "desc", pageSize: 1000,
      }),
    enabled: bucket !== "all" && !cardBucket && !!activeBucket,
  });

  const shownRows = bucket === "all" ? (data?.rows || []) : (bucketRows?.rows || []).map((r) => ({
    ...r, routeReason: r.routeReason || "", extracted: r.extracted !== false,
  }));

  return (
    <div style={css("padding: 18px 22px; display: flex; flex-direction: column; gap: 12px;")}>
      {/* Status sub-queues */}
      <div style={css("display: flex; gap: 6px; flex-wrap: wrap; align-items: center;")}>
        <span style={css("font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #5B6788;")}>Sub-queues:</span>
        {(data?.buckets || []).map((b) => {
          const on = bucket === b.key;
          return (
            <Box key={b.key} onClick={() => set({ procBucket: b.key })}
                 style={`display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; padding: 4px 11px; border-radius: 999px; cursor: pointer; border: 1px solid ${on ? "#2E3391" : "#DEE2EE"}; color: ${on ? "#fff" : b.count ? "#4C5571" : "#5B6788"}; background: ${on ? "#2E3391" : "#fff"};`}
                 hoverStyle={on ? "" : "border-color: #A9B2CC"}>
              {b.label}
              <span style={css(`font-family: ${MONO}; font-size: 10px; opacity: 0.85;`)}>{b.count}</span>
            </Box>
          );
        })}
      </div>

      {/* Approvals / AP Final Review are worked INSIDE the queue */}
      {bucket === "awaiting-approval" && <ApprovalCards queue={q} />}
      {bucket === "ap-review" && <ReviewCards queue={q} />}

      {/* Rows (All-at-once by default, status visible) */}
      {!cardBucket && !ownTable && (
        <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 12px; overflow: hidden;")}>
          <div style={css("display: flex; padding: 8px 16px; background: #FBFBFE; border-bottom: 1px solid #DEE2EE;")}>
            {[["Platform ID", "88px"], ["Document", "150px"], ["Vendor", "1"], ["Co.", "110px"], ["Gross", "118px"], ["PO", "110px"], ["PIN (Sage)", "104px"], ["Status", "118px"], ["Flow", "1.1"]].map(([t, wd], i) => (
              <span key={i} style={css(`${wd === "1" || wd === "1.1" ? `flex: ${wd};` : `width: ${wd}; flex: none;`} font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5571; padding-right: 10px;`)}>{t}</span>
            ))}
          </div>
          {shownRows.length === 0 && <div style={css("padding: 22px 16px; text-align: center; font-size: 12px; color: #5B6788;")}>No documents in this sub-queue.</div>}
          {shownRows.map((r) => {
            const sm = statusMeta(r.status);
            return (
              <Box key={r.invoiceNumber} onClick={() => set({ screen: "detail", detailId: r.invoiceNumber, detailTab: "lines" })}
                   style="display: flex; align-items: center; padding: 7px 16px; border-bottom: 1px solid #F2F3F9; cursor: pointer;" hoverStyle="background: #F6F7FB">
                <span style={css(`width: 88px; flex: none; font-family: ${MONO}; font-size: 11px; color: #2E3391; font-weight: 600; padding-right: 10px;`)}>{r.platformId}</span>
                <span style={css(`width: 150px; flex: none; font-family: ${MONO}; font-size: 11.5px; color: #14163C; font-weight: 600; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>{r.invoiceNumber}</span>
                <span style={css("flex: 1; font-size: 12px; font-weight: 700; color: #14163C; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{r.vendorName}</span>
                <span style={css("width: 110px; flex: none; font-size: 11px; color: #4C5571; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{r.co} · {r.coName}</span>
                <span style={css(`width: 118px; flex: none; font-family: ${MONO}; font-size: 11.5px; font-weight: 700; color: ${r.gross < 0 ? "#B23413" : "#14163C"}; padding-right: 10px;`)}>{money(r.gross)}</span>
                <span style={css(`width: 110px; flex: none; font-family: ${MONO}; font-size: 11px; color: ${r.po === "—" ? "#5B6788" : "#2E3391"}; padding-right: 10px;`)}>{r.po}</span>
                <span style={css(`width: 104px; flex: none; font-family: ${MONO}; font-size: 11px; color: ${r.erpVoucher === "—" ? "#5B6788" : "#177C53"}; font-weight: 600; padding-right: 10px;`)}>{r.erpVoucher}</span>
                <span style={css(`width: 118px; flex: none; padding-right: 10px;`)}>
                  <span style={css(`font-size: 9.5px; font-weight: 700; color: ${sm[0]}; background: ${sm[1]}; padding: 2px 8px; border-radius: 999px;`)}>{r.status}</span>
                </span>
                <span style={css("flex: 1.1; font-size: 10px; color: #5B6788; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")} title={r.routeReason}>
                  {r.extracted ? "" : "⏳ awaiting extraction · "}{r.routeReason}
                </span>
              </Box>
            );
          })}
        </div>
      )}

      {/* Queue-specific panels (default view only) */}
      {bucket === "all" && q === "PREPAY" && <Prepayments embedded />}
      {bucket === "all" && q === "CREDIT" && <CreditPanel />}
      {bucket === "all" && q === "REBILL" && <RebillPanel />}
    </div>
  );
}
