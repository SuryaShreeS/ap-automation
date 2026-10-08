"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { css } from "@/lib/css";
import { AppContext, initialState, type AppState } from "@/lib/state";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Toaster, { type ToastItem } from "./Toast";

import Home from "./screens/Home";
import HomeDashboards from "./screens/HomeDashboards";
import Search from "./screens/Search";
import InvoiceDetail from "./screens/InvoiceDetail";
import InvoiceCreate from "./screens/InvoiceCreate";
import ReceiptMatching from "./screens/ReceiptMatching";
import DocumentInflow from "./screens/DocumentInflow";
import ClassifyDoc from "./screens/ClassifyDoc";
import ProcessingQueues from "./screens/ProcessingQueues";
import ListAdministration from "./screens/ListAdministration";
import UserAdministration from "./screens/UserAdministration";
import AuditLog from "./screens/AuditLog";

const DASH_TITLES: Record<string, string> = {
  all: "Overview (All)",
  aging: "Overview Aging",
  erp: "ERP and Cancelled",
  nonpo: "Overview · Non-PO Only",
  po: "Overview · PO Only",
  co405410: "Overview · 405/410 Only",
  reports: "Reports (All)",
  kpis: "Invoice Dashboard",
  analytics: "Analytics",
};

const PROC_TITLES: Record<string, string> = {
  PO: "PO", NONPO: "Non-PO", PREPAY: "Prepayments", CREDIT: "Credits", REBILL: "Rebills",
};

function titleFor(state: AppState): string {
  switch (state.screen) {
    case "home":
      return "Home";
    case "dashboard":
      return "Dashboards · " + (DASH_TITLES[state.dashVariant] || "Overview");
    case "search":
      return state.searchTab === "results" ? "Search · Results" : "Search · Filter";
    case "detail":
      return "Invoice Detail";
    case "create":
      return "Invoice Create";
    case "matching":
      return "Receipt Matching";
    case "listadmin":
      return "List Administration";
    case "useradmin":
      return "User Administration";
    case "inflow":
      return "Inflow (Classifier)";
    case "classify":
      return "Classify Document";
    case "pqueues":
      return "Queue · " + (PROC_TITLES[state.procQueue] || "");
    case "audit":
      return "Audit Log";
    default:
      return "—";
  }
}

function Screen({ screen }: { screen: string }) {
  switch (screen) {
    case "home":
      return <Home />;
    case "dashboard":
      return <HomeDashboards />;
    case "search":
      return <Search />;
    case "detail":
      return <InvoiceDetail />;
    case "create":
      return <InvoiceCreate />;
    case "matching":
      return <ReceiptMatching />;
    case "inflow":
      return <DocumentInflow />;
    case "classify":
      return <ClassifyDoc />;
    case "pqueues":
      return <ProcessingQueues />;
    case "listadmin":
      return <ListAdministration />;
    case "useradmin":
      return <UserAdministration />;
    case "audit":
      return <AuditLog />;
    default:
      return null;
  }
}

export default function AppShell() {
  const [state, setState] = useState<AppState>(initialState);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  // Entering Invoice Detail from anywhere records where to go "‹ Back" to.
  const set = useCallback(
    (patch: Partial<AppState>) =>
      setState((s) => ({
        ...s,
        ...patch,
        ...(patch.screen === "detail" && s.screen !== "detail" && patch.returnTo === undefined
          ? { returnTo: s.screen }
          : {}),
      })),
    []
  );
  const toast = useCallback((msg: string) => {
    // Monotonic id — bursts (e.g. "Classify all" emitting one toast per document)
    // can land in the same millisecond, so a timestamp isn't unique enough.
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const ctx = useMemo(() => ({ state, set, toast }), [state, set, toast]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  return (
    <AppContext.Provider value={ctx}>
      <div style={css("display: flex; height: 100vh; width: 100vw; overflow: hidden;")}>
        <Sidebar />
        <main style={css("flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden;")}>
          <Header title={titleFor(state)} />
          <div style={css("flex: 1; overflow-y: auto; min-height: 0;")}>
            <Screen screen={state.screen} />
          </div>
        </main>
      </div>
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </AppContext.Provider>
  );
}
