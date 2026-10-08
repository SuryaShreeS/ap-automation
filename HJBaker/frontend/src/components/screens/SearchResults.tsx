"use client";

import { useQuery } from "@tanstack/react-query";
import Box from "../Box";
import { api, postBlob } from "@/lib/api";
import { css } from "@/lib/css";
import { RESULT_COLS } from "@/lib/constants";
import { buildSearchBody, critSummary } from "@/lib/search";
import { useApp } from "@/lib/state";
import { money, statusMeta } from "@/lib/tone";

const MONO = "'JetBrains Mono', monospace";
const SANS = "'Manrope', sans-serif";

type InvRow = Record<string, any>;

function cells(r: InvRow) {
  const m = (v: number) => money(v);
  // [text, mono, fg, weight] — ported from resultsVals.
  const sm = statusMeta(r.status);
  const raw: [any, boolean, string?, string?][] = [
    [r.platformId, true, "#2E3391", "600"], [r.scanDate, true], [`${r.co} · ${r.coName || ""}`, false],
    [r.vendorCode, true], [r.vendorAddrId, true], [r.vendorLoc, true],
    [r.vendorName, false, "#14163C", "700"], [r.vendorAddress, false], [r.vendorCity, false],
    [String(r.vendorTermDays), true], [r.payMethod, true],
    [r.po, true, r.po === "—" ? "#97A0BC" : "#2E3391"], [r.invoiceNumber, true, "#14163C", "600"],
    [r.invoiceDate, true], [String(r.termDays), true], [r.dueDate, true], [r.currency, true],
    [m(r.net), true], [m(r.gst), true], [m(r.hst), true], [m(r.pst), true], [m(r.usa), true], [m(r.vat), true], [m(r.freight), true],
    [m(r.gross), true, "#14163C", "700"], [r.vehicleId, true], [r.bol, true], [r.routeType, true],
    [r.routeName, true], [r.routeApprover, false], [r.currentUser, false],
    [r.status, true, sm[0], "700"], [r.salesChannel, true],
  ];
  return raw.map(([t, mono, fg, w], i) => ({
    t: t == null ? "—" : String(t),
    wd: RESULT_COLS[i][1],
    ff: mono ? MONO : SANS,
    fg: fg || "#4C5571",
    w: w || "500",
  }));
}

export default function SearchResults() {
  const { state, set, toast } = useApp();
  const body = buildSearchBody(state);
  const summary = critSummary(state.critApplied);
  const { data, refetch } = useQuery({
    queryKey: ["search", JSON.stringify(body)],
    queryFn: () => api.post<{ count: number; rows: InvRow[] }>("/search", body),
  });

  const openDetail = (inv: string) => set({ screen: "detail", detailId: inv, detailTab: "lines", selectedField: null, editMode: false });
  const exportExcel = async () => {
    toast("Preparing search-results.xlsx…");
    const blob = await postBlob("/search/export", body);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "search-results.xlsx";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Downloaded search-results.xlsx — ${data?.count ?? 0} rows, full column set (FR-75)`);
  };

  return (
    <div style={css("padding: 16px 22px; display: flex; flex-direction: column; gap: 10px;")}>
      <div style={css("display: flex; align-items: center; gap: 8px; flex-wrap: wrap;")}>
        <div style={css("font-size: 13px; color: #4C5571;")}>
          <strong style={css("color: #14163C; font-family: 'Sora', sans-serif; font-size: 15px;")}>{data?.count ?? "—"}</strong> results {summary}
        </div>
        <div style={css("flex: 1;")} />
        <span style={css("font-size: 11.5px; color: #4C5571;")}>Sort:</span>
        <select value={state.sortField} onChange={(e) => set({ sortField: e.target.value })} style={css("font-size: 11.5px; font-weight: 600; background: #fff; border: 1px solid #DEE2EE; border-radius: 7px; padding: 5px 7px; cursor: pointer;")}>
          <option value="platformId">Platform ID</option><option value="scanDate">Scan Date</option><option value="vendorName">Vendor Name</option><option value="invoiceNumber">Invoice Number</option><option value="gross">Gross Total</option><option value="status">Status</option>
        </select>
        <Box onClick={() => set({ sortDir: state.sortDir === "asc" ? "desc" : "asc" })} style="font-size: 11.5px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 5px 11px; border-radius: 7px; cursor: pointer;" hoverStyle="background: #D7D9EE">{state.sortDir === "asc" ? "Ascending ↑" : "Descending ↓"}</Box>
        <select value={state.pageSize} onChange={(e) => set({ pageSize: e.target.value })} style={css("font-size: 11.5px; font-weight: 600; background: #fff; border: 1px solid #DEE2EE; border-radius: 7px; padding: 5px 7px; cursor: pointer;")}>
          <option value="100">100 / page</option><option value="250">250 / page</option><option value="500">500 / page</option><option value="1000">1,000 / page</option>
        </select>
        <Box onClick={() => refetch()} style="font-size: 11.5px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #D7D9EE">Refresh Results</Box>
        <Box onClick={exportExcel} style="font-size: 11.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 6px 13px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Export to Excel</Box>
      </div>

      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 12px; overflow: auto; max-height: calc(100vh - 158px);")}>
        <div style={css("min-width: 3080px;")}>
          <div style={css("display: flex; padding: 8px 14px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE; position: sticky; top: 0; z-index: 2;")}>
            {RESULT_COLS.map(([t, wd], i) => (
              <span key={i} style={css(`width: ${wd}; flex: none; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5571; padding-right: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>{t}</span>
            ))}
          </div>
          {(data?.rows || []).map((r, ri) => (
            <Box key={ri} onClick={() => openDetail(r.invoiceNumber)} style="display: flex; padding: 6.5px 14px; border-bottom: 1px solid #EDEFF6; cursor: pointer; align-items: center;" hoverStyle="background: #F6F7FB">
              {cells(r).map((c, ci) => (
                <span key={ci} style={css(`width: ${c.wd}; flex: none; font-size: 11.5px; font-family: ${c.ff}; color: ${c.fg}; font-weight: ${c.w}; padding-right: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>{c.t}</span>
              ))}
            </Box>
          ))}
        </div>
      </div>
    </div>
  );
}
