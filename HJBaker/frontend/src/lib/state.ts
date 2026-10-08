"use client";

import { createContext, useContext } from "react";

// Every filter field is stored here (values + per-field operator), so the filter
// is fully controlled: it persists across tabs/screens, Clear resets it, and a
// dashboard click-through can pre-load it.
export type Crit = {
  values: Record<string, string>;
  ops: Record<string, string>;
};

export type AppState = {
  screen: string; // home|search|detail|create|matching|dashboard|inflow|pqueues|listadmin|useradmin|audit
  returnTo: string | null; // screen to go back to from Invoice Detail
  dashVariant: string; // all|aging|erp|nonpo|po|co405410|reports|kpis|analytics (tabs inside Dashboards)
  detailId: string;
  detailTab: string; // lines|notes|receipts
  editMode: boolean;
  showPdf: boolean;
  pdfZoom: number;
  selectedField: string | null;
  sortField: string;
  sortDir: string; // asc|desc
  pageSize: string;
  crit: Crit;
  critApplied: Crit | null;
  critTab: string; // header|lines|notes|receipts
  searchTab: string; // filter|results (master tabs of the merged Search page)
  matchFilter: { receipt: string; bol: string; date: string };
  receiptDesel: Record<string, Record<number, boolean>>;
  listAdminTab: string;
  listSel: string;
  inflowTab: string; // incoming | review
  classifyId: string | null; // document open in the classify workspace
  procQueue: string; // PO | NONPO | PREPAY | CREDIT | REBILL
  procBucket: string; // all | unprocessed | … (status sub-queue)
  currentUser: string;
};

export const emptyCrit = (): Crit => ({ values: { company: "all", status: "all" }, ops: {} });

export const initialState: AppState = {
  screen: "home",
  returnTo: null,
  dashVariant: "all",
  detailId: "INV-88412",
  detailTab: "lines",
  editMode: false,
  showPdf: true,
  pdfZoom: 1,
  selectedField: null,
  sortField: "platformId",
  sortDir: "desc",
  pageSize: "250",
  crit: emptyCrit(),
  critApplied: null,
  critTab: "header",
  searchTab: "filter",
  matchFilter: { receipt: "", bol: "", date: "" },
  receiptDesel: {},
  listAdminTab: "items",
  listSel: "Sales Channel",
  inflowTab: "incoming",
  classifyId: null,
  procQueue: "PO",
  procBucket: "all",
  currentUser: "Ivy Chen",
};

export type AppCtx = {
  state: AppState;
  set: (patch: Partial<AppState>) => void;
  toast: (msg: string) => void;
};

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
