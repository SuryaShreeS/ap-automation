"use client";

import { createElement, type CSSProperties, type ReactNode, useState } from "react";
import { css } from "@/lib/css";

type BoxProps = {
  as?: keyof JSX.IntrinsicElements;
  style?: string | CSSProperties;
  hoverStyle?: string;
  focusStyle?: string;
  activeStyle?: string;
  children?: ReactNode;
  // Pass-through for onClick, value, onChange, placeholder, type, title, etc.
  [key: string]: unknown;
};

// True void elements — they must never receive children (React throws otherwise).
const VOID_ELEMENTS = new Set(["input", "img", "br", "hr", "area", "base", "col", "embed", "link", "meta", "param", "source", "track", "wbr"]);

/**
 * Reproduces the prototype's `style-hover` / `style-focus`, and adds real click
 * affordances: a pressed state on every clickable, plus an automatic busy state
 * (spinner + disabled) whenever an `onClick` returns a Promise — so async actions
 * like Export to Excel clearly show they're working.
 */
export default function Box({ as = "div", style, hoverStyle, focusStyle, activeStyle, children, ...rest }: BoxProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [busy, setBusy] = useState(false);

  const userOnClick = rest.onClick as ((e: unknown) => unknown) | undefined;
  const clickable = typeof userOnClick === "function";
  const canHaveChildren = !VOID_ELEMENTS.has(as as string);

  // Default press feedback for anything clickable, unless the caller overrides it.
  const pressStyle = activeStyle ?? (clickable ? "filter: brightness(0.93); transform: translateY(0.5px);" : undefined);

  const mergedStyle: CSSProperties = {
    ...css(style),
    ...(hover && hoverStyle ? css(hoverStyle) : {}),
    ...(focus && focusStyle ? css(focusStyle) : {}),
    ...(pressed && pressStyle ? css(pressStyle) : {}),
    ...(busy ? { opacity: 0.7, cursor: "progress", pointerEvents: "none" as const } : {}),
  };

  const handlers: Record<string, unknown> = { style: mergedStyle };
  for (const k in rest) if (k !== "onClick") handlers[k] = (rest as Record<string, unknown>)[k];

  if (hoverStyle) {
    handlers.onMouseEnter = () => setHover(true);
    handlers.onMouseLeave = () => { setHover(false); setPressed(false); };
  } else if (clickable) {
    handlers.onMouseLeave = () => setPressed(false);
  }
  if (focusStyle) {
    handlers.onFocus = () => setFocus(true);
    handlers.onBlur = () => setFocus(false);
  }
  if (clickable) {
    handlers.onMouseDown = () => setPressed(true);
    handlers.onMouseUp = () => setPressed(false);
    handlers.onClick = (e: unknown) => {
      if (busy) return;
      const result = userOnClick!(e);
      if (result && typeof (result as { then?: unknown }).then === "function") {
        setBusy(true);
        Promise.resolve(result).finally(() => setBusy(false));
      }
    };
  }

  // Void elements (input, etc.) must be created with no children args at all.
  if (!canHaveChildren) return createElement(as as string, handlers);

  const spinner = busy ? createElement("span", { className: "ap-spinner", key: "sp" }) : null;
  return createElement(as as string, handlers, spinner, children);
}
