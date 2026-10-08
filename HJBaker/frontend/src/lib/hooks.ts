"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { emptyCrit, useApp } from "./state";

/** Thin GET-query wrapper. */
export function useGet<T>(key: (string | number)[], path: string, enabled = true) {
  return useQuery<T>({ queryKey: key, queryFn: () => api.get<T>(path), enabled });
}

/** Shared "open the filtered results grid" action (dashboard/queue click-through). */
export function useOpenResults() {
  const { set } = useApp();
  return (patch: Record<string, string | undefined>, ops?: Record<string, string>) => {
    const crit = emptyCrit();
    for (const [field, value] of Object.entries(patch)) {
      if (value) crit.values[field] = value;
    }
    if (ops) crit.ops = { ...ops };
    // Land on the merged Search page's Results tab with the filter pre-coded
    // (also loaded into `crit` so the Filter tab shows it and the user can adjust).
    set({ screen: "search", searchTab: "results", crit, critApplied: crit });
  };
}
