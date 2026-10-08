"use client";

import { css } from "@/lib/css";
import { useApp } from "@/lib/state";
import AdvancedSearch from "./AdvancedSearch";
import SearchResults from "./SearchResults";

const TABS: [string, string][] = [
  ["filter", "Filter"],
  ["results", "Results"],
];

/** Unified Search: two master tabs — Filter (criteria) and Results (grid).
 * Dashboard click-throughs pre-code the filter and land here on Results. */
export default function Search() {
  const { state, set } = useApp();
  const tab = state.searchTab;

  return (
    <div>
      <div style={css("padding: 16px 22px 0; display: flex; align-items: center; gap: 12px;")}>
        <div style={css("display: flex; gap: 3px; background: #fff; border: 1px solid #DEE2EE; border-radius: 10px; padding: 4px;")}>
          {TABS.map(([k, label]) => (
            <div
              key={k}
              onClick={() => set({ searchTab: k })}
              style={css(`font-size: 12.5px; font-weight: 700; padding: 7px 20px; border-radius: 7px; cursor: pointer; color: ${tab === k ? "#fff" : "#6B7493"}; background: ${tab === k ? "#2E3391" : "transparent"};`)}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      {tab === "filter" ? <AdvancedSearch /> : <SearchResults />}
    </div>
  );
}
