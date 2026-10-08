"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Box from "../Box";
import FlowStepper from "../FlowStepper";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { LINE_COLS } from "@/lib/constants";
import { buildSearchBody } from "@/lib/search";
import { useApp } from "@/lib/state";
import { fmt, money, statusMeta } from "@/lib/tone";

const MONO = "'JetBrains Mono', monospace";
const SANS = "'Manrope', sans-serif";

type Detail = {
  invoice: any;
  coName: string;
  lines: any[];
  lineFootnote: string;
  receipts: { num: string; date: string; bol: string; desc: string; amtN: number }[];
  matching: { banner: string; ok: boolean; total: number; scale: number; net: number };
  notes: { who: string; time: string; text: string }[];
  totals: { ok: boolean; variance: number };
  poReference: { needsPo: boolean; lastSagePo: string };
};

type FieldDef = {
  label: string;
  key: string;
  base: string;
  conf?: number;
  ro?: boolean;
  mono?: boolean;
  src?: string; // PDF source-region key → click-to-highlight
  tag?: string | false;
  note?: string | false;
  span2?: boolean; // span both columns (e.g. Last Message)
};

export default function InvoiceDetail() {
  const { state, set, toast } = useApp();
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [noteText, setNoteText] = useState("");

  const detailId = state.detailId;
  const { data } = useQuery({
    queryKey: ["detail", detailId],
    queryFn: () => api.get<Detail>(`/invoices/${encodeURIComponent(detailId)}`),
  });
  // Navigable set = current filtered/sorted results (prev/next across the set, §5.3).
  const navBody = useMemo(
    () => ({ ...buildSearchBody(state), pageSize: 1000 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.critApplied, state.sortField, state.sortDir]
  );
  const { data: navData } = useQuery({
    queryKey: ["nav", JSON.stringify(navBody)],
    queryFn: () => api.post<{ rows: any[] }>("/search", navBody),
  });

  useEffect(() => {
    setEdits({});
  }, [detailId, state.editMode]);

  // Field ↔ PDF source-linking: bring both the PDF region and the field cell into view.
  useEffect(() => {
    const sel = state.selectedField;
    if (!sel) return;
    const t = setTimeout(() => {
      document.getElementById("pdfsrc-" + sel)?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("field-" + sel)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    return () => clearTimeout(t);
  }, [state.selectedField]);

  if (!data) return null;
  const inv = data.invoice;
  const sm = statusMeta(inv.status);
  const conf = inv.conf || {};
  const po = inv.po;
  const navRows = navData?.rows || [];
  const idx = Math.max(0, navRows.findIndex((r) => r.invoiceNumber === detailId));

  const ed = (key: string, base: string) => (edits[key] != null ? edits[key] : base);
  const flag = conf.terms < 90 ? "Terms mismatch" : inv.errorCode !== "—" ? inv.errorCode : false;

  const vehPattern =
    inv.vehicleId !== "—" && /[A-Za-z]/.test(inv.vehicleId)
      ? "RAIL"
      : inv.bol !== "—" && /^\d+$/.test(String(inv.bol).replace(/[^0-9]/g, "")) && inv.bol !== "—"
      ? "TRUCK"
      : false;

  // Fields with a `src` are extracted from the document — clicking highlights the
  // source region in the PDF (and vice versa).
  const groups: { title: string; fields: FieldDef[] }[] = [
    { title: "Identification", fields: [
      { label: "Platform ID", key: "platformId", base: inv.platformId, ro: true, mono: true },
      { label: "Scan Date", key: "scanDate", base: inv.scanDate, ro: true, mono: true },
      { label: "Company", key: "co", base: `${inv.co} · ${data.coName}`, conf: conf.company, src: "company" },
      { label: "Status", key: "status", base: inv.status, ro: true, mono: true },
      { label: "Error Code", key: "errorCode", base: inv.errorCode, mono: true },
      { label: "Validated", key: "validated", base: inv.validated ? "true" : "false", ro: true, mono: true },
    ]},
    { title: "Vendor · live from Sage BP (FR-22)", fields: [
      { label: "Vendor Code", key: "vendorCode", base: inv.vendorCode, conf: conf.vendor, mono: true, src: "vendor", note: inv.vendorCode === "—" ? "No BP match — resolve to clear MISSING_VENDOR" : false },
      { label: "Vendor Address ID", key: "vendorAddrId", base: inv.vendorAddrId, mono: true },
      { label: "Vendor Location Code", key: "vendorLoc", base: inv.vendorLoc, mono: true },
      { label: "Vendor Name", key: "vendorName", base: inv.vendorName, src: "vendor" },
      { label: "Vendor Address", key: "vendorAddress", base: inv.vendorAddress, src: "address" },
      { label: "Vendor City", key: "vendorCity", base: inv.vendorCity, src: "address" },
      { label: "Vendor Term Days", key: "vendorTermDays", base: String(inv.vendorTermDays), mono: true },
      { label: "Vendor Pay Method", key: "payMethod", base: inv.payMethod, mono: true },
    ]},
    { title: "Invoice", fields: [
      { label: "PO Number", key: "po", base: po, conf: conf.po, mono: true, src: "po" },
      { label: "Invoice Number", key: "invoiceNumber", base: inv.invoiceNumber, conf: conf.invoiceNumber, mono: true, src: "invnum" },
      { label: "Invoice Date", key: "invoiceDate", base: inv.invoiceDate, conf: conf.invoiceDate, mono: true, src: "date" },
      { label: "Term Days", key: "termDays", base: String(inv.termDays), conf: conf.terms, mono: true, src: "terms", note: conf.terms < 90 ? `PDF says Net ${inv.termDays} — vendor default Net ${inv.vendorTermDays}. PDF takes precedence, flagged (FR-23).` : false },
      { label: "Due Date", key: "dueDate", base: inv.dueDate, mono: true },
      { label: "Currency", key: "currency", base: inv.currency, mono: true },
      { label: "Special Terms", key: "specialTerms", base: inv.specialTerms ? "yes" : "—", mono: true },
      { label: "Template Line Name", key: "templateLine", base: inv.templateLine, mono: true },
    ]},
    { title: "Totals · net + taxes + freight must equal gross", fields: [
      { label: "Net Total", key: "net", base: money(inv.net), conf: conf.net, mono: true, src: "total" },
      { label: "GST Tax", key: "gst", base: money(inv.gst), mono: true },
      { label: "HST Tax", key: "hst", base: money(inv.hst), mono: true },
      { label: "PST Tax", key: "pst", base: money(inv.pst), mono: true },
      { label: "USA Tax", key: "usa", base: money(inv.usa), mono: true },
      { label: "VAT Tax", key: "vat", base: money(inv.vat), mono: true },
      { label: "Freight Total", key: "freight", base: money(inv.freight), mono: true, src: "total" },
      { label: "Gross Total", key: "gross", base: money(inv.gross), conf: conf.gross, mono: true, src: "total" },
    ]},
    { title: "Transport (FR-24)", fields: [
      { label: "Vehicle ID", key: "vehicleId", base: inv.vehicleId, conf: conf.vehicle, mono: true, src: "vehicle", tag: vehPattern === "RAIL" ? "RAIL" : false },
      { label: "BOL Number", key: "bol", base: inv.bol, mono: true, src: "bol", tag: vehPattern === "TRUCK" ? "TRUCK" : false },
    ]},
    { title: "Routing (FR-41)", fields: [
      { label: "Route Type", key: "routeType", base: inv.routeType, mono: true },
      { label: "Route Name", key: "routeName", base: inv.routeName, mono: true },
      { label: "Route Approver", key: "routeApprover", base: inv.routeApprover },
      { label: "Current User", key: "currentUser", base: inv.currentUser },
      { label: "Sales Channel", key: "salesChannel", base: inv.salesChannel, mono: true },
    ]},
    { title: "ERP write-back · read-only from Sage", fields: [
      { label: "ERP Voucher", key: "erpVoucher", base: inv.erpVoucher, ro: true, mono: true },
      { label: "Payment Date", key: "paymentDate", base: inv.paymentDate, ro: true, mono: true },
      { label: "Payment Number", key: "paymentNumber", base: inv.paymentNumber, ro: true, mono: true },
      { label: "Payment Amount", key: "paymentAmount", base: inv.paymentAmount, ro: true, mono: true },
    ]},
    { title: "Audit (FR-46, FR-83)", fields: [
      { label: "Last Updated By", key: "lastBy", base: inv.lastBy, ro: true },
      { label: "Last Updated Date", key: "lastDate", base: inv.lastDate, ro: true, mono: true },
      { label: "Last Message", key: "lastMsg", base: inv.lastMsg, ro: true, span2: true },
    ]},
  ];

  const needsPo = data.poReference.needsPo;

  // ----- actions -----
  const gotoRec = (n: number) => {
    const t = navRows[Math.min(Math.max(0, n), navRows.length - 1)];
    if (t) set({ detailId: t.invoiceNumber, selectedField: null, editMode: false });
  };
  const saveRecord = async () => {
    await api.patch(`/invoices/${encodeURIComponent(detailId)}`, { edits });
    await qc.invalidateQueries({ queryKey: ["detail", detailId] });
    setEdits({});
    set({ editMode: false });
    toast("Record saved — field edits recorded to the audit log (FR-46).");
  };
  const updateVendor = async () => {
    const r = await api.post<{ message: string }>(`/invoices/${encodeURIComponent(detailId)}/update-vendor`);
    toast(r.message);
  };
  const addNote = async () => {
    if (!noteText.trim()) return;
    await api.post(`/invoices/${encodeURIComponent(detailId)}/notes`, { who: "Ivy Chen", text: noteText });
    setNoteText("");
    await qc.invalidateQueries({ queryKey: ["detail", detailId] });
  };

  const sel = state.selectedField;
  const setSel = (s: string) => set({ selectedField: sel === s ? null : s });

  return (
    <div style={css("height: 100%; display: flex; flex-direction: column;")}>
      {/* Top bar */}
      <div style={css("flex: none; background: #fff; border-bottom: 1px solid #DEE2EE; padding: 9px 22px; display: flex; align-items: center; gap: 9px; flex-wrap: wrap;")}>
        <Box
          onClick={() => set({ screen: state.returnTo || "home", editMode: false, selectedField: null })}
          style="font-size: 11.5px; font-weight: 700; color: #4C5571; background: #EDEFF6; padding: 6px 12px; border-radius: 8px; cursor: pointer;"
          hoverStyle="background: #DFE3F0"
        >
          ‹ Back
        </Box>
        <div style={css("width: 1px; height: 18px; background: #DEE2EE;")} />
        <div onClick={() => gotoRec(idx - 1)} style={css("font-size: 12px; font-weight: 700; color: #2E3391; cursor: pointer;")}>‹ Previous</div>
        <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #5B6788;")}>Record {idx + 1} of {navRows.length}</span>
        <div onClick={() => gotoRec(idx + 1)} style={css("font-size: 12px; font-weight: 700; color: #2E3391; cursor: pointer;")}>Next ›</div>
        <div style={css("width: 1px; height: 18px; background: #DEE2EE;")} />
        <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600;")}>{inv.invoiceNumber}</span>
        <span style={css("font-size: 12.5px; font-weight: 700;")}>{inv.vendorName}</span>
        <span style={css(`font-size: 10px; font-weight: 700; color: ${sm[0]}; background: ${sm[1]}; padding: 3px 9px; border-radius: 999px;`)}>{inv.status}</span>
        {flag && <span style={css("font-size: 10px; font-weight: 700; color: #B23413; background: #FDEDE7; padding: 3px 9px; border-radius: 999px;")}>⚑ {flag}</span>}
        <div style={css("flex: 1;")} />
        {state.editMode ? (
          <>
            <Box onClick={saveRecord} style="font-size: 11.5px; font-weight: 700; color: #fff; background: #198459; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #17805A">Save Record</Box>
            <div onClick={() => { setEdits({}); set({ editMode: false }); }} style={css("font-size: 11.5px; font-weight: 700; color: #B23413; background: #FDEDE7; padding: 6px 13px; border-radius: 8px; cursor: pointer;")}>Cancel Edit</div>
          </>
        ) : (
          <Box onClick={() => set({ editMode: true })} style="font-size: 11.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 6px 15px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Edit</Box>
        )}
        <Box onClick={() => set({ showPdf: !state.showPdf })} style="font-size: 11.5px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #D7D9EE">{state.showPdf ? "Hide Attachment" : "Show Attachment"}</Box>
        <Box onClick={updateVendor} style="font-size: 11.5px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #D7D9EE">Update Vendor</Box>
        <Box onClick={() => set({ screen: "matching" })} style="font-size: 11.5px; font-weight: 700; color: #C7380D; background: #FDEDE7; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #FBD8CC">Receipt Matching ›</Box>
      </div>

      {/* Processing engine pipeline for this document */}
      <FlowStepper invoiceNumber={inv.invoiceNumber} />

      {/* MAIN: field panel | full-page PDF */}
      <div style={css("flex: 1; display: flex; min-height: 0;")}>
        {/* LEFT: grouped 2-column field/value pairs */}
        <div style={css(`${state.showPdf ? "width: 620px; flex: none;" : "flex: 1;"} min-width: 0; overflow-y: auto; background: #fff; padding: 0 0 16px; border-right: 1px solid #DEE2EE;`)}>
          {groups.map((g, gi) => (
            <div key={gi}>
              <div style={css("margin: 12px 16px 6px; padding-bottom: 4px; border-bottom: 1px solid #EDEFF6; font-size: 9.5px; font-weight: 800; letter-spacing: 0.11em; text-transform: uppercase; color: #5B6788;")}>{g.title}</div>
              <div style={css("display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; padding: 0 16px;")}>
                {g.fields.map((f, fi) => {
                  const editable = state.editMode && !f.ro;
                  const low = f.conf != null && f.conf > 0 && f.conf < 90;
                  const selected = !!f.src && sel === f.src;
                  const confTxt = f.conf != null ? (f.conf === 0 ? "—" : f.conf + "%") : false;
                  const confBad = low || f.conf === 0;
                  const border = selected ? "#F1582A" : low ? "#F7B099" : editable ? "#A9B2CC" : "#D5DAE8";
                  const bg = selected ? "#FFF4EF" : low ? "#FFFBF9" : editable ? "#fff" : "#FBFBFE";
                  return (
                    <div key={fi} id={f.src ? "field-" + f.src : undefined} style={css(`display: flex; flex-direction: column; ${f.span2 ? "grid-column: span 2;" : ""}`)}>
                      <div
                        onClick={f.src ? () => setSel(f.src!) : undefined}
                        style={css(`display: flex; align-items: center; gap: 7px; cursor: ${f.src ? "pointer" : "default"};`)}
                      >
                        <span style={css("width: 104px; flex: none; font-size: 10px; font-weight: 600; color: #4C5571; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{f.label}</span>
                        <div style={css(`flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; border: 1px solid ${border}; background: ${bg}; border-radius: 5px; padding: 2.5px 7px;`)}>
                          <input
                            value={ed(f.key, f.base)}
                            readOnly={!editable}
                            onClick={(e) => { if (editable) e.stopPropagation(); }}
                            onChange={(e) => editable && setEdits({ ...edits, [f.key]: e.target.value })}
                            style={css(`flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-family: ${f.mono ? MONO : SANS}; font-size: 11.5px; font-weight: 600; color: ${f.ro ? "#6B7493" : "#14163C"}; padding: 0; cursor: ${f.src && !editable ? "pointer" : "auto"};`)}
                          />
                          {f.tag && <span style={css("font-size: 8px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 0px 4px; border-radius: 999px; flex: none;")}>{f.tag}</span>}
                          {confTxt && <span title="extraction confidence" style={css(`font-family: 'JetBrains Mono', monospace; font-size: 8.5px; font-weight: 600; flex: none; color: ${confBad ? "#B23413" : "#177C53"}; background: ${confBad ? "#FDEDE7" : "#EAF7F1"}; padding: 0px 4px; border-radius: 999px;`)}>{confTxt}</span>}
                          {f.src && <span style={css(`font-size: 9px; flex: none; color: ${selected ? "#C7380D" : "#5B6788"};`)}>◉</span>}
                        </div>
                      </div>
                      {f.note && <div style={css("font-size: 9px; color: #B23413; font-weight: 600; margin: 1px 0 2px 111px; line-height: 1.35;")}>{f.note}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Totals banner */}
          {(() => {
            const ok = data.totals.ok;
            return (
              <div style={css(`margin: 14px 16px 0; border: 1px solid ${ok ? "#A8DFC7" : "#F7B099"}; background: ${ok ? "#EAF7F1" : "#FDEDE7"}; border-radius: 9px; padding: 8px 12px; font-size: 11px; font-weight: 700; color: ${ok ? "#177C53" : "#B23413"};`)}>
                {ok ? `✓ Net + taxes + freight = gross · ${fmt(inv.gross)}` : `✗ Totals do not reconcile — variance ${fmt(data.totals.variance)} blocks submission`}
              </div>
            );
          })()}

          {needsPo && (
            <div style={css("margin: 10px 16px 0; border: 1px solid #EFD48B; background: #FDF6E3; border-radius: 9px; padding: 9px 12px; font-size: 11px; color: #8A6D05; line-height: 1.5;")}>
              No PO on record — attach at the <strong>PO decision</strong> gate above, or process as supplier BP · last Sage PO for <strong>{inv.vendorName}</strong>: <span style={css("font-family: 'JetBrains Mono', monospace; font-weight: 700;")}>{data.poReference.lastSagePo}</span>
            </div>
          )}
        </div>

        {/* RIGHT: full-page PDF with source highlighting */}
        {state.showPdf && <PdfViewer inv={inv} po={po} coName={data.coName} sel={sel} setSel={setSel} />}
      </div>

      {/* BOTTOM: full-width tabs (Line Items / Notes / PO Receipts) */}
      <BottomTabs detail={data} inv={inv} po={po} noteText={noteText} setNoteText={setNoteText} addNote={addNote} />
    </div>
  );
}

// ---------- full-width bottom tabs ----------
function BottomTabs({ detail, inv, po, noteText, setNoteText, addNote }: any) {
  const { state, set } = useApp();
  const tabs: [string, string][] = [["lines", "Line Items"], ["notes", "Notes"], ["receipts", "PO Receipts"]];
  const tab = state.detailTab;

  return (
    <div style={css("flex: none; background: #fff; border-top: 2px solid #DEE2EE; display: flex; flex-direction: column; max-height: 262px;")}>
      <div style={css("flex: none; display: flex; gap: 2px; padding: 6px 16px 0; background: #F6F7FB; border-bottom: 1px solid #DEE2EE;")}>
        {tabs.map(([k, label]) => {
          const on = tab === k;
          return (
            <div key={k} onClick={() => set({ detailTab: k })} style={css(`font-size: 11.5px; font-weight: 700; padding: 6px 16px; border-radius: 8px 8px 0 0; cursor: pointer; color: ${on ? "#2E3391" : "#4C5571"}; background: ${on ? "#fff" : "transparent"}; border-top: 1px solid ${on ? "#DEE2EE" : "transparent"}; border-left: 1px solid ${on ? "#DEE2EE" : "transparent"}; border-right: 1px solid ${on ? "#DEE2EE" : "transparent"};`)}>{label}</div>
          );
        })}
        <div style={css("flex: 1;")} />
        <span style={css("font-size: 10px; color: #5B6788; align-self: center; padding-right: 4px;")}>{inv.invoiceNumber} · {inv.vendorName}</span>
      </div>
      <div style={css("flex: 1; overflow-y: auto; min-height: 0;")}>
        {tab === "lines" && <LinesTab detail={detail} />}
        {tab === "notes" && <NotesTab detail={detail} noteText={noteText} setNoteText={setNoteText} addNote={addNote} />}
        {tab === "receipts" && <ReceiptsTab detail={detail} inv={inv} po={po} />}
      </div>
    </div>
  );
}

function LinesTab({ detail }: any) {
  return (
    <>
      <div style={css("overflow-x: auto;")}>
        <div style={css("min-width: 1230px;")}>
          <div style={css("display: flex; padding: 7px 18px; background: #FBFBFE; border-bottom: 1px solid #DEE2EE; position: sticky; top: 0;")}>
            {LINE_COLS.map(([t, wd], i) => (
              <span key={i} style={css(`width: ${wd}; flex: none; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5571; padding-right: 10px; white-space: nowrap;`)}>{t}</span>
            ))}
          </div>
          {detail.lines.map((ln: any, ri: number) => {
            const vals = [ln.lineId, ln.poNumber, ln.poLine, ln.quantity, ln.description, ln.itemNumber, ln.unitPrice, ln.accountCode, ln.division, ln.salesChannel, ln.branchSite, ln.department, ln.project, ln.lineAmount];
            return (
              <div key={ri} style={css("display: flex; padding: 6px 18px; border-bottom: 1px solid #EDEFF6; align-items: center;")}>
                {vals.map((t, i) => (
                  <span key={i} style={css(`width: ${LINE_COLS[i][1]}; flex: none; font-size: 11px; font-family: ${i === 4 ? SANS : MONO}; color: ${i === 4 ? "#14163C" : "#4C5571"}; font-weight: ${i === 4 || i === 13 ? "600" : "500"}; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>{t}</span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {detail.lineFootnote && <div style={css("padding: 6px 18px; background: #F6F7FB; font-size: 10px; color: #4C5571; text-align: center;")}>{detail.lineFootnote}</div>}
    </>
  );
}

function NotesTab({ detail, noteText, setNoteText, addNote }: any) {
  return (
    <div style={css("padding: 12px 18px; display: flex; flex-direction: column; gap: 8px; max-width: 1200px;")}>
      {detail.notes.map((nt: any, i: number) => (
        <div key={i} style={css("border: 1px solid #EDEFF6; background: #FBFBFE; border-radius: 9px; padding: 8px 12px;")}>
          <div style={css("font-size: 11px; font-weight: 700;")}>{nt.who} <span style={css("font-family: 'JetBrains Mono', monospace; font-weight: 400; color: #5B6788; font-size: 10px;")}>· {nt.time}</span></div>
          <div style={css("font-size: 12px; color: #4C5571; margin-top: 2px; line-height: 1.45;")}>{nt.text}</div>
        </div>
      ))}
      <div style={css("display: flex; gap: 8px;")}>
        <Box as="input" value={noteText} onChange={(e: any) => setNoteText(e.target.value)} placeholder="Add a note…" style="flex: 1; font-size: 12px; border: 1px solid #DEE2EE; border-radius: 8px; padding: 7px 11px; outline: none; min-width: 0;" focusStyle="border-color: #2E3391" />
        <Box onClick={addNote} style="font-size: 11.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 7px 14px; border-radius: 8px; cursor: pointer; white-space: nowrap;" hoverStyle="background: #262A78">Add Note</Box>
      </div>
    </div>
  );
}

function ReceiptsTab({ detail, inv, po }: any) {
  const { state, set, toast } = useApp();
  const rd = detail.matching;
  const receipts = detail.receipts;
  const desel = state.receiptDesel[inv.invoiceNumber] || {};
  const scale = rd.scale;
  const selSum = receipts.reduce((a: number, r: any, i: number) => (desel[i] ? a : a + r.amtN), 0) * scale;
  const variance = receipts.length ? selSum - inv.net : 0;
  const varOk = Math.abs(variance) < 1;
  const allSel = Object.keys(desel).length === 0;
  const showPoGen = po === "—" && inv.docType !== "credit";

  const toggleAll = () =>
    set({ receiptDesel: { ...state.receiptDesel, [inv.invoiceNumber]: allSel ? receipts.reduce((a: any, _: any, i: number) => ((a[i] = true), a), {}) : {} } });
  const toggleOne = (i: number) => {
    const nd = { ...desel };
    if (nd[i]) delete nd[i];
    else nd[i] = true;
    set({ receiptDesel: { ...state.receiptDesel, [inv.invoiceNumber]: nd } });
  };
  const countLabel = rd.total > receipts.length ? `${receipts.length} of ${rd.total.toLocaleString()} shown` : `${receipts.length} receipts`;

  return (
    <div style={css("padding: 12px 18px; display: flex; flex-direction: column; gap: 10px;")}>
      <div style={css(`border: 1px solid ${rd.ok ? "#A8DFC7" : "#EFD48B"}; background: ${rd.ok ? "#EAF7F1" : "#FDF6E3"}; border-radius: 9px; padding: 8px 12px; font-size: 11px; font-weight: 600; color: ${rd.ok ? "#177C53" : "#8A6D05"};`)}>{rd.banner}</div>

      {receipts.length > 0 ? (
        <>
          <div style={css("border: 1px solid #DEE2EE; border-radius: 9px; overflow: hidden;")}>
            <div style={css("display: flex; align-items: center; gap: 8px; padding: 7px 12px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE;")}>
              <input type="checkbox" checked={allSel} onChange={toggleAll} style={css("width: 13px; height: 13px; accent-color: #2E3391; cursor: pointer;")} />
              <span style={css("font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5571;")}>Select all within filters ({countLabel})</span>
              <div style={css("flex: 1;")} />
              <span style={css("font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5571;")}>Receipt · Ship date · BOL/Veh · Qty · Amount</span>
            </div>
            <div style={css("max-height: 130px; overflow-y: auto;")}>
              {receipts.map((rc: any, i: number) => (
                <div key={i} style={css(`display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-bottom: 1px solid #EDEFF6; background: ${desel[i] ? "#F6F7FB" : "#fff"};`)}>
                  <input type="checkbox" checked={!desel[i]} onChange={() => toggleOne(i)} style={css("width: 13px; height: 13px; accent-color: #2E3391; cursor: pointer;")} />
                  <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #2E3391; width: 92px; flex: none;")}>{rc.num}</span>
                  <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11px; width: 66px; flex: none;")}>{rc.date}</span>
                  <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11px; width: 94px; flex: none;")}>{rc.bol}</span>
                  <span style={css("font-size: 11px; color: #4C5571; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{rc.desc}</span>
                  <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11px; text-align: right; width: 92px; flex: none;")}>{fmt(rc.amtN * scale)}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={css(`display: flex; gap: 16px; align-items: center; border: 1px solid ${varOk ? "#A8DFC7" : "#F7B099"}; background: ${varOk ? "#EAF7F1" : "#FDEDE7"}; border-radius: 9px; padding: 7px 12px;`)}>
            <div><div style={css("font-size: 9px; font-weight: 700; letter-spacing: 0.07em; color: #4C5571; text-transform: uppercase;")}>Invoice net</div><div style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;")}>{fmt(inv.net)}</div></div>
            <div><div style={css("font-size: 9px; font-weight: 700; letter-spacing: 0.07em; color: #4C5571; text-transform: uppercase;")}>Selected receipts</div><div style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;")}>{fmt(selSum)}</div></div>
            <div style={css("flex: 1;")} />
            <div style={css("text-align: right;")}><div style={css(`font-size: 9px; font-weight: 700; letter-spacing: 0.07em; color: ${varOk ? "#1E9E6A" : "#D8431A"}; text-transform: uppercase;`)}>Variance</div><div style={css(`font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: ${varOk ? "#1E9E6A" : "#D8431A"};`)}>{(variance >= 0 ? "+" : "−") + fmt(Math.abs(variance))}</div></div>
            <Box onClick={() => set({ screen: "matching" })} style="font-size: 11px; font-weight: 700; color: #fff; background: #2E3391; padding: 6px 13px; border-radius: 8px; cursor: pointer; white-space: nowrap;" hoverStyle="background: #262A78">Open Receipt Matching ›</Box>
          </div>
        </>
      ) : (
        <div style={css("display: flex; gap: 8px;")}>
          {showPoGen && (
            <Box onClick={() => toast("Parked in the Late-PO queue — auto-links when a matching PO is created in Sage and attached at the PO-decision gate (FR-37).")} style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 8px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #D7D9EE">Wait for PO in queue (FR-37)</Box>
          )}
          <Box onClick={() => set({ screen: "matching" })} style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: #fff; background: #2E3391; padding: 8px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Open Receipt Matching view ›</Box>
        </div>
      )}
    </div>
  );
}

// ---------- full-page PDF viewer with source-region highlighting ----------
export function PdfViewer({ inv, po, coName, sel, setSel }: any) {
  const { state, set, toast } = useApp();
  const zoom = state.pdfZoom;
  const pdfName = inv.invoiceNumber.toLowerCase().replace(/-/g, "_") + "_" + inv.vendorName.toLowerCase().split(" ")[0] + ".pdf";
  const docLabel = inv.docType === "credit" ? "CREDIT MEMO" : inv.docType === "summary" ? "SUMMARY INVOICE" : "INVOICE";
  const thumbs = Array.from({ length: Math.min(inv.pagesN, 6) }, (_, i) => i);
  const more = inv.pagesN > 6 ? "+" + (inv.pagesN - 6) : false;
  const zoomIn = () => set({ pdfZoom: Math.min(1.5, zoom + 0.1) });
  const zoomOut = () => set({ pdfZoom: Math.max(0.6, zoom - 0.1) });
  const tool = () => toast("Viewer parity: page thumbnails, zoom, rotate, download, print, open in separate window (§5.4)");

  // Clickable source region: highlighted + ringed when its field is selected.
  const Region = ({ k, style, children }: { k: string; style?: string; children: React.ReactNode }) => (
    <div
      id={"pdfsrc-" + k}
      onClick={(e) => { e.stopPropagation(); setSel(k); }}
      style={css(`${style || ""}; padding: 2px 5px; border-radius: 4px; cursor: pointer; transition: background 140ms; background: ${sel === k ? "#FBD8CC" : "transparent"}; outline: ${sel === k ? "2px solid #F1582A" : "none"};`)}
    >
      {children}
    </div>
  );

  return (
    <div style={css("flex: 1; background: #232A40; display: flex; flex-direction: column; min-width: 0;")}>
      <div style={css("flex: none; padding: 8px 14px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);")}>
        <span style={css("font-size: 11px; color: #A7B2CE; font-family: 'JetBrains Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{pdfName}</span>
        {sel && <span style={css("font-size: 10px; font-weight: 700; color: #C7380D; background: rgba(241,88,42,0.12); padding: 2px 8px; border-radius: 999px; white-space: nowrap;")}>source highlighted</span>}
        <div style={css("flex: 1;")} />
        <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #A7B2CE;")}>1 / {inv.pagesN}</span>
        <div style={css("width: 1px; height: 14px; background: rgba(255,255,255,0.15);")} />
        <Box onClick={zoomOut} title="Zoom out" style="color: #A7B2CE; font-size: 14px; font-weight: 700; cursor: pointer; padding: 0 5px;" hoverStyle="color: #fff">−</Box>
        <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #A7B2CE;")}>{Math.round(zoom * 100)}%</span>
        <Box onClick={zoomIn} title="Zoom in" style="color: #A7B2CE; font-size: 14px; font-weight: 700; cursor: pointer; padding: 0 5px;" hoverStyle="color: #fff">+</Box>
        {["⟳", "⤓", "⎙", "⧉"].map((g, i) => (
          <Box key={i} onClick={tool} style="color: #A7B2CE; font-size: 12px; cursor: pointer; padding: 0 4px;" hoverStyle="color: #fff">{g}</Box>
        ))}
      </div>
      <div style={css("flex: 1; display: flex; min-height: 0;")}>
        <div style={css("width: 56px; flex: none; border-right: 1px solid rgba(255,255,255,0.08); padding: 10px 0; display: flex; flex-direction: column; align-items: center; gap: 8px; overflow-y: auto;")}>
          {thumbs.map((i) => (
            <div key={i} style={css(`width: 34px; height: 44px; background: #fff; border-radius: 2px; border: 2px solid ${i === 0 ? "#F1582A" : "rgba(255,255,255,0.25)"}; display: flex; align-items: flex-end; justify-content: center; opacity: ${i === 0 ? "1" : "0.55"};`)}>
              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 8px; color: #4C5571;")}>{i + 1}</span>
            </div>
          ))}
          {more && <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #A7B2CE;")}>{more}</span>}
        </div>
        <div style={css("flex: 1; overflow: auto; padding: 20px; display: flex; justify-content: center;")}>
          {/* Full A4-proportioned page */}
          <div style={css(`width: 97%; max-width: 940px; min-height: 1200px; background: #fff; border-radius: 3px; box-shadow: 0 16px 44px rgba(0,0,0,0.4); padding: 48px 56px; height: fit-content; position: relative; transform: scale(${zoom}); transform-origin: top center; display: flex; flex-direction: column;`)}>
            {/* Header: vendor + doc label / invoice number */}
            <div style={css("display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px;")}>
              <div>
                <Region k="vendor" style="display: inline-block; margin-left: -5px;">
                  <div style={css("font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; color: #1a1a1a;")}>{inv.vendorName}</div>
                </Region>
                <Region k="address" style="display: inline-block; margin-left: -5px;">
                  <div style={css("font-size: 11.5px; color: #6E6E6E; line-height: 1.5;")}>{inv.vendorAddress} · {inv.vendorCity}</div>
                </Region>
              </div>
              <div style={css("text-align: right;")}>
                <div style={css("font-size: 15px; font-weight: 800; color: #1a1a1a; letter-spacing: 0.1em;")}>{docLabel}</div>
                <Region k="invnum" style="display: inline-block; margin-top: 4px;">
                  <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 14px;")}>{inv.invoiceNumber}</span>
                </Region>
              </div>
            </div>

            {/* Meta: sold-to / terms / date */}
            <div style={css("display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-bottom: 14px; font-size: 12px; color: #444;")}>
              <div>
                <div style={css("font-weight: 800; font-size: 9px; letter-spacing: 0.1em; color: #6E6E6E; margin-bottom: 3px;")}>SOLD TO</div>
                <Region k="company" style="margin-left: -5px; line-height: 1.5;">{coName} · Co. {inv.co}</Region>
              </div>
              <div>
                <div style={css("font-weight: 800; font-size: 9px; letter-spacing: 0.1em; color: #6E6E6E; margin-bottom: 3px;")}>TERMS</div>
                <Region k="terms" style="margin-left: -5px;">Net {inv.termDays}</Region>
              </div>
              <div>
                <div style={css("font-weight: 800; font-size: 9px; letter-spacing: 0.1em; color: #6E6E6E; margin-bottom: 3px;")}>INVOICE DATE</div>
                <Region k="date" style="margin-left: -5px;"><span style={css("font-family: 'JetBrains Mono', monospace;")}>{inv.invoiceDate}</span></Region>
              </div>
            </div>

            {/* Reference strip: PO / vehicle / BOL */}
            <div style={css("display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-bottom: 22px; font-size: 12px; color: #444; border: 1px solid #eee; border-radius: 6px; padding: 9px 14px; background: #FAFAFA;")}>
              <div>
                <div style={css("font-weight: 800; font-size: 9px; letter-spacing: 0.1em; color: #6E6E6E; margin-bottom: 3px;")}>PO NUMBER</div>
                <Region k="po" style="margin-left: -5px;"><span style={css("font-family: 'JetBrains Mono', monospace;")}>{po}</span></Region>
              </div>
              <div>
                <div style={css("font-weight: 800; font-size: 9px; letter-spacing: 0.1em; color: #6E6E6E; margin-bottom: 3px;")}>VEHICLE ID</div>
                <Region k="vehicle" style="margin-left: -5px;"><span style={css("font-family: 'JetBrains Mono', monospace;")}>{inv.vehicleId}</span></Region>
              </div>
              <div>
                <div style={css("font-weight: 800; font-size: 9px; letter-spacing: 0.1em; color: #6E6E6E; margin-bottom: 3px;")}>BOL NUMBER</div>
                <Region k="bol" style="margin-left: -5px;"><span style={css("font-family: 'JetBrains Mono', monospace;")}>{inv.bol}</span></Region>
              </div>
            </div>

            {/* Line items */}
            <div style={css("border-top: 2px solid #1a1a1a; margin-bottom: 6px;")} />
            <div style={css("display: grid; grid-template-columns: 90px 1fr 96px 110px; gap: 10px; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; color: #6E6E6E; padding: 5px 0; border-bottom: 1px solid #ddd;")}>
              <span>DATE</span><span>DESCRIPTION</span><span style={css("text-align: right;")}>QTY</span><span style={css("text-align: right;")}>AMOUNT</span>
            </div>
            {(inv.pdfLines || []).map((pl: string[], i: number) => (
              <div key={i} style={css("display: grid; grid-template-columns: 90px 1fr 96px 110px; gap: 10px; font-size: 11.5px; color: #333; padding: 7px 0; border-bottom: 1px solid #eee;")}>
                <span style={css("font-family: 'JetBrains Mono', monospace;")}>{pl[0]}</span>
                <span>{pl[1]}</span>
                <span style={css("font-family: 'JetBrains Mono', monospace; text-align: right;")}>{pl[2]}</span>
                <span style={css("font-family: 'JetBrains Mono', monospace; text-align: right;")}>{pl[3]}</span>
              </div>
            ))}

            {/* Total summary box (bottom-right, like a real invoice) */}
            <div style={css("display: flex; justify-content: flex-end; margin-top: 22px;")}>
              <div style={css("border: 1.5px solid #1a1a1a; border-radius: 4px; padding: 10px 16px; min-width: 300px;")}>
                <div style={css("display: flex; justify-content: space-between; font-size: 11px; color: #555; padding: 2px 0;")}>
                  <span>Total Excl. Tax</span>
                  <span style={css("font-family: 'JetBrains Mono', monospace;")}>{fmt(inv.net)} {inv.currency}</span>
                </div>
                <div style={css("display: flex; justify-content: space-between; font-size: 11px; color: #555; padding: 2px 0;")}>
                  <span>Taxes + Freight</span>
                  <span style={css("font-family: 'JetBrains Mono', monospace;")}>{fmt(inv.gross - inv.net)} {inv.currency}</span>
                </div>
                <Region k="total" style="margin: 3px -5px 0;">
                  <div style={css("display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 800; color: #1a1a1a; border-top: 1px solid #ccc; padding-top: 4px;")}>
                    <span>TOTAL</span>
                    <span style={css("font-family: 'JetBrains Mono', monospace;")}>{fmt(inv.gross)} {inv.currency}</span>
                  </div>
                </Region>
                <div style={css("display: flex; justify-content: space-between; font-size: 11px; color: #555; padding: 4px 0 0;")}>
                  <span>Due Date</span>
                  <span style={css("font-family: 'JetBrains Mono', monospace;")}>{inv.dueDate}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={css("margin-top: auto; padding-top: 30px; font-size: 9.5px; color: #6E6E6E; display: flex; justify-content: space-between;")}>
              <span>For any queries, please contact ap-inquiry@{inv.vendorName.toLowerCase().replace(/[^a-z]/g, "")}.com</span>
              <span style={css("font-family: 'JetBrains Mono', monospace;")}>Page 1 of {inv.pagesN}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
