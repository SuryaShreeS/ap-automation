"use client";

import { css } from "@/lib/css";

export type ToastItem = { id: number; msg: string };

/** Bottom-right toast stack. Replaces the prototype's alert() demo affordances. */
export default function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div style={css("position: fixed; bottom: 18px; right: 18px; display: flex; flex-direction: column; gap: 8px; z-index: 1000; max-width: 420px;")}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          style={css(
            "background: #0A0F1C; color: #fff; font-size: 12.5px; line-height: 1.5; padding: 11px 14px; border-radius: 10px; box-shadow: 0 12px 32px rgba(10,15,28,0.32); cursor: pointer; border-left: 3px solid #F1582A;"
          )}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
