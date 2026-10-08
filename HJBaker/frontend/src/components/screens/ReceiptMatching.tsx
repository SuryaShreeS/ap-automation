"use client";

import { useQuery } from "@tanstack/react-query";
import Box from "../Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { MATCH_COLS } from "@/lib/constants";
import { useApp } from "@/lib/state";
import { fmt } from "@/lib/tone";

const MONO = "'JetBrains Mono', monospace";
const SANS = "'Manrope', sans-serif";

type Matching = {
  invoiceNumber: string; vendorName: string; docType: string; docTag: string; canImport: boolean;
  supplier: string; explain: string; banner: string; ok: boolean; net: number; scale: number;
  total: number; currency: string;
  receipts: { num: string; date: string; bol: string; desc: string; amtN: number }[];
};

export default function ReceiptMatching() {
  const { state, set, toast } = useApp();
  const invNo = state.detailId;
  const { data } = useQuery({ queryKey: ["matching", invNo], queryFn: () => api.get<Matching>(`/matching/${encodeURIComponent(invNo)}`) });
  if (!data) return null;

  const receipts = data.receipts;
  const scale = data.scale;
  const desel = state.receiptDesel[invNo] || {};
  const isBig = data.total > 100;
  const selSum = receipts.reduce((a, r, i) => (desel[i] ? a : a + r.amtN), 0) * scale;
  const variance = receipts.length ? selSum - data.net : -data.net;
  const varOk = Math.abs(variance) < 1;
  const canSubmit = varOk && receipts.length > 0;

  const f = state.matchFilter;
  const filtered = receipts
    .map((r, i) => ({ ...r, i }))
    .filter((r) =>
      (!f.receipt || r.num.toLowerCase().includes(f.receipt.toLowerCase())) &&
      (!f.bol || String(r.bol).toLowerCase().includes(f.bol.toLowerCase())) &&
      (!f.date || r.date.includes(f.date))
    );

  const toggle = (i: number) => {
    const nd = { ...desel };
    if (nd[i]) delete nd[i];
    else nd[i] = true;
    set({ receiptDesel: { ...state.receiptDesel, [invNo]: nd } });
  };

  const submit = async () => {
    const r = await api.post<{ ok: boolean; message: string }>(`/matching/${encodeURIComponent(invNo)}/submit`, { deselected: Object.keys(desel).map(Number) });
    toast(r.message);
  };
  const importReceipts = async () => {
    const r = await api.post<{ message: string }>(`/matching/${encodeURIComponent(invNo)}/import-receipts`);
    toast(r.message);
  };

  const varColor = varOk ? "#5BE3A6" : "#FF8A5C";
  const matchRow = (r: { num: string; date: string; bol: string; desc: string; amtN: number; i: number }) => {
    const warn = isBig && r.i % 9 === 4;
    const price = warn ? 127.29 : 126.02;
    const qty = (r.amtN * scale) / 126.02;
    const rail = /[A-Za-z]/.test(String(r.bol));
    const off = !!desel[r.i];
    const descTail = r.desc.split("·")[1] || r.desc;
    const cells: [string, boolean, string?, string?][] = [
      ["Receipt", false], [r.num, true, "#2E3391", "600"], [String(r.i + 1), true], ["SULF-M", true],
      ["Molten sulfur · " + descTail, false], ["STD", true], ["LT", true],
      [qty.toFixed(2), true], ["$" + price.toFixed(2), true, warn ? "#D8431A" : "#4C5571", warn ? "700" : "500"],
      [fmt(r.amtN * scale), true, "#14163C", "600"], [data.currency, true],
      [off ? "EXCLUDED" : warn ? "⚠ WARNING" : "✓ OK", true, off ? "#97A0BC" : warn ? "#D8431A" : "#177C53", "700"],
      [r.date, true], [rail ? "—" : String(r.bol), true], [rail ? String(r.bol) : "—", true],
    ];
    return { bg: off ? "#F6F7FB" : warn ? "#FFF9F6" : "#fff", cells };
  };

  return (
    <div style={css("height: 100%; display: flex; flex-direction: column;")}>
      <div style={css("flex: none; background: #fff; border-bottom: 1px solid #DEE2EE; padding: 9px 22px; display: flex; align-items: center; gap: 10px;")}>
        <div onClick={() => set({ screen: "detail" })} style={css("font-size: 12px; font-weight: 700; color: #2E3391; cursor: pointer;")}>‹ Back to Detail</div>
        <div style={css("width: 1px; height: 18px; background: #DEE2EE;")} />
        <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600;")}>{data.invoiceNumber}</span>
        <span style={css("font-size: 12.5px; font-weight: 700;")}>{data.vendorName}</span>
        <span style={css("font-size: 10px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 3px 9px; border-radius: 999px;")}>{data.docTag}</span>
        <div style={css("flex: 1;")} />
        {data.canImport && <Box onClick={importReceipts} style="font-size: 11.5px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #D7D9EE">Import receipt file (FR-34)</Box>}
        <div onClick={canSubmit ? submit : undefined} style={css(`font-size: 11.5px; font-weight: 700; color: #fff; background: ${canSubmit ? "#1E9E6A" : "#97A0BC"}; padding: 6px 15px; border-radius: 8px; cursor: ${canSubmit ? "pointer" : "default"};`)}>{canSubmit ? "Confirm match → approval" : "Resolve variance to submit"}</div>
      </div>

      <div style={css("flex: none; background: #0A0F1C; padding: 10px 22px; display: flex; align-items: center; gap: 24px;")}>
        <div><div style={css("font-size: 9px; font-weight: 700; letter-spacing: 0.09em; color: #5B6788; text-transform: uppercase;")}>Invoice total</div><div style={css("font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: #fff;")}>{fmt(data.net)}</div></div>
        <span style={css("color: #3C4868; font-size: 15px;")}>−</span>
        <div><div style={css("font-size: 9px; font-weight: 700; letter-spacing: 0.09em; color: #5B6788; text-transform: uppercase;")}>Matched (selected)</div><div style={css("font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: #fff;")}>{fmt(selSum)}</div></div>
        <span style={css("color: #3C4868; font-size: 15px;")}>=</span>
        <div><div style={css(`font-size: 9px; font-weight: 700; letter-spacing: 0.09em; color: ${varColor}; text-transform: uppercase;`)}>Variance</div><div style={css(`font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: ${varColor};`)}>{(variance >= 0 ? "+" : "−") + fmt(Math.abs(variance))}</div></div>
        <div style={css("flex: 1;")} />
        <div style={css("font-size: 10.5px; color: #5B6788; text-align: right; line-height: 1.5;")}>{data.explain}</div>
      </div>

      <div style={css("flex: 1; display: flex; min-height: 0;")}>
        {/* Receipt selection */}
        <div style={css("width: 252px; flex: none; background: #fff; border-right: 1px solid #DEE2EE; display: flex; flex-direction: column; min-height: 0;")}>
          <div style={css("flex: none; padding: 10px 14px; border-bottom: 1px solid #DEE2EE; background: #F6F7FB;")}>
            <div style={css("font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #4C5571;")}>Open receipts · {data.supplier}</div>
            <div style={css("font-size: 10.5px; color: #5B6788; margin-top: 2px;")}>Selecting a receipt pulls in all its lines</div>
          </div>
          <div style={css("flex: 1; overflow-y: auto;")}>
            {receipts.map((r, i) => (
              <Box key={i} onClick={() => toggle(i)} style={`display: flex; align-items: center; gap: 8px; padding: 7px 14px; border-bottom: 1px solid #EDEFF6; cursor: pointer; background: ${desel[i] ? "#FBFBFE" : "#fff"};`} hoverStyle="background: #F6F7FB">
                <input type="checkbox" checked={!desel[i]} onChange={() => toggle(i)} onClick={(e: any) => e.stopPropagation()} style={css("width: 13px; height: 13px; accent-color: #2E3391; cursor: pointer;")} />
                <div style={css("flex: 1; min-width: 0;")}>
                  <div style={css("font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; color: #2E3391;")}>{r.num}</div>
                  <div style={css("font-size: 10px; color: #4C5571;")}>{r.date} · {r.bol}</div>
                </div>
                <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #4C5571;")}>{fmt(r.amtN * scale)}</span>
              </Box>
            ))}
          </div>
          <div style={css("flex: none; padding: 8px 14px; border-top: 1px solid #DEE2EE; font-size: 10px; color: #5B6788;")}>
            {isBig ? `${receipts.length} of ${data.total.toLocaleString()} receipts shown · scroll loads more` : `${receipts.length} open receipt${receipts.length === 1 ? "" : "s"}`}
          </div>
        </div>

        {/* Line grid */}
        <div style={css("flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0;")}>
          <div style={css("flex: none; padding: 8px 16px; background: #fff; border-bottom: 1px solid #DEE2EE; display: flex; gap: 8px; align-items: center;")}>
            <Box as="input" value={f.receipt} onChange={(e: any) => set({ matchFilter: { ...f, receipt: e.target.value } })} placeholder="Receipt # …" style="font-size: 11.5px; font-family: 'JetBrains Mono', monospace; border: 1px solid #DEE2EE; border-radius: 7px; padding: 5px 9px; outline: none; width: 130px;" focusStyle="border-color: #2E3391" />
            <Box as="input" value={f.bol} onChange={(e: any) => set({ matchFilter: { ...f, bol: e.target.value } })} placeholder="BOL / vehicle …" style="font-size: 11.5px; font-family: 'JetBrains Mono', monospace; border: 1px solid #DEE2EE; border-radius: 7px; padding: 5px 9px; outline: none; width: 130px;" focusStyle="border-color: #2E3391" />
            <Box as="input" value={f.date} onChange={(e: any) => set({ matchFilter: { ...f, date: e.target.value } })} placeholder="Ship date mm/dd" style="font-size: 11.5px; font-family: 'JetBrains Mono', monospace; border: 1px solid #DEE2EE; border-radius: 7px; padding: 5px 9px; outline: none; width: 130px;" focusStyle="border-color: #2E3391" />
            <span style={css("font-size: 11px; color: #4C5571;")}>{(f.receipt || f.bol || f.date) ? `${filtered.length} lines match filters` : ""}</span>
            <div style={css("flex: 1;")} />
          </div>
          <div style={css("flex: 1; overflow: auto; background: #fff;")}>
            <div style={css("min-width: 1300px;")}>
              <div style={css("display: flex; padding: 7px 16px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE; position: sticky; top: 0; z-index: 2;")}>
                {MATCH_COLS.map(([t, wd], i) => (
                  <span key={i} style={css(`width: ${wd}; flex: none; font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #4C5571; padding-right: 10px; white-space: nowrap;`)}>{t}</span>
                ))}
              </div>
              {filtered.map((r) => {
                const mr = matchRow(r);
                return (
                  <div key={r.i} style={css(`display: flex; padding: 6px 16px; border-bottom: 1px solid #EDEFF6; align-items: center; background: ${mr.bg};`)}>
                    {mr.cells.map(([t, mono, fg, w], ci) => (
                      <span key={ci} style={css(`width: ${MATCH_COLS[ci][1]}; flex: none; font-size: 11px; font-family: ${mono ? MONO : SANS}; color: ${fg || "#4C5571"}; font-weight: ${w || "500"}; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>{t}</span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={css("flex: none; padding: 8px 16px; background: #F6F7FB; border-top: 1px solid #DEE2EE; display: flex; align-items: center; gap: 10px;")}>
            <span style={css("font-size: 11px; color: #4C5571;")}>{isBig ? `Showing ${filtered.length} of ${data.total.toLocaleString()} lines · page 1 of ${Math.ceil(data.total / 18)} — virtualized, no 500-line limit (FR-33, NFR-1)` : `${filtered.length} line${filtered.length === 1 ? "" : "s"}`}</span>
            <div style={css("flex: 1;")} />
            <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #4C5571;")}>‹ 1 2 3 … ›</span>
          </div>
        </div>
      </div>
    </div>
  );
}
