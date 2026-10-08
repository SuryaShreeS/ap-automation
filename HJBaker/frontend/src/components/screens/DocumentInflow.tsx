"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Box from "../Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";

const MONO = "'JetBrains Mono', monospace";

type Doc = {
  invoiceNumber: string; vendorName: string; co: string; gross: number; pagesN: number;
  scanDate: string; queue: string; classLabel: string; classConfidence: number | null;
  routeReason: string; extracted: boolean; docType: string;
};
type Inflow = {
  threshold: number;
  incoming: Doc[];
  review: Doc[];
  counts: { incoming: number; review: number; routed: number };
};
type Email = {
  from: string; to: string; received: string; subject: string;
  body: string[]; attachment: { name: string; pages: number; size: string };
};

const QUEUE_CHIP: Record<string, [string, string, string]> = {
  PO: ["#2E3391", "#ECEDF7", "PO"], NONPO: ["#4C5571", "#EDEFF6", "Non-PO"],
  PREPAY: ["#177C53", "#EAF7F1", "Prepayments"], CREDIT: ["#B23413", "#FDEDE7", "Credits"],
  REBILL: ["#8A6D05", "#FDF6E3", "Rebills"],
  MASTER: ["#6B7493", "#EDEFF6", "Master"], MANUAL_REVIEW: ["#8A6D05", "#FDF6E3", "⚠ Manual review"],
};
/** The five document types, in business language, with what each one means.
 * Manual Review asks for the TYPE — the queue follows from it. */
const DOC_TYPES: { queue: string; name: string; hint: string }[] = [
  { queue: "PO", name: "PO invoice", hint: "Quotes a purchase order" },
  { queue: "NONPO", name: "Non-PO invoice", hint: "No purchase order on it" },
  { queue: "PREPAY", name: "Prepayment", hint: "Paid before shipment" },
  { queue: "CREDIT", name: "Credit", hint: "Cancellation, negative total" },
  { queue: "REBILL", name: "Rebill", hint: "Re-invoice at settled price" },
];

/** The classifier's own label maps to the type it was leaning towards, so the
 * processor can accept the suggestion instead of re-deciding from scratch. */
const LABEL_TO_QUEUE: Record<string, string> = {
  po_invoice: "PO", nonpo_invoice: "NONPO", prepayment: "PREPAY",
  credit: "CREDIT", rebill: "REBILL",
};

/** Inflow (Classifier): every document arrives by email, is classified on arrival,
 * and routes to its queue — or waits in Manual Review below the threshold.
 * Clicking a document opens the original email it arrived on. */
export default function DocumentInflow() {
  const { state, set } = useApp();
  const [emailFor, setEmailFor] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["inflow"], queryFn: () => api.get<Inflow>("/inflow") });

  if (!data) return null;
  const tab = state.inflowTab;
  const rows = tab === "review" ? data.review : data.incoming;

  const confChip = (d: Doc) => {
    if (d.classConfidence == null)
      return <span style={css("font-size: 10px; font-weight: 700; color: #4C5571; background: #EDEFF6; padding: 2px 9px; border-radius: 999px;")}>⏳ awaiting classification</span>;
    const ok = d.classConfidence >= data.threshold;
    return (
      <span style={css(`font-size: 10px; font-weight: 700; color: ${ok ? "#177C53" : "#8A6D05"}; background: ${ok ? "#EAF7F1" : "#FDF6E3"}; padding: 2px 9px; border-radius: 999px;`)}>
        {d.classLabel || "?"} · {Math.round(d.classConfidence * 100)}%{ok ? "" : " ▼"}
      </span>
    );
  };
  const queueChip = (d: Doc) => {
    const [fg, bg, label] = QUEUE_CHIP[d.queue] || QUEUE_CHIP.MASTER;
    return <span style={css(`font-size: 10px; font-weight: 700; color: ${fg}; background: ${bg}; padding: 2px 9px; border-radius: 999px; white-space: nowrap;`)}>{label}</span>;
  };

  return (
    <div style={css("padding: 18px 22px; display: flex; flex-direction: column; gap: 14px;")}>
      {/* Stat strip */}
      <div style={css("display: flex; align-items: center; gap: 12px; flex-wrap: wrap;")}>
        {[
          ["Documents received", data.counts.incoming, "#14163C"],
          ["Auto-routed", data.counts.routed, "#177C53"],
          ["Manual review", data.counts.review, "#8A6D05"],
        ].map(([label, n, color]) => (
          <div key={label as string} style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 12px; padding: 10px 16px; min-width: 130px;")}>
            <div style={css(`font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; color: ${color};`)}>{n}</div>
            <div style={css("font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #5B6788;")}>{label}</div>
          </div>
        ))}
        <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 12px; padding: 10px 16px;")}>
          <div style={css(`font-family: ${MONO}; font-size: 22px; font-weight: 700; color: #2E3391;`)}>{Math.round(data.threshold * 100)}%</div>
          <div style={css("font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #5B6788;")}>Confidence threshold</div>
        </div>
        <div style={css("flex: 1;")} />
        <span style={css("font-size: 11px; color: #5B6788;")}>📧 ap@alferix.com · monitored mailbox</span>
      </div>

      {/* Tabs */}
      <div style={css("display: flex; gap: 3px; background: #fff; border: 1px solid #DEE2EE; border-radius: 10px; padding: 4px; align-self: flex-start;")}>
        {[["incoming", `Incoming (${data.counts.incoming})`], ["review", `Manual Review (${data.counts.review})`]].map(([k, label]) => (
          <div key={k} onClick={() => set({ inflowTab: k })} style={css(`font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 7px; cursor: pointer; color: ${tab === k ? "#fff" : "#6B7493"}; background: ${tab === k ? (k === "review" ? "#B8860B" : "#2E3391") : "transparent"};`)}>{label}</div>
        ))}
      </div>

      {/* Table — Incoming is the intake log; Manual Review adds row actions */}
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; overflow: hidden;")}>
        <div style={css("display: flex; padding: 9px 16px; background: #FBFBFE; border-bottom: 1px solid #DEE2EE;")}>
          {([["Received", "78px"], ["Document", "150px"], ["Vendor", "1"], ["Co.", "44px"], ["Amount", "116px"], ["Pages", "44px"], ["Classification", "168px"],
            tab === "review" ? ["Held because", "1.4"] : ["Routed to", "128px"],
            ...(tab === "review" ? [["", "196px"] as [string, string]] : [])] as [string, string][]).map(([t, wd], i) => (
            <span key={i} style={css(`${wd.endsWith("px") ? `width: ${wd}; flex: none;` : `flex: ${wd};`} font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5571; padding-right: 10px;`)}>{t}</span>
          ))}
        </div>
        {rows.length === 0 && (
          <div style={css("padding: 26px 16px; text-align: center; font-size: 12px; color: #5B6788;")}>
            {tab === "review" ? "Nothing waiting for manual review." : "No documents received yet."}
          </div>
        )}
        {rows.map((d) => (
          <Box key={d.invoiceNumber} onClick={() => setEmailFor(d.invoiceNumber)}
               style="display: flex; align-items: center; padding: 8px 16px; border-bottom: 1px solid #F2F3F9; cursor: pointer;"
               hoverStyle="background: #F6F7FB">
            <span style={css(`width: 78px; flex: none; font-family: ${MONO}; font-size: 11px; color: #4C5571; padding-right: 10px;`)}>{d.scanDate}</span>
            <span style={css(`width: 150px; flex: none; font-family: ${MONO}; font-size: 11.5px; font-weight: 600; color: #2E3391; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>✉ {d.invoiceNumber}</span>
            <span style={css("flex: 1; min-width: 130px; font-size: 12px; font-weight: 700; color: #14163C; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{d.vendorName}</span>
            <span style={css(`width: 44px; flex: none; font-family: ${MONO}; font-size: 11px; color: #4C5571;`)}>{d.co}</span>
            <span style={css(`width: 116px; flex: none; font-family: ${MONO}; font-size: 11.5px; color: ${d.gross < 0 ? "#B23413" : "#14163C"}; font-weight: 600; padding-right: 10px;`)}>
              {d.gross < 0 ? `($${Math.abs(d.gross).toLocaleString()})` : `$${d.gross.toLocaleString()}`}
            </span>
            <span style={css(`width: 44px; flex: none; font-family: ${MONO}; font-size: 11px; color: #4C5571;`)}>{d.pagesN}p</span>
            <span style={css("width: 168px; flex: none; padding-right: 10px;")}>{confChip(d)}</span>
            {tab === "review" ? (
              <>
                <span title={d.routeReason} style={css("flex: 1.4; font-size: 10.5px; color: #8A6D05; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{d.routeReason}</span>
                <span style={css("width: 196px; flex: none; display: flex; gap: 7px; justify-content: flex-end;")}
                      onClick={(e: any) => e.stopPropagation()}>
                  <Box onClick={() => setEmailFor(d.invoiceNumber)}
                       style="font-size: 10.5px; font-weight: 700; color: #4C5571; background: #EDEFF6; padding: 5px 11px; border-radius: 7px; cursor: pointer; white-space: nowrap;"
                       hoverStyle="background: #DFE3F0">✉ Email</Box>
                  <Box onClick={() => set({ screen: "classify", classifyId: d.invoiceNumber })}
                       style="font-size: 10.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 5px 13px; border-radius: 7px; cursor: pointer; white-space: nowrap;"
                       hoverStyle="background: #262A78">Classify ›</Box>
                </span>
              </>
            ) : (
              <span style={css("width: 128px; flex: none;")}>{queueChip(d)}</span>
            )}
          </Box>
        ))}
      </div>

      {emailFor && <EmailModal inv={emailFor} onClose={() => setEmailFor(null)} />}
    </div>
  );
}

/** The original email a document arrived on — the intake source of record. */
export function EmailModal({ inv, onClose }: { inv: string; onClose: () => void }) {
  const { set } = useApp();
  const { data: email } = useQuery({
    queryKey: ["inflow-email", inv],
    queryFn: () => api.get<Email>(`/inflow/email/${encodeURIComponent(inv)}`),
  });

  return (
    <div onClick={onClose} style={css("position: fixed; inset: 0; background: rgba(10,15,28,0.45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 24px;")}>
      <div onClick={(e) => e.stopPropagation()} style={css("background: #fff; border-radius: 16px; width: 640px; max-width: 100%; max-height: 86vh; overflow-y: auto; box-shadow: 0 24px 64px rgba(10,15,28,0.35);")}>
        <div style={css("padding: 13px 20px; border-bottom: 1px solid #DEE2EE; display: flex; align-items: center; gap: 10px; background: #F6F7FB; border-radius: 16px 16px 0 0;")}>
          <span style={css("font-size: 15px;")}>✉</span>
          <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>Original email · {inv}</span>
          <Box onClick={onClose} style="font-size: 14px; font-weight: 700; color: #4C5571; padding: 2px 9px; border-radius: 7px; cursor: pointer;" hoverStyle="background: #EDEFF6; color: #14163C">✕</Box>
        </div>
        {email ? (
          <>
            <div style={css("padding: 13px 20px; border-bottom: 1px solid #EDEFF6; font-size: 11.5px; color: #4C5571; display: flex; flex-direction: column; gap: 3px;")}>
              <div><strong style={css("color: #14163C;")}>From:</strong> <span style={css(`font-family: ${MONO};`)}>{email.from}</span></div>
              <div><strong style={css("color: #14163C;")}>To:</strong> <span style={css(`font-family: ${MONO};`)}>{email.to}</span></div>
              <div><strong style={css("color: #14163C;")}>Received:</strong> {email.received}</div>
              <div style={css("font-size: 12.5px; font-weight: 700; color: #14163C; margin-top: 4px;")}>{email.subject}</div>
            </div>
            <div style={css("padding: 16px 20px; display: flex; flex-direction: column; gap: 11px;")}>
              {email.body.map((p, i) => (
                <div key={i} style={css("font-size: 12.5px; line-height: 1.6; color: #353D57;")}>{p}</div>
              ))}
              <div style={css("font-size: 12px; color: #4C5571;")}>Regards,<br />Accounts Receivable</div>
              <div style={css("display: flex; align-items: center; gap: 9px; border: 1px solid #DEE2EE; background: #FBFBFE; border-radius: 10px; padding: 9px 13px;")}>
                <span style={css("font-size: 15px;")}>📎</span>
                <span style={css(`font-family: ${MONO}; font-size: 11.5px; font-weight: 600; color: #2E3391; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>{email.attachment.name}</span>
                <span style={css("font-size: 10.5px; color: #5B6788;")}>{email.attachment.pages}p · {email.attachment.size}</span>
              </div>
            </div>
            <div style={css("padding: 12px 20px 16px; display: flex; gap: 8px; justify-content: flex-end;")}>
              <Box onClick={onClose} style="font-size: 11.5px; font-weight: 700; color: #4C5571; background: #EDEFF6; padding: 7px 15px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #DFE3F0">Close</Box>
              <Box onClick={() => { onClose(); set({ screen: "detail", detailId: inv, detailTab: "lines" }); }}
                   style="font-size: 11.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 7px 15px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Open document record ›</Box>
            </div>
          </>
        ) : (
          <div style={css("padding: 30px; text-align: center; font-size: 12px; color: #5B6788;")}>Loading…</div>
        )}
      </div>
    </div>
  );
}
