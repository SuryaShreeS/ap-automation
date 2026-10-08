"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Box from "./Box";
import { EmailModal } from "./screens/DocumentInflow";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";

type Step = {
  key: string;
  label: string;
  fr: string;
  gate: boolean;
  state: "done" | "skipped" | "current" | "blocked" | "pending";
  detail: string;
  waitingOn?: string;
};
type Flow = {
  flowKind: string;
  queue: string;
  invoiceNumber: string;
  complete: boolean;
  steps: Step[];
  history: { step: string; message: string; actor: string }[];
};

/** The document type in plain business language — what this document *is*,
 * not which internal flow variant is running. */
const DOC_TYPE: Record<string, { name: string; note: string; fg: string; bg: string }> = {
  unrouted: { name: "Unclassified", note: "awaiting classification", fg: "#8A6D05", bg: "#FDF6E3" },
  PO: { name: "PO invoice", note: "matched against a purchase order", fg: "#2E3391", bg: "#ECEDF7" },
  NONPO: { name: "Non-PO invoice", note: "late PO or supplier invoice", fg: "#4C5571", bg: "#EDEFF6" },
  PREPAY: { name: "Prepayment", note: "shipment drawing down a prepayment", fg: "#177C53", bg: "#EAF7F1" },
  PREPAY_BULK: { name: "Prepayment", note: "bulk prepayment for a period", fg: "#177C53", bg: "#EAF7F1" },
  CREDIT: { name: "Credit", note: "reverses an invoice already booked", fg: "#B23413", bg: "#FDEDE7" },
  REBILL: { name: "Rebill", note: "re-invoice at the settled price", fg: "#8A6D05", bg: "#FDF6E3" },
};

type AuditRow = { ts: string; actor: string; action: string; field: string; message: string };

/** Audit actions in business language, for the document history. */
const ACTION_LABEL: Record<string, string> = {
  inflow: "Arrived in the mailbox",
  classified: "Classified",
  manual_route: "Classified by hand",
  flow_step: "Processing step",
  field_edit: "Field edited",
  create: "Created manually",
  note: "Note added",
  approval_approved: "Approved",
  approval_rejected: "Rejected",
  review_released: "Released to Sage",
  review_sentback: "Sent back by AP",
  po_attached: "Purchase order attached",
  pin_referenced: "Original PIN referenced",
  credit_referenced: "Credit memo tied to the rebill",
};

function whenText(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** How the one-line current status reads, by the state of the step it is on. */
const STATUS_TONE: Record<string, { icon: string; fg: string; bg: string; border: string }> = {
  done: { icon: "✓", fg: "#136B48", bg: "#EAF7F1", border: "#B6E2CE" },
  current: { icon: "●", fg: "#2E3391", bg: "#ECEDF7", border: "#C6C9E6" },
  blocked: { icon: "⏸", fg: "#8A6D05", bg: "#FDF6E3", border: "#EFD48B" },
  skipped: { icon: "→", fg: "#4C5571", bg: "#EDEFF6", border: "#DEE2EE" },
  pending: { icon: "○", fg: "#4C5571", bg: "#EDEFF6", border: "#DEE2EE" },
};

/** Step markers inside the history panel. */
const STEP_MARK: Record<string, { icon: string; fg: string; bg: string }> = {
  done: { icon: "✓", fg: "#fff", bg: "#198459" },
  skipped: { icon: "→", fg: "#4C5571", bg: "#E4E8F2" },
  current: { icon: "●", fg: "#fff", bg: "#2E3391" },
  blocked: { icon: "⏸", fg: "#8A6D05", bg: "#FBEECB" },
  pending: { icon: "○", fg: "#5B6788", bg: "#F2F3F9" },
};

/** The processing engine's pipeline for this document — inflow prefix + routed
 * queue flow, with Process / Run controls and inline gate resolution. */
export default function FlowStepper({ invoiceNumber }: { invoiceNumber: string }) {
  const { set, toast } = useApp();
  const qc = useQueryClient();
  const [poInput, setPoInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pcmInput, setPcmInput] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { data: flow } = useQuery({
    queryKey: ["flow", invoiceNumber],
    queryFn: () => api.get<Flow>(`/engine/flow/${encodeURIComponent(invoiceNumber)}`),
  });

  const refresh = () => {
    for (const key of ["flow", "detail", "approvals", "ap-review", "prepayments", "credits", "inflow",
                       "queues-v2", "overview-matrix", "overview", "home", "audit", "search", "nav"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const handle = (r: { executed: string[]; blocked: { label: string; detail: string } | null; flow: Flow }) => {
    refresh();
    if (r.executed.length) r.executed.forEach((m) => toast("⚙ " + m));
    if (r.blocked) toast(`⏸ ${r.blocked.label} — ${r.blocked.detail}`);
    else if (!r.executed.length && r.flow.complete) toast("Flow complete — nothing left to process.");
  };

  const act = async (mode: "step" | "run") => {
    handle(await api.post(`/engine/${mode}/${encodeURIComponent(invoiceNumber)}`));
  };
  const attachPo = async () => {
    try { handle(await api.post(`/engine/attach-po/${encodeURIComponent(invoiceNumber)}`, { po: poInput })); setPoInput(""); }
    catch (e: any) { toast(e.message); }
  };
  const supplierBp = async () => {
    try { handle(await api.post(`/engine/no-po/${encodeURIComponent(invoiceNumber)}`)); }
    catch (e: any) { toast(e.message); }
  };
  const setCreditMemo = async () => {
    try { handle(await api.post(`/engine/set-credit-memo/${encodeURIComponent(invoiceNumber)}`, { creditMemo: pcmInput })); setPcmInput(""); }
    catch (e: any) { toast(e.message); }
  };
  const setPin = async () => {
    try { handle(await api.post(`/engine/set-original-pin/${encodeURIComponent(invoiceNumber)}`, { pin: pinInput })); setPinInput(""); }
    catch (e: any) { toast(e.message); }
  };

  if (!flow) return null;
  const docType = DOC_TYPE[flow.flowKind] || DOC_TYPE.unrouted;
  const blockedStep = flow.steps.find((s) => s.state === "blocked");
  // One line, not a progress bar: where the document is right now. The full
  // step-by-step record lives in History.
  const active = flow.steps.find((s) => s.state === "blocked" || s.state === "current");
  const last = flow.steps[flow.steps.length - 1];
  const tone = STATUS_TONE[flow.complete || !active ? "done" : active.state];
  const statusLabel = flow.complete || !active ? "Complete" : active.label;
  const statusDetail =
    flow.complete || !active
      ? last ? `${last.label} · ${last.detail}` : "every step in this document's flow is finished"
      : active.state === "blocked" && active.waitingOn
      ? `waiting on ${active.waitingOn} — ${active.detail}`
      : active.detail;
  // Approvals / AP review live inside the document's own processing queue.
  const gateNav =
    blockedStep?.key === "approval"
      ? { label: "Open queue approvals ›", patch: { screen: "pqueues", procQueue: flow.queue, procBucket: "awaiting-approval" } }
      : blockedStep && ["ap_review", "ap_route"].includes(blockedStep.key)
      ? { label: "Open queue AP review ›", patch: { screen: "pqueues", procQueue: flow.queue, procBucket: "ap-review" } }
      : blockedStep?.key === "route"
      ? { label: "Open Inflow (Classifier) ›", patch: { screen: "inflow" } }
      : null;

  return (
    <div style={css("flex: none; background: #fff; border-bottom: 1px solid #DEE2EE; padding: 10px 22px 12px;")}>
      <div style={css("display: flex; align-items: center; gap: 10px; margin-bottom: 9px; flex-wrap: wrap;")}>
        <span style={css("font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #5B6788;")}>Document type</span>
        <span style={css(`font-size: 11.5px; font-weight: 700; color: ${docType.fg}; background: ${docType.bg}; padding: 3px 11px; border-radius: 999px;`)}>{docType.name}</span>
        <span style={css("font-size: 11px; color: #4C5571;")}>{docType.note}</span>
        {flow.complete && <span style={css("font-size: 10px; font-weight: 700; color: #177C53; background: #EAF7F1; padding: 2px 9px; border-radius: 999px;")}>✓ complete</span>}
        <div style={css("flex: 1;")} />
        <Box onClick={() => setShowEmail(true)}
             style="font-size: 11px; font-weight: 700; color: #4C5571; background: #EDEFF6; padding: 5px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap;"
             hoverStyle="background: #DFE3F0">✉ Email</Box>
        <Box onClick={() => setShowHistory(true)}
             style="font-size: 11px; font-weight: 700; color: #4C5571; background: #EDEFF6; padding: 5px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap;"
             hoverStyle="background: #DFE3F0">⧗ History</Box>
        {gateNav && (
          <Box onClick={() => set(gateNav.patch)} style="font-size: 11px; font-weight: 700; color: #8A6D05; background: #FDF6E3; padding: 5px 12px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #FBEECB">{gateNav.label}</Box>
        )}
        {!flow.complete && (
          <>
            <Box onClick={() => act("step")} style="font-size: 11px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 5px 12px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #D7D9EE">Process next step</Box>
            <Box onClick={() => act("run")} style="font-size: 11px; font-weight: 700; color: #fff; background: #2E3391; padding: 5px 14px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Run to gate ›</Box>
          </>
        )}
      </div>

      <div style={css(`display: flex; align-items: center; gap: 9px; border: 1px solid ${tone.border}; background: ${tone.bg}; border-radius: 10px; padding: 7px 13px;`)}>
        <span style={css("font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #4C5571; flex: none;")}>Current status</span>
        <span style={css(`font-size: 12px; font-weight: 800; color: ${tone.fg}; flex: none;`)}>{tone.icon} {statusLabel}</span>
        <span style={css(`font-size: 11.5px; color: ${tone.fg}; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`)}>{statusDetail}</span>
      </div>

      {/* Inline gate resolution */}
      {blockedStep?.key === "po_decision" && (
        <div style={css("margin-top: 9px; border: 1px solid #EFD48B; background: #FDF6E3; border-radius: 10px; padding: 9px 13px; display: flex; align-items: center; gap: 9px; flex-wrap: wrap;")}>
          <span style={css("font-size: 11px; font-weight: 700; color: #8A6D05;")}>PO number</span>
          <Box as="input" value={poInput} onChange={(e: any) => setPoInput(e.target.value)} placeholder="P26-005942"
               style="width: 130px; font-size: 11.5px; font-family: 'JetBrains Mono', monospace; border: 1px solid #EFD48B; border-radius: 7px; padding: 5px 9px; outline: none; background: #fff;"
               focusStyle="border-color: #2E3391" />
          <Box onClick={attachPo} style="font-size: 11px; font-weight: 700; color: #fff; background: #2E3391; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Attach PO</Box>
          <Box onClick={supplierBp} style="font-size: 11px; font-weight: 700; color: #8A6D05; background: #fff; border: 1px solid #EFD48B; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #FBEECB">Process without PO (supplier BP)</Box>
        </div>
      )}
      {blockedStep?.key === "pin_reference" && (
        <div style={css("margin-top: 9px; border: 1px solid #EFD48B; background: #FDF6E3; border-radius: 10px; padding: 9px 13px; display: flex; align-items: center; gap: 9px; flex-wrap: wrap;")}>
          <span style={css("font-size: 11px; font-weight: 700; color: #8A6D05;")}>Original PIN</span>
          <Box as="input" value={pinInput} onChange={(e: any) => setPinInput(e.target.value)} placeholder="PIN196602"
               style="width: 120px; font-size: 11.5px; font-family: 'JetBrains Mono', monospace; border: 1px solid #EFD48B; border-radius: 7px; padding: 5px 9px; outline: none; background: #fff;"
               focusStyle="border-color: #2E3391" />
          <Box onClick={setPin} style="font-size: 11px; font-weight: 700; color: #fff; background: #2E3391; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Set original PIN</Box>
        </div>
      )}

      {blockedStep?.key === "credit_reference" && (
        <div style={css("margin-top: 9px; border: 1px solid #EFD48B; background: #FDF6E3; border-radius: 10px; padding: 9px 13px; display: flex; align-items: center; gap: 9px; flex-wrap: wrap;")}>
          <span style={css("font-size: 11px; font-weight: 700; color: #8A6D05;")}>Purchase credit memo</span>
          <Box as="input" value={pcmInput} onChange={(e: any) => setPcmInput(e.target.value)} placeholder="PCM004410"
               style="width: 130px; font-size: 11.5px; font-family: 'JetBrains Mono', monospace; border: 1px solid #EFD48B; border-radius: 7px; padding: 5px 9px; outline: none; background: #fff;"
               focusStyle="border-color: #2E3391" />
          <Box onClick={setCreditMemo} style="font-size: 11px; font-weight: 700; color: #fff; background: #2E3391; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Tie to credit memo</Box>
        </div>
      )}

      {showEmail && <EmailModal inv={invoiceNumber} onClose={() => setShowEmail(false)} />}
      {showHistory && <HistoryModal inv={invoiceNumber} steps={flow.steps} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

/** Everything about this document's processing, in one place: the pipeline (which
 * steps are done, which one it is on, what is still ahead) and the dated trail —
 * when it arrived, when it was classified, every Sage write. */
function HistoryModal({ inv, steps, onClose }: { inv: string; steps: Step[]; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["audit", inv],
    queryFn: () => api.get<{ rows: AuditRow[] }>(`/audit?invoice=${encodeURIComponent(inv)}&limit=200`),
  });
  const rows = data?.rows || [];

  return (
    <div onClick={onClose} style={css("position: fixed; inset: 0; background: rgba(10,15,28,0.45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 24px;")}>
      <div onClick={(e) => e.stopPropagation()} style={css("background: #fff; border-radius: 16px; width: 700px; max-width: 100%; max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(10,15,28,0.35);")}>
        <div style={css("flex: none; padding: 13px 20px; border-bottom: 1px solid #DEE2EE; display: flex; align-items: center; gap: 10px; background: #F6F7FB; border-radius: 16px 16px 0 0;")}>
          <span style={css("font-size: 14px;")}>⧗</span>
          <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>Document history · {inv}</span>
          <Box onClick={onClose} style="font-size: 14px; font-weight: 700; color: #4C5571; padding: 2px 9px; border-radius: 7px; cursor: pointer;" hoverStyle="background: #EDEFF6; color: #14163C">✕</Box>
        </div>

        <div style={css("flex: 1; overflow-y: auto; padding: 6px 20px 16px;")}>
          {/* Where it stands: every step of this document's flow, in order. */}
          <div style={css("font-size: 10px; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase; color: #5B6788; padding: 12px 0 8px;")}>Processing pipeline</div>
          {steps.map((s) => {
            const m = STEP_MARK[s.state];
            return (
              <div key={s.key} style={css("display: flex; gap: 12px; align-items: flex-start; padding: 7px 0; border-bottom: 1px solid #F6F7FB;")}>
                <span style={css(`width: 19px; height: 19px; flex: none; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: ${m.fg}; background: ${m.bg};`)}>{m.icon}</span>
                <span style={css("width: 128px; flex: none; font-size: 12px; font-weight: 700; color: #14163C; padding-top: 1px;")}>
                  {s.label}{s.gate && <span title="needs a person" style={css("font-size: 8.5px; color: #8A6D05;")}> ▲</span>}
                </span>
                <span style={css("flex: 1; min-width: 0; font-size: 11.5px; color: #4C5571; line-height: 1.5;")}>
                  {s.state === "blocked" && s.waitingOn ? `waiting on ${s.waitingOn} — ${s.detail}` : s.state === "skipped" ? "skipped — no rule applied" : s.detail}
                </span>
                <span style={css(`width: 62px; flex: none; text-align: right; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${s.state === "done" ? "#136B48" : s.state === "blocked" ? "#8A6D05" : "#5B6788"}; padding-top: 3px;`)}>
                  {s.state === "current" ? "now" : s.state}
                </span>
              </div>
            );
          })}

          <div style={css("font-size: 10px; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase; color: #5B6788; padding: 18px 0 4px;")}>Timeline</div>
          {rows.length === 0 && <div style={css("padding: 24px 0; text-align: center; font-size: 12px; color: #5B6788;")}>No dated events recorded yet.</div>}
          {rows.map((r, i) => (
            <div key={i} style={css("display: flex; gap: 14px; padding: 11px 0; border-bottom: 1px solid #F2F3F9;")}>
              {/* timeline rail */}
              <div style={css("width: 11px; flex: none; display: flex; flex-direction: column; align-items: center; padding-top: 4px;")}>
                <span style={css(`width: 9px; height: 9px; border-radius: 999px; flex: none; background: ${i === rows.length - 1 ? "#2E3391" : "#A9B2CC"};`)} />
                {i < rows.length - 1 && <span style={css("flex: 1; width: 1px; background: #DEE2EE; margin-top: 3px;")} />}
              </div>
              <div style={css("width: 112px; flex: none; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #4C5571; padding-top: 2px;")}>{whenText(r.ts)}</div>
              <div style={css("flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;")}>
                <span style={css("font-size: 12.5px; font-weight: 700; color: #14163C;")}>
                  {ACTION_LABEL[r.action] || r.action}
                  {r.action === "flow_step" && r.field ? <span style={css("font-weight: 600; color: #4C5571;")}> · {r.field.replace(/_/g, " ")}</span> : null}
                </span>
                <span style={css("font-size: 11.5px; color: #4C5571; line-height: 1.5;")}>{r.message}</span>
              </div>
              <div style={css("width: 110px; flex: none; text-align: right; font-size: 10.5px; color: #5B6788; padding-top: 3px;")}>{r.actor}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
