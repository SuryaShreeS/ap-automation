"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Box from "../Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";

const TABS: [string, string][] = [
  ["items", "List Item Maintenance"], ["companies", "Companies"], ["inflowrouting", "Routing Rules"],
  ["multibol", "Multi BOL Vendors"], ["emailappr", "Email Approval Approvers"],
  ["interco", "Manual Match (Interco) Vendors"], ["soldto", "Sold-to → Company"],
  ["routing", "Vendor Routing"], ["rules", "Rules & Thresholds"],
];

// Column config per structured table: [header, payloadKey, sizing, styleHint]
type Col = { t: string; k: string; wd?: string; fx?: string; bold?: boolean; mono?: boolean; fg?: string };
const TABLE_COLS: Record<string, Col[]> = {
  multibol: [
    { t: "Vendor", k: "vendor", fx: "1", bold: true }, { t: "BP Code", k: "bp", wd: "110px", mono: true, fg: "#2E3391" }, { t: "Behavior", k: "behavior", fx: "1.6" },
  ],
  emailappr: [
    { t: "Approver", k: "approver", fx: "1", bold: true }, { t: "Email", k: "email", fx: "1.2", mono: true },
    { t: "Limit", k: "limit", wd: "100px", mono: true }, { t: "Email actions", k: "actions", wd: "110px", bold: true, fg: "#177C53" },
  ],
  interco: [
    { t: "Vendor", k: "vendor", fx: "1", bold: true }, { t: "BP Code", k: "bp", wd: "110px", mono: true, fg: "#2E3391" }, { t: "Handling", k: "handling", fx: "1.6" },
  ],
  soldto: [
    { t: "Sold-to name (extracted)", k: "sold_to", fx: "1.4", bold: true }, { t: "Company", k: "company", wd: "160px", mono: true, fg: "#2E3391", bold: true },
  ],
  routing: [
    { t: "Vendor", k: "vendor", fx: "1", bold: true }, { t: "Route Type", k: "route_type", wd: "100px", mono: true },
    { t: "Assigned coder", k: "coder", wd: "130px" }, { t: "Approval chain", k: "chain", fx: "1.5" },
  ],
};

export default function ListAdministration() {
  const { state, set } = useApp();
  const tab = state.listAdminTab;
  return (
    <div style={css("padding: 18px 22px; display: flex; flex-direction: column; gap: 13px;")}>
      <div style={css("display: flex; gap: 3px; background: #fff; border: 1px solid #DEE2EE; border-radius: 10px; padding: 4px; align-self: flex-start; flex-wrap: wrap;")}>
        {TABS.map(([k, label]) => (
          <div key={k} onClick={() => set({ listAdminTab: k })} style={css(`font-size: 11.5px; font-weight: 700; padding: 6px 12px; border-radius: 7px; cursor: pointer; white-space: nowrap; color: ${tab === k ? "#fff" : "#6B7493"}; background: ${tab === k ? "#2E3391" : "transparent"};`)}>{label}</div>
        ))}
      </div>
      {tab === "items" && <Items />}
      {tab === "companies" && <Companies />}
      {tab === "inflowrouting" && <RoutingRules />}
      {TABLE_COLS[tab] && <TableView tabKey={tab} />}
      {tab === "rules" && <Rules />}
    </div>
  );
}

function Companies() {
  const { toast } = useApp();
  const qc = useQueryClient();
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [renames, setRenames] = useState<Record<string, string>>({});
  const { data } = useQuery({
    queryKey: ["companies"],
    queryFn: () => api.get<{ rows: { id: string; name: string; invoices: number }[] }>("/admin/companies"),
  });
  const rows = data?.rows || [];

  // Company changes ripple everywhere counts/company lists are shown.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["companies"] });
    qc.invalidateQueries({ queryKey: ["overview-matrix"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
    qc.invalidateQueries({ queryKey: ["home"] });
  };

  const add = async () => {
    if (!newId.trim() || !newName.trim()) { toast("Enter both a company code and a name."); return; }
    try {
      await api.post("/admin/companies", { id: newId.trim(), name: newName.trim() });
      setNewId(""); setNewName("");
      refresh();
      toast(`Company ${newId.trim()} added — dashboards updated.`);
    } catch (e: any) { toast(e.message); }
  };
  const rename = async (id: string) => {
    const name = (renames[id] ?? "").trim();
    const current = rows.find((r) => r.id === id)?.name;
    if (!name || name === current) return;
    try {
      await api.patch(`/admin/companies/${id}`, { name });
      refresh();
      toast(`Company ${id} renamed to “${name}”.`);
    } catch (e: any) { toast(e.message); }
  };
  const remove = async (id: string) => {
    try {
      await api.del(`/admin/companies/${id}`);
      refresh();
      toast(`Company ${id} deleted.`);
    } catch (e: any) { toast(e.message); }
  };

  return (
    <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
      <div style={css("padding: 11px 16px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE; display: flex; align-items: center; gap: 8px;")}>
        <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>Companies</span>
      </div>
      <div style={css("display: flex; padding: 8px 16px; background: #FBFBFE; border-bottom: 1px solid #EDEFF6;")}>
        <span style={css("width: 80px; flex: none; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #5B6788;")}>Code</span>
        <span style={css("flex: 1; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #5B6788;")}>Name (click to edit)</span>
        <span style={css("width: 90px; flex: none; text-align: right; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #5B6788;")}>Invoices</span>
        <span style={css("width: 74px; flex: none;")} />
      </div>
      {rows.map((r) => (
        <div key={r.id} style={css("display: flex; align-items: center; padding: 7px 16px; border-bottom: 1px solid #EDEFF6;")}>
          <span style={css("width: 80px; flex: none; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: #2E3391;")}>{r.id}</span>
          <span style={css("flex: 1; padding-right: 12px;")}>
            <Box
              as="input"
              value={renames[r.id] ?? r.name}
              onChange={(e: any) => setRenames({ ...renames, [r.id]: e.target.value })}
              onBlur={() => rename(r.id)}
              onKeyDown={(e: any) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              style="width: 100%; font-size: 12.5px; font-weight: 600; color: #14163C; border: 1px solid transparent; border-radius: 6px; padding: 4px 7px; outline: none; background: transparent;"
              hoverStyle="border-color: #DEE2EE; background: #FBFBFE"
              focusStyle="border-color: #2E3391; background: #fff"
            />
          </span>
          <span style={css("width: 90px; flex: none; text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #4C5571;")}>{r.invoices}</span>
          <span style={css("width: 74px; flex: none; text-align: right;")}>
            {r.invoices === 0 ? (
              <Box onClick={() => remove(r.id)} style="display: inline-block; font-size: 10.5px; font-weight: 700; color: #B23413; background: #FDEDE7; padding: 3px 10px; border-radius: 7px; cursor: pointer;" hoverStyle="background: #FBD8CC">Delete</Box>
            ) : (
              <span title="Companies with invoices can't be deleted" style={css("font-size: 10px; color: #5B6788;")}>in use</span>
            )}
          </span>
        </div>
      ))}
      <div style={css("display: flex; gap: 8px; padding: 10px 16px; background: #FBFBFE;")}>
        <Box as="input" value={newId} onChange={(e: any) => setNewId(e.target.value)} placeholder="Code (e.g. 500)" style="width: 110px; font-size: 12px; font-family: 'JetBrains Mono', monospace; border: 1px solid #DEE2EE; border-radius: 8px; padding: 6px 9px; outline: none;" focusStyle="border-color: #2E3391" />
        <Box as="input" value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="Company name…" style="flex: 1; font-size: 12px; border: 1px solid #DEE2EE; border-radius: 8px; padding: 6px 9px; outline: none;" focusStyle="border-color: #2E3391" />
        <Box onClick={add} style="font-size: 11.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 6px 16px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Add Company</Box>
      </div>
    </div>
  );
}

function Items() {
  const { state, set } = useApp();
  const qc = useQueryClient();
  const [add, setAdd] = useState("");
  const { data } = useQuery({ queryKey: ["dropdowns"], queryFn: () => api.get<{ lists: { name: string; items: { code: string; label: string }[] }[] }>("/admin/dropdowns") });
  const lists = data?.lists || [];
  const sel = state.listSel;
  const current = lists.find((l) => l.name === sel) || lists[0];

  const addItem = async () => {
    if (!add.trim()) return;
    const code = add.trim().slice(0, 3).toUpperCase();
    await api.post("/admin/dropdowns", { list_key: "dropdown", code, label: add.trim(), payload: { list: sel } });
    setAdd("");
    qc.invalidateQueries({ queryKey: ["dropdowns"] });
  };

  return (
    <div style={css("display: grid; grid-template-columns: 250px 1fr; gap: 14px; align-items: start;")}>
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
        <div style={css("padding: 10px 15px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #4C5571;")}>Lists</div>
        {lists.map((l) => (
          <Box key={l.name} onClick={() => set({ listSel: l.name })} style={`padding: 8px 15px; border-bottom: 1px solid #EDEFF6; cursor: pointer; font-size: 12.5px; font-weight: ${sel === l.name ? "700" : "500"}; color: ${sel === l.name ? "#2E3391" : "#4C5571"}; background: ${sel === l.name ? "#ECEDF7" : "transparent"};`} hoverStyle="background: #F6F7FB">{l.name}</Box>
        ))}
      </div>
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
        <div style={css("padding: 10px 16px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE; display: flex; align-items: center; gap: 8px;")}>
          <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>{current?.name} · dropdown values</span>
        </div>
        {(current?.items || []).map((it, i) => (
          <div key={i} style={css("display: flex; gap: 10px; padding: 9px 16px; border-bottom: 1px solid #EDEFF6; align-items: center;")}>
            <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #2E3391; width: 90px; flex: none;")}>{it.code}</span>
            <span style={css("font-size: 12.5px; font-weight: 600; flex: 1;")}>{it.label}</span>
            <span style={css("font-size: 10px; font-weight: 700; color: #177C53; background: #EAF7F1; padding: 2px 8px; border-radius: 999px;")}>Active</span>
          </div>
        ))}
        <div style={css("padding: 10px 16px; display: flex; gap: 8px;")}>
          <Box as="input" value={add} onChange={(e: any) => setAdd(e.target.value)} placeholder="Add item…" style="flex: 1; font-size: 12px; border: 1px solid #DEE2EE; border-radius: 8px; padding: 7px 11px; outline: none;" focusStyle="border-color: #2E3391" />
          <Box onClick={addItem} style="font-size: 11.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 7px 14px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Add</Box>
        </div>
      </div>
    </div>
  );
}

function TableView({ tabKey }: { tabKey: string }) {
  const cols = TABLE_COLS[tabKey];
  const { data } = useQuery({ queryKey: ["adminTable", tabKey], queryFn: () => api.get<{ rows: any[]; note: string }>(`/admin/tables/${tabKey}`) });
  const rows = data?.rows || [];
  return (
    <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
      <div style={css("display: flex; padding: 9px 18px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE;")}>
        {cols.map((c, i) => (
          <span key={i} style={css(`${c.wd ? `width: ${c.wd}; flex: none;` : `flex: ${c.fx};`} font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #4C5571; padding-right: 12px;`)}>{c.t}</span>
        ))}
      </div>
      {rows.map((r, ri) => (
        <div key={ri} style={css("display: flex; padding: 10px 18px; border-bottom: 1px solid #EDEFF6; align-items: center;")}>
          {cols.map((c, i) => (
            <span key={i} style={css(`${c.wd ? `width: ${c.wd}; flex: none;` : `flex: ${c.fx};`} font-size: 12px; font-family: ${c.mono ? "'JetBrains Mono', monospace" : "'Manrope', sans-serif"}; color: ${c.fg || (c.bold ? "#14163C" : "#4C5571")}; font-weight: ${c.bold ? "700" : "500"}; padding-right: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)}>{r[c.k]}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Rules() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["rules"], queryFn: () => api.get<{ rules: { key: string; label: string; enabled: boolean }[]; thresholds: any }>("/admin/rules") });
  const toggle = async (key: string, enabled: boolean) => {
    await api.patch(`/admin/rules/${key}`, { enabled: !enabled });
    qc.invalidateQueries({ queryKey: ["rules"] });
  };
  const th = data?.thresholds;
  return (
    <div style={css("display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start;")}>
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; padding: 18px;")}>
        <div style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; margin-bottom: 10px;")}>AP Final Review rules (FR-44)</div>
        {(data?.rules || []).map((r) => (
          <div key={r.key} style={css("display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #EDEFF6;")}>
            <div onClick={() => toggle(r.key, r.enabled)} style={css(`width: 32px; height: 19px; border-radius: 999px; background: ${r.enabled ? "#2E3391" : "#C3CADD"}; position: relative; cursor: pointer; flex: none; transition: background 140ms;`)}>
              <div style={css(`width: 15px; height: 15px; border-radius: 999px; background: #fff; position: absolute; top: 2px; left: ${r.enabled ? "15px" : "2px"}; transition: left 140ms;`)} />
            </div>
            <span style={css("font-size: 12px; font-weight: 600; flex: 1;")}>{r.label}</span>
          </div>
        ))}
      </div>
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; padding: 18px; display: flex; flex-direction: column; gap: 11px;")}>
        <div style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700;")}>Auto-approval thresholds (FR-45) <span style={css("font-size: 9.5px; font-weight: 700; color: #8A6D05; background: #FDF6E3; padding: 2px 7px; border-radius: 999px; margin-left: 5px;")}>DISABLED BY DEFAULT</span></div>
        <div style={css("display: flex; flex-direction: column; gap: 6px;")}>
          <Row label="Max amount" value={th?.maxAmount} />
          <Row label="Min extraction confidence" value={th?.minConfidence} />
          <Row label="Sales channel rules (Liquid/Acid/Solids)" value={th?.salesChannelRules} link />
          <Row label="Vendor hierarchy list" value={th?.vendorHierarchy} link />
        </div>
      </div>
    </div>
  );
}

const RULE_KIND_LABEL: Record<string, string> = {
  vendor_prepaid: "Prepaid vendor", vendor_netback: "Netback vendor", negative_total: "Negative total / cancellation",
  keyword: "Keyword", has_po: "PO reference found", fallback: "Fallback (no rule hit)", threshold: "Confidence threshold",
};
const QUEUE_LABEL: Record<string, string> = { PO: "PO", NONPO: "Non-PO", PREPAY: "Prepayments", CREDIT: "Credits", REBILL: "Rebills" };
const STRUCTURAL = new Set(["threshold", "fallback", "has_po", "negative_total"]);

type RRule = { id: number; priority: number; kind: string; value: string; queue: string; enabled: boolean; description: string };

/** Inflow classification rules: which queue a document routes to, and the
 * confidence threshold below which it waits in Manual Review. */
function RoutingRules() {
  const { toast } = useApp();
  const qc = useQueryClient();
  const [thEdit, setThEdit] = useState<string | null>(null);
  const [nKind, setNKind] = useState("vendor_prepaid");
  const [nValue, setNValue] = useState("");
  const [nQueue, setNQueue] = useState("PREPAY");
  const { data } = useQuery({ queryKey: ["routingRules"], queryFn: () => api.get<{ rules: RRule[] }>("/admin/routing-rules") });
  const rules = data?.rules || [];
  const threshold = rules.find((r) => r.kind === "threshold");

  // Rule changes affect where the NEXT classification routes — refresh inflow views.
  const refresh = () => {
    for (const key of ["routingRules", "inflow", "queues-v2", "home"]) qc.invalidateQueries({ queryKey: [key] });
  };

  const toggle = async (r: RRule) => {
    try { await api.patch(`/admin/routing-rules/${r.id}`, { enabled: !r.enabled }); refresh(); toast(`Rule ${r.enabled ? "disabled" : "enabled"}: ${RULE_KIND_LABEL[r.kind] || r.kind}${r.value ? ` “${r.value}”` : ""}`); }
    catch (e: any) { toast(e.message); }
  };
  const saveThreshold = async () => {
    if (thEdit == null || !threshold) return;
    try {
      await api.patch(`/admin/routing-rules/${threshold.id}`, { value: thEdit.trim() });
      setThEdit(null); refresh();
      toast(`Confidence threshold set to ${Math.round(parseFloat(thEdit) * 100)}% — documents below it wait in Manual Review.`);
    } catch (e: any) { toast(e.message); }
  };
  const remove = async (r: RRule) => {
    try { await api.del(`/admin/routing-rules/${r.id}`); refresh(); toast(`Rule removed: ${RULE_KIND_LABEL[r.kind]} “${r.value}”.`); }
    catch (e: any) { toast(e.message); }
  };
  const add = async () => {
    if (!nValue.trim()) { toast("Enter a vendor name or keyword."); return; }
    try {
      await api.post("/admin/routing-rules", { kind: nKind, value: nValue.trim(), queue: nQueue, priority: 20 });
      setNValue(""); refresh();
      toast(`Rule added: ${RULE_KIND_LABEL[nKind]} “${nValue.trim()}” → ${QUEUE_LABEL[nQueue]}.`);
    } catch (e: any) { toast(e.message); }
  };

  return (
    <div style={css("display: flex; flex-direction: column; gap: 14px;")}>
      {/* Threshold editor */}
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; padding: 15px 18px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;")}>
        <div style={css("flex: 1; min-width: 260px;")}>
          <div style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700;")}>Classification confidence threshold</div>
        </div>
        <Box as="input" value={thEdit ?? threshold?.value ?? ""} onChange={(e: any) => setThEdit(e.target.value)} placeholder="0.80"
             style="width: 90px; font-size: 13px; font-family: 'JetBrains Mono', monospace; font-weight: 700; border: 1px solid #DEE2EE; border-radius: 8px; padding: 7px 10px; outline: none; text-align: center;"
             focusStyle="border-color: #2E3391" />
        <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #5B6788;")}>= {Math.round(parseFloat(thEdit ?? threshold?.value ?? "0") * 100 || 0)}%</span>
        <Box onClick={saveThreshold} style="font-size: 11.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 7px 15px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Save threshold</Box>
      </div>

      {/* Rules table */}
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
        <div style={css("padding: 11px 16px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE; display: flex; align-items: center; gap: 8px;")}>
          <span style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>Inflow routing rules</span>
        </div>
        <div style={css("display: flex; padding: 8px 16px; background: #FBFBFE; border-bottom: 1px solid #EDEFF6;")}>
          {[["Pri", "44px"], ["Condition", "190px"], ["Value", "1"], ["Routes to", "110px"], ["Description", "1.5"], ["", "120px"]].map(([t, wd], i) => (
            <span key={i} style={css(`${wd === "1" || wd === "1.5" ? `flex: ${wd};` : `width: ${wd}; flex: none;`} font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #5B6788; padding-right: 10px;`)}>{t}</span>
          ))}
        </div>
        {rules.filter((r) => r.kind !== "threshold").map((r) => (
          <div key={r.id} style={css(`display: flex; align-items: center; padding: 8px 16px; border-bottom: 1px solid #EDEFF6; ${r.enabled ? "" : "opacity: 0.45;"}`)}>
            <span style={css("width: 44px; flex: none; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #5B6788;")}>{r.priority}</span>
            <span style={css("width: 190px; flex: none; font-size: 11px; font-weight: 700; color: #4C5571; padding-right: 10px;")}>{RULE_KIND_LABEL[r.kind] || r.kind}</span>
            <span style={css("flex: 1; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #14163C; font-weight: 600; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{r.value || "—"}</span>
            <span style={css("width: 110px; flex: none; padding-right: 10px;")}>
              <span style={css(`font-size: 10px; font-weight: 700; color: ${r.queue === "MANUAL_REVIEW" ? "#8A6D05" : "#2E3391"}; background: ${r.queue === "MANUAL_REVIEW" ? "#FDF6E3" : "#ECEDF7"}; padding: 2px 9px; border-radius: 999px;`)}>{QUEUE_LABEL[r.queue] || r.queue}</span>
            </span>
            <span style={css("flex: 1.5; font-size: 11px; color: #4C5571; padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")} title={r.description}>{r.description}</span>
            <span style={css("width: 120px; flex: none; display: flex; align-items: center; gap: 8px; justify-content: flex-end;")}>
              <div onClick={() => toggle(r)} style={css(`width: 32px; height: 19px; border-radius: 999px; background: ${r.enabled ? "#2E3391" : "#C3CADD"}; position: relative; cursor: pointer; flex: none; transition: background 140ms;`)}>
                <div style={css(`width: 15px; height: 15px; border-radius: 999px; background: #fff; position: absolute; top: 2px; left: ${r.enabled ? "15px" : "2px"}; transition: left 140ms;`)} />
              </div>
              {STRUCTURAL.has(r.kind) ? (
                <span title="Structural rule — disable instead of deleting" style={css("font-size: 9.5px; color: #5B6788;")}>core</span>
              ) : (
                <Box onClick={() => remove(r)} style="font-size: 10px; font-weight: 700; color: #B23413; background: #FDEDE7; padding: 3px 9px; border-radius: 7px; cursor: pointer;" hoverStyle="background: #FBD8CC">Delete</Box>
              )}
            </span>
          </div>
        ))}
        {/* Add rule */}
        <div style={css("display: flex; gap: 8px; padding: 10px 16px; background: #FBFBFE; align-items: center; flex-wrap: wrap;")}>
          <select value={nKind} onChange={(e) => setNKind(e.target.value)}
                  style={css("font-size: 11.5px; font-weight: 600; border: 1px solid #DEE2EE; border-radius: 8px; padding: 6px 9px; outline: none; background: #fff; color: #14163C;")}>
            <option value="vendor_prepaid">Prepaid vendor</option>
            <option value="vendor_netback">Netback vendor</option>
            <option value="keyword">Keyword</option>
          </select>
          <Box as="input" value={nValue} onChange={(e: any) => setNValue(e.target.value)} placeholder="Vendor name / keyword…"
               style="flex: 1; min-width: 180px; font-size: 12px; border: 1px solid #DEE2EE; border-radius: 8px; padding: 6px 9px; outline: none;" focusStyle="border-color: #2E3391" />
          <span style={css("font-size: 11px; color: #5B6788;")}>→</span>
          <select value={nQueue} onChange={(e) => setNQueue(e.target.value)}
                  style={css("font-size: 11.5px; font-weight: 600; border: 1px solid #DEE2EE; border-radius: 8px; padding: 6px 9px; outline: none; background: #fff; color: #14163C;")}>
            {Object.entries(QUEUE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <Box onClick={add} style="font-size: 11.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 6px 15px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">Add rule</Box>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, link }: { label: string; value?: string; link?: boolean }) {
  return (
    <div style={css("display: flex; justify-content: space-between; font-size: 12px;")}>
      <span style={css("font-weight: 700;")}>{label}</span>
      <span style={css(`font-family: 'JetBrains Mono', monospace; ${link ? "color: #2E3391;" : ""}`)}>{value}</span>
    </div>
  );
}
