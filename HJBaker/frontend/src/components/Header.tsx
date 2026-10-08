"use client";

import { css } from "@/lib/css";

export default function Header({ title }: { title: string }) {
  return (
    <header style={css("height: 52px; flex: none; background: #fff; border-bottom: 1px solid #DEE2EE; display: flex; align-items: center; gap: 12px; padding: 0 22px;")}>
      <div style={css("font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; flex: 1;")}>{title}</div>
      <span style={css("font-size: 10.5px; font-weight: 700; color: #177C53; background: #EAF7F1; padding: 3px 10px; border-radius: 999px;")}>Sage X3 · Connected</span>
      <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #4C5571;")}>Jul 13, 2026 · 09:41 ET</span>
    </header>
  );
}
