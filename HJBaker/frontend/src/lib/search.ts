import { FIELD_LABEL } from "./constants";
import type { AppState, Crit } from "./state";

export type Criterion = { field: string; op: string; value: string };

/** The active (non-empty, non-"all") criteria from a filter state. */
export function activeCriteria(crit: Crit | null): Criterion[] {
  if (!crit) return [];
  return Object.entries(crit.values)
    .filter(([, v]) => v !== "" && v !== "all" && v != null)
    .map(([field, value]) => ({ field, op: crit.ops[field] || "=", value }));
}

/** Build the POST /search (and /search/export) body from app state. */
export function buildSearchBody(state: AppState) {
  return {
    criteria: activeCriteria(state.critApplied),
    sortField: state.sortField,
    sortDir: state.sortDir,
    pageSize: parseInt(state.pageSize, 10),
  };
}

/** Human-readable summary of applied criteria, e.g. "· Status = UNPROCESSED · Vendor Name LIKE %sulfur%". */
export function critSummary(crit: Crit | null): string {
  const cs = activeCriteria(crit);
  if (!cs.length) return "· all invoices";
  return (
    "· " +
    cs
      .map((c) => `${FIELD_LABEL[c.field] || c.field} ${c.op !== "=" ? c.op + " " : ""}${c.value}`)
      .join(" · ")
  );
}
