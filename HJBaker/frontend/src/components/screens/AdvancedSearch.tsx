"use client";

import Box from "../Box";
import { css } from "@/lib/css";
import { ALL_SEARCH_FIELDS, FIELD_LABEL, SEARCH_FIELDS, SEARCH_TABS, type FieldDef } from "@/lib/constants";
import { emptyCrit, useApp } from "@/lib/state";

const OPS = ["=", "<>", ">", "<", ">=", "<=", "LIKE", "BETWEEN"];
const FORM_KEYS = new Set(ALL_SEARCH_FIELDS.map((f) => f.key));

export default function AdvancedSearch() {
  const { state, set } = useApp();
  const crit = state.crit;
  const fields = SEARCH_FIELDS[state.critTab] || SEARCH_FIELDS.header;

  const valOf = (f: FieldDef) => crit.values[f.key] ?? (f.kind === "select" ? "all" : "");
  const opOf = (key: string) => crit.ops[key] ?? "=";
  const setVal = (key: string, v: string) => set({ crit: { ...crit, values: { ...crit.values, [key]: v } } });
  const setOp = (key: string, v: string) => set({ crit: { ...crit, ops: { ...crit.ops, [key]: v } } });

  const runSearch = () => set({ critApplied: { values: { ...crit.values }, ops: { ...crit.ops } }, searchTab: "results" });
  const clear = () => set({ crit: emptyCrit(), critApplied: null });

  // Criteria applied by dashboard/pipeline click-throughs that have no control in
  // this form (virtual workflow fields like Awaiting Approval / Sent<24h). Surface
  // them as removable chips so no filter is ever invisible.
  const hiddenCrit = Object.entries(crit.values).filter(
    ([k, v]) => !FORM_KEYS.has(k) && v !== "" && v !== "all" && v != null
  );
  const removeHidden = (key: string) => {
    const values = { ...crit.values };
    const ops = { ...crit.ops };
    delete values[key];
    delete ops[key];
    const next = { values, ops };
    // Chips represent already-applied filters — removal takes effect immediately.
    set({ crit: next, critApplied: state.critApplied ? next : null });
  };

  return (
    <div style={css("padding: 18px 22px; display: flex; flex-direction: column; gap: 12px;")}>
      <div style={css("display: flex; gap: 3px; background: #fff; border: 1px solid #DEE2EE; border-radius: 10px; padding: 4px; align-self: flex-start;")}>
        {SEARCH_TABS.map(([k, label]) => (
          <div key={k} onClick={() => set({ critTab: k })} style={css(`font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 7px; cursor: pointer; color: ${state.critTab === k ? "#fff" : "#6B7493"}; background: ${state.critTab === k ? "#2E3391" : "transparent"};`)}>{label}</div>
        ))}
      </div>

      {hiddenCrit.length > 0 && (
        <div style={css("background: #FDF6E3; border: 1px solid #EFD48B; border-radius: 10px; padding: 8px 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;")}>
          <span style={css("font-size: 11px; font-weight: 700; color: #8A6D05;")}>Also applied from the dashboard:</span>
          {hiddenCrit.map(([k, v]) => (
            <span key={k} style={css("display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #8A6D05; background: #fff; border: 1px solid #EFD48B; padding: 3px 9px; border-radius: 999px;")}>
              {FIELD_LABEL[k] || k}{v !== "true" ? `: ${v}` : ""}
              <span onClick={() => removeHidden(k)} title="Remove this filter" style={css("cursor: pointer; font-size: 12px; opacity: 0.7;")}>×</span>
            </span>
          ))}
        </div>
      )}

      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; padding: 16px 18px;")}>
        <div style={css("display: grid; grid-template-columns: 1fr 1fr; gap: 7px 26px;")}>
          {fields.map((f) => (
            <div key={f.key} style={css("display: flex; gap: 8px; align-items: center;")}>
              <span style={css("width: 140px; font-size: 11.5px; font-weight: 700; color: #4C5571; flex: none;")}>
                {f.label}{f.wild && <span style={css("color: #C7380D;")}> %</span>}
              </span>
              {f.kind === "select" ? (
                <>
                  <span style={css("width: 60px; flex: none;")} />
                  <select
                    value={valOf(f)}
                    onChange={(e) => setVal(f.key, e.target.value)}
                    style={css("flex: 1; font-size: 12px; font-weight: 600; color: #14163C; background: #fff; border: 1px solid #DEE2EE; border-radius: 7px; padding: 5px 8px; cursor: pointer; min-width: 0;")}
                  >
                    {(f.opts || []).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    {/* Combined values from dashboard/pipeline click-throughs (e.g. multi-status
                        Exceptions) aren't in the fixed list — surface them so they stay visible
                        and can be changed. */}
                    {!(f.opts || []).some(([v]) => v === valOf(f)) && (
                      <option value={valOf(f)}>{valOf(f)}</option>
                    )}
                  </select>
                </>
              ) : (
                <>
                  <select
                    value={opOf(f.key)}
                    onChange={(e) => setOp(f.key, e.target.value)}
                    style={css("font-size: 11px; font-family: 'JetBrains Mono', monospace; color: #4C5571; background: #F6F7FB; border: 1px solid #DEE2EE; border-radius: 7px; padding: 5px 4px; width: 60px; flex: none; cursor: pointer;")}
                  >
                    {OPS.map((o) => <option key={o} value={o}>{o === "<>" ? "≠" : o}</option>)}
                  </select>
                  <Box
                    as="input"
                    value={valOf(f)}
                    onChange={(e: any) => setVal(f.key, e.target.value)}
                    placeholder={f.ph || ""}
                    style="flex: 1; font-size: 12px; border: 1px solid #DEE2EE; border-radius: 7px; padding: 5px 9px; outline: none; min-width: 0; color: #14163C;"
                    focusStyle="border-color: #2E3391"
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={css("display: flex; gap: 10px; align-items: center; background: #fff; border: 1px solid #DEE2EE; border-radius: 12px; padding: 10px 16px;")}>
        <span style={css("font-size: 11.5px; font-weight: 700; color: #4C5571;")}>Default sort</span>
        <select value={state.sortField} onChange={(e) => set({ sortField: e.target.value })} style={css("font-size: 12px; font-weight: 600; background: #F6F7FB; border: 1px solid #DEE2EE; border-radius: 7px; padding: 5px 8px; cursor: pointer;")}>
          <option value="platformId">Platform ID</option><option value="scanDate">Scan Date</option><option value="vendorName">Vendor Name</option><option value="invoiceNumber">Invoice Number</option><option value="gross">Gross Total</option><option value="status">Status</option>
        </select>
        <Box onClick={() => set({ sortDir: state.sortDir === "asc" ? "desc" : "asc" })} style="font-size: 11.5px; font-weight: 700; color: #2E3391; background: #ECEDF7; padding: 5px 12px; border-radius: 7px; cursor: pointer;" hoverStyle="background: #D7D9EE">{state.sortDir === "asc" ? "Ascending ↑" : "Descending ↓"}</Box>
        <span style={css("font-size: 11px; color: #5B6788;")}>persisted for the session</span>
        <div style={css("flex: 1;")} />
        <Box onClick={clear} style="font-size: 12.5px; font-weight: 700; color: #4C5571; border: 1px solid #DEE2EE; padding: 8px 18px; border-radius: 9px; cursor: pointer;" hoverStyle="background: #F6F7FB">Clear</Box>
        <Box onClick={runSearch} style="font-size: 12.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 8px 22px; border-radius: 9px; cursor: pointer;" hoverStyle="background: #262A78">Search</Box>
      </div>
    </div>
  );
}
