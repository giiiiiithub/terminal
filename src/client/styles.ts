/**
 * Tiny CSS-in-JS: injects one <style data-plugin> tag for the whole plugin
 * (xterm.css + the panel skin) and exports class names. The DSH module loader
 * removes tags owned by a plugin when it unloads, so a fixed tag id is safe
 * across HMR reloads (the tag is recreated if missing).
 */
import { XTERM_CSS } from "../xterm-css.js";

const TAG_ID = "dsh-terminal/styles";

const CSS = [
  XTERM_CSS,
  `/* term-build-6 */

[data-term-root] {
  --term-border: var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  --term-text: var(--dsw-alias-label-primary, inherit);
  --term-text-dim: var(--dsw-alias-label-secondary, rgba(128,128,128,.8));
  --term-bg: var(--dsw-alias-bg-layer-1, #0e1116);
  --term-accent: var(--dsw-alias-brand-primary, #4d9fff);
  box-sizing: border-box;
  color: var(--term-text);
  font-size: 13px;
  line-height: 1.5;
}
[data-term-root] *, [data-term-root] *::before, [data-term-root] *::after { box-sizing: border-box; }

/* header glyph + session badge */
.term-glyph {
  font-weight: 700; color: var(--term-accent);
  font-family: Consolas, "Courier New", monospace; letter-spacing: -1px;
}
/* the >_ mark in the session-header button: black + bold */
.term-header-btn .term-glyph {
  color: #000;
  font-weight: 800;
}
.term-badge {
  min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 9px; background: var(--term-accent); color: #fff;
  font-size: 11px; line-height: 18px; text-align: center; font-weight: 600;
}

/* expanded panel */
.term-panel {
  /* Positioned so absolutely-placed notices (error banner overlays) anchor to
   * the panel instead of the viewport. */
  position: relative;
  border: 1px solid var(--term-border);
  border-radius: 8px;
  background: var(--term-bg);
  overflow: hidden;
  display: flex; flex-direction: column;
}
.term-toolbar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--term-border);
  flex-wrap: wrap;
}
.term-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px;
  border-radius: 6px; cursor: pointer;
  color: var(--term-text-dim); font-size: 12px;
  border: 1px solid transparent; white-space: nowrap;
  max-width: 220px;
}
.term-tab-label { overflow: hidden; text-overflow: ellipsis; }
.term-tab-active {
  color: var(--term-text); background: var(--term-bg);
  border-color: var(--term-border);
}
.term-tab-exited { text-decoration: line-through; opacity: .7; }
.term-tab-x {
  border: none; background: transparent; color: var(--term-text-dim);
  cursor: pointer; font-size: 12px; padding: 0 2px; line-height: 1;
}
.term-tab-x:hover { color: var(--dsw-alias-state-error-primary, #f85149); }
.term-btn {
  background: transparent; color: var(--term-text);
  border: 1px solid var(--term-border); border-radius: 6px;
  padding: 2px 9px; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.term-btn:hover:not(:disabled) { border-color: var(--term-accent); color: var(--term-accent); }
.term-btn:disabled { opacity: .45; cursor: default; }
.term-btn-primary {
  background: var(--term-accent); border-color: var(--term-accent); color: #fff; font-weight: 600;
}
.term-btn-danger:hover:not(:disabled) { border-color: var(--dsw-alias-state-error-primary, #f85149); color: var(--dsw-alias-state-error-primary, #f85149); }
.term-spacer { flex: 1; }

/* terminal viewport (height/flex overrides below keep the flex layout) */
.term-viewport {
  position: relative;
  background: #0e1116;
  padding: 6px 0 6px 8px;
}
.term-viewport .xterm { height: 100%; }
.term-viewport .xterm .xterm-viewport { background: transparent !important; }
.term-notice {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--term-text-dim); font-size: 12px; gap: 8px;
  background: rgba(14, 17, 22, .7);
}

/* persistent error banner above the terminal body */
.term-error {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  color: var(--dsw-alias-state-error-primary, #f85149);
  font-size: 12px;
  border-bottom: 1px solid var(--term-border);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #f85149) 10%, transparent);
  flex: none;
}

/* header action */
.term-header-btn {
  background: transparent; color: var(--term-text);
  border: 1px solid var(--term-border); border-radius: 6px;
  padding: 2px 8px; font-size: 12px; cursor: pointer;
  user-select: none;
}
.term-header-btn:hover { border-color: var(--term-accent); }
.term-header-btn.term-active { border-color: var(--term-accent); color: var(--term-accent); }
.term-shell-select { max-width: 180px; }
.term-cwd-select { max-width: 240px; }

/* ── two-row layout: actions on row 1, session tabs on row 2 ─────────────── */
.term-tabs-row {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--term-border);
  background: color-mix(in srgb, var(--term-bg) 70%, transparent);
  overflow-x: auto;
  flex: none;
}
.term-body {
  position: relative;
  flex: 1; min-height: 0;
  /* Column flex so the tab host wraps (flex: 1) actually stretch to the full
   * panel height. Without this the xterm area keeps its content height (the
   * current row count), the ResizeObserver never fires while the panel
   * resizes, and the terminal stops tracking the panel — leaving an empty
   * band inside the panel (visible as a gap in light themes). */
  display: flex; flex-direction: column;
}
.term-body > [data-term-host-wrap] { position: relative; flex: 1; min-height: 0; display: flex; }
.term-viewport { height: auto; flex: 1; min-height: 120px; }

/* ── top edge drag grip (dock mode) ──────────────────────────────────────── */
.term-grip-top {
  height: 7px; flex: none; cursor: ns-resize;
  background: transparent;
  border-radius: 6px 6px 0 0;
}
.term-grip-top:hover { background: var(--term-accent); opacity: .4; }

/* ── floating window ─────────────────────────────────────────────────────── */
.term-float {
  position: fixed;
  z-index: 2000;
  display: flex; flex-direction: column;
  background: var(--term-bg);
  border: 1px solid var(--term-border);
  border-radius: 10px;
  box-shadow: 0 14px 44px rgba(0, 0, 0, .5);
  box-sizing: border-box;
}
.term-float-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  cursor: move; user-select: none;
  border-bottom: 1px solid var(--term-border);
  background: color-mix(in srgb, var(--term-bg) 88%, transparent);
  flex: none;
  border-radius: 9px 9px 0 0;
}
.term-float-title { font-weight: 600; font-size: 12px; }
.term-float-body {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  overflow: hidden;
  border-radius: 0 0 9px 9px;
}
.term-float-body .term-body { flex: 1; min-height: 0; }

/* eight-direction resize handles */
.term-resize { position: absolute; z-index: 3; }
.term-resize-n  { top: -3px;  left: 10px;  right: 10px; height: 7px; cursor: ns-resize; }
.term-resize-s  { bottom: -3px; left: 10px; right: 10px; height: 7px; cursor: ns-resize; }
.term-resize-e  { right: -3px; top: 10px;  bottom: 10px; width: 7px; cursor: ew-resize; }
.term-resize-w  { left: -3px;  top: 10px;  bottom: 10px; width: 7px; cursor: ew-resize; }
.term-resize-ne { top: -3px;   right: -3px;  width: 14px; height: 14px; cursor: nesw-resize; }
.term-resize-nw { top: -3px;   left: -3px;   width: 14px; height: 14px; cursor: nwse-resize; }
.term-resize-se { bottom: -3px; right: -3px;  width: 14px; height: 14px; cursor: nwse-resize; }
.term-resize-sw { bottom: -3px; left: -3px;   width: 14px; height: 14px; cursor: nesw-resize; }
`
].join("\n");

export function ensureStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(TAG_ID) !== null) return;
  const style = document.createElement("style");
  style.id = TAG_ID;
  style.dataset.plugin = "dsh-terminal";
  style.textContent = CSS;
  document.head.appendChild(style);
}