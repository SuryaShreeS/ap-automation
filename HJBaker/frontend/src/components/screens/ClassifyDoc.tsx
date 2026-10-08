"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Box from "../Box";
import { PdfViewer } from "./InvoiceDetail";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";

const MONO = "'JetBrains Mono', monospace";

type Doc = {
  invoiceNumber: string; vendorName: string; co: string; gross: number; pagesN: number;
  scanDate: string; classLabel: string; classConfidence: number | null; routeReason: string;
};
type Inflow = { threshold: number; review: Doc[] };

/** The five document types in business language. Choosing one classifies the
 * document; the processing queue follows from the type. */
const DOC_TYPES: { queue: string; name: string; hint: string }[] = [
  { queue: "PO", name: "PO invoice", hint: "Quotes a purchase order that already exists in Sage" },
  { queue: "NONPO", name: "Non-PO invoice", hint: "No purchase order — a late PO, or a supplier that never has one" },
  { queue: "PREPAY", name: "Prepayment", hint: "Paid before shipment; drawn down by later invoices" },
  { queue: "CREDIT", name: "Credit", hint: "Cancellation reversing an invoice already booked" },
  { queue: "REBILL", name: "Rebill", hint: "Re-invoice at the settled price after a netback" },
];
const LABEL_TO_QUEUE: Record<string, string> = {
  po_invoice: "PO", nonpo_invoice: "NONPO", prepayment: "PREPAY", credit: "CREDIT", rebill: "REBILL",
};
/** Queue names as they read in the sidebar, for the confirmation message. */
const QUEUE_NAME: Record<string, string> = {
  PO: "PO", NONPO: "Non-PO", PREPAY: "Prepayments", CREDIT: "Credits", REBILL: "Rebills",
};

/** Classification workspace: the document on one side, the type choices on the
 * other, and Previous / Next to work through the manual-review queue without
 * going back to the list between documents. */
export default function ClassifyDoc() {
  const { state, set, toast } = useApp();
  const qc = useQueryClient();
  const id = state.classifyId;
  // Picking a type only selects it; Confirm is what classifies and advances.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [id]);

  const { data: inflow } = useQuery({ queryKey: ["inflow"], queryFn: () => api.get<Inflow>("/inflow") });
  const { data: detail } = useQuery({
    queryKey: ["detail", id],
    queryFn: () => api.get<any>(`/invoices/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });

  if (!inflow || !id) return null;
  const queue = inflow.review;
  const idx = queue.findIndex((d) => d.invoiceNumber === id);
  const doc = idx >= 0 ? queue[idx] : null;

  const goto = (n: number) => {
    const t = queue[Math.min(Math.max(0, n), queue.length - 1)];
    if (t) set({ classifyId: t.invoiceNumber });
  };
  const back = () => set({ screen: "inflow", inflowTab: "review", classifyId: null });

  const confirm = async () => {
    if (!picked) return;
    const name = DOC_TYPES.find((t) => t.queue === picked)!.name;
    try {
      await api.post(`/inflow/route/${encodeURIComponent(id)}`, { queue: picked });
      toast(`${id} classified as ${name} — routed to ${QUEUE_NAME[picked]}.`);
      for (const key of ["inflow", "queues-v2", "home", "overview", "audit", "search", "flow", "detail"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      // Stay on the workspace and advance to the next held document; when the
      // queue empties there is nothing left to classify, so go back to the list.
      const fresh = await api.get<Inflow>("/inflow");
      qc.setQueryData(["inflow"], fresh);
      const remaining = fresh.review;
      if (!remaining.length) { back(); return; }
      set({ classifyId: remaining[Math.min(idx, remaining.length - 1)].invoiceNumber });
    } catch (e: any) {
      toast(e.message);
    }
  };

  if (!doc) {
    return (
      <div style={css("padding: 40px 22px; text-align: center; display: flex; flex-direction: column; gap: 14px; align-items: center;")}>
        <div style={css("font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700;")}>Nothing left to classify.</div>
        <Box onClick={back} style="font-size: 12px; font-weight: 700; color: #fff; background: #2E3391; padding: 8px 16px; border-radius: 9px; cursor: pointer;" hoverStyle="background: #262A78">Back to Inflow ›</Box>
      </div>
    );
  }

  const suggested = LABEL_TO_QUEUE[doc.classLabel] || "";
  const pct = doc.classConfidence == null ? null : Math.round(doc.classConfidence * 100);

  return (
    <div style={css("height: 100%; display: flex; flex-direction: column;")}>
      {/* Top bar — same navigation model as Invoice Detail */}
      <div style={css("flex: none; background: #fff; border-bottom: 1px solid #DEE2EE; padding: 9px 22px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;")}>
        <Box onClick={back}
             style="font-size: 11.5px; font-weight: 700; color: #4C5571; background: #EDEFF6; padding: 6px 12px; border-radius: 8px; cursor: pointer;"
             hoverStyle="background: #DFE3F0">‹ Back</Box>
        <div style={css("width: 1px; height: 18px; background: #DEE2EE;")} />
        <div onClick={() => goto(idx - 1)} style={css(`font-size: 12px; font-weight: 700; cursor: pointer; color: ${idx === 0 ? "#A9B2CC" : "#2E3391"};`)}>‹ Previous</div>
        <span style={css(`font-family: ${MONO}; font-size: 10.5px; color: #5B6788;`)}>Document {idx + 1} of {queue.length} in manual review</span>
        <div onClick={() => goto(idx + 1)} style={css(`font-size: 12px; font-weight: 700; cursor: pointer; color: ${idx === queue.length - 1 ? "#A9B2CC" : "#2E3391"};`)}>Next ›</div>
        <div style={css("width: 1px; height: 18px; background: #DEE2EE;")} />
        <span style={css(`font-family: ${MONO}; font-size: 13px; font-weight: 600;`)}>{doc.invoiceNumber}</span>
        <span style={css("font-size: 12.5px; font-weight: 700;")}>{doc.vendorName}</span>
        <span style={css("font-size: 10px; font-weight: 700; color: #8A6D05; background: #FDF6E3; padding: 3px 9px; border-radius: 999px;")}>⚠ Awaiting classification</span>
      </div>

      {/* LEFT: the decision · RIGHT: the document */}
      <div style={css("flex: 1; display: flex; min-height: 0; position: relative;")}>
        <div style={css("width: 430px; flex: none; min-width: 0; overflow-y: auto; background: #fff; border-right: 1px solid #DEE2EE; padding: 16px 18px 76px; display: flex; flex-direction: column; gap: 16px;")}>

          {/* why it stopped */}
          <div style={css("background: #FDF6E3; border: 1px solid #EFD48B; border-radius: 10px; padding: 11px 13px; display: flex; flex-direction: column; gap: 5px;")}>
            <span style={css("font-size: 10px; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase; color: #8A6D05;")}>Why it stopped here</span>
            <span style={css("font-size: 12px; color: #8A6D05; line-height: 1.5;")}>
              Best guess <strong>{doc.classLabel || "unknown"}</strong> at <strong>{pct}%</strong>, below the {Math.round(inflow.threshold * 100)}% threshold. {doc.routeReason}
            </span>
          </div>

          {/* what arrived */}
          <div style={css("display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 12px;")}>
            {([["Vendor", doc.vendorName], ["Company", doc.co],
               ["Amount", doc.gross < 0 ? `($${Math.abs(doc.gross).toLocaleString()})` : `$${doc.gross.toLocaleString()}`],
               ["Pages", `${doc.pagesN}`], ["Received", doc.scanDate]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={css("display: contents;")}>
                <span style={css("font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #5B6788; padding-top: 2px;")}>{k}</span>
                <span style={css(`font-weight: 600; color: ${k === "Amount" && doc.gross < 0 ? "#B23413" : "#14163C"};`)}>{v}</span>
              </div>
            ))}
          </div>

          {/* the decision — select one, then confirm */}
          <div style={css("display: flex; flex-direction: column; gap: 9px;")}>
            <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700;")}>What kind of document is this?</span>
            {DOC_TYPES.map((t) => {
              const isGuess = t.queue === suggested;
              const isPicked = picked === t.queue;
              return (
                <Box key={t.queue} onClick={() => setPicked(t.queue)}
                     style={`display: flex; align-items: flex-start; gap: 11px; text-align: left; padding: 11px 14px; border-radius: 10px; cursor: pointer; border: ${isPicked ? "2px solid #2E3391" : "1px solid #DEE2EE"}; background: ${isPicked ? "#ECEDF7" : "#fff"}; padding: ${isPicked ? "10px 13px" : "11px 14px"};`}
                     hoverStyle={isPicked ? "" : "border: 1px solid #A9B2CC; background: #FBFBFE"}>
                  {/* radio affordance so the selected state is unmistakable */}
                  <span style={css(`width: 15px; height: 15px; border-radius: 999px; flex: none; margin-top: 2px; border: ${isPicked ? "5px solid #2E3391" : "1.5px solid #A9B2CC"}; background: #fff;`)} />
                  <span style={css("display: flex; flex-direction: column; gap: 2px; min-width: 0;")}>
                    <span style={css("display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; color: #14163C;")}>
                      {t.name}
                      {isGuess && <span style={css("font-size: 9px; font-weight: 700; color: #2E3391; background: #D7D9EE; padding: 1px 7px; border-radius: 999px;")}>SUGGESTED</span>}
                    </span>
                    <span style={css("font-size: 11px; color: #4C5571; line-height: 1.45;")}>{t.hint}</span>
                  </span>
                </Box>
              );
            })}
          </div>
        </div>

        {/* confirm bar — pinned to the bottom of the decision panel */}
        <div style={css("position: absolute; left: 0; bottom: 0; width: 430px; background: #fff; border-top: 1px solid #DEE2EE; border-right: 1px solid #DEE2EE; padding: 12px 18px; display: flex; align-items: center; gap: 12px;")}>
          <span style={css("flex: 1; font-size: 11.5px; color: #4C5571; min-width: 0;")}>
            {picked
              ? <>Classifying as <strong style={css("color: #14163C;")}>{DOC_TYPES.find((t) => t.queue === picked)!.name}</strong></>
              : "Select a document type"}
          </span>
          <Box onClick={picked ? confirm : undefined}
               style={`font-size: 12px; font-weight: 700; padding: 9px 20px; border-radius: 9px; white-space: nowrap; ${picked ? "color: #fff; background: #2E3391; cursor: pointer;" : "color: #97A0BC; background: #EDEFF6; cursor: not-allowed;"}`}
               hoverStyle={picked ? "background: #262A78" : ""}>
            Confirm{idx < queue.length - 1 ? " and next ›" : ""}
          </Box>
        </div>

        {/* the document itself */}
        {detail ? (
          <PdfViewer inv={detail.invoice} po={detail.invoice.po} coName={detail.coName} sel={null} setSel={() => {}} />
        ) : (
          <div style={css("flex: 1; display: flex; align-items: center; justify-content: center; background: #232A40; color: #A7B2CE; font-size: 12px;")}>Loading document…</div>
        )}
      </div>
    </div>
  );
}
