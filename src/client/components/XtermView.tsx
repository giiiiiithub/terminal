/**
 * XtermView — one xterm.js instance bound to one host PTY session.
 *
 * - Output flows host -> browser through a long-poll `read` loop that runs
 *   only while the tab is active (inactive sessions buffer on the host).
 *   Transient RPC failures are retried with backoff instead of killing the
 *   loop; only a session that no longer exists stops it.
 * - Input flows browser -> host through `write` on every xterm onData event.
 * - Resize is reported after every fit() (debounced, deduplicated); the
 *   initial 80x24 session is corrected as soon as the viewport has real
 *   dimensions.
 * - The toolbar reaches the active view through the module-level termViews
 *   registry (copy / paste / clear).
 */
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  READ_RETRY_BASE_MS,
  READ_RETRY_MAX_MS,
  READ_TIMEOUT_MS,
  RESIZE_DEBOUNCE_MS
} from "../../constants.js";
import { TermApiError, type TermApi } from "../api.js";
import type { TermExit } from "../../types.js";
import type { TermTab } from "../store.js";

/** Imperative handle the toolbar uses for one terminal view. */
export interface XtermHandle {
  copy(): void;
  paste(): void;
  clear(): void;
}

/** Live views keyed by session id; the toolbar looks up the active tab. */
export const termViews = new Map<string, XtermHandle>();

export function XtermView(props: {
  api: TermApi;
  tab: TermTab;
  active: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onExit: (id: string, exit: TermExit) => void;
  /** null clears the panel error banner (e.g. after a read-loop recovery). */
  onError: (message: string | null) => void;
}): JSX.Element {
  const { api, tab, active, t, onExit, onError } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const endedRef = useRef(false);
  /** Last dimensions sent to the host, to skip redundant resize RPCs. */
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  /** First write failure after a success is surfaced once, not per keystroke. */
  const writeFailedRef = useRef(false);
  const [ready, setReady] = useState(false);

  /** Fit and push the current size to the host unless it is unchanged. */
  function sendResize(): void {
    const term = termRef.current;
    if (term === null) return;
    const cols = term.cols;
    const rows = term.rows;
    if (cols <= 0 || rows <= 0) return;
    const last = lastResizeRef.current;
    if (last !== null && last.cols === cols && last.rows === rows) return;
    lastResizeRef.current = { cols, rows };
    void api.resize(tab.id, cols, rows).catch(() => {
      /* transient; the next fit retries */
    });
  }

  // Create the terminal once per session id.
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    endedRef.current = false;
    writeFailedRef.current = false;

    const term = new Terminal({
      allowTransparency: true,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.15,
      scrollback: 5000,
      theme: {
        background: "#0e1116",
        foreground: "#d6dde5",
        cursor: "#4d9fff",
        cursorAccent: "#0e1116",
        selectionBackground: "rgba(77,159,255,.35)",
        black: "#161a20",
        brightBlack: "#4b5563",
        red: "#f85149",
        brightRed: "#ff7b72",
        green: "#3fb950",
        brightGreen: "#56d364",
        yellow: "#d29922",
        brightYellow: "#e3b341",
        blue: "#58a6ff",
        brightBlue: "#79c0ff",
        magenta: "#bc8cff",
        brightMagenta: "#d2a8ff",
        cyan: "#39c5cf",
        brightCyan: "#56d4dd",
        white: "#d6dde5",
        brightWhite: "#f0f6fc"
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    fitRef.current = fit;
    term.open(host);
    try {
      fit.fit();
    } catch {
      /* hidden container */
    }
    termRef.current = term;

    const handle: XtermHandle = {
      copy: () => {
        const selection = term.getSelection();
        if (selection !== "") {
          void navigator.clipboard.writeText(selection).catch(() => {});
        }
      },
      paste: () => {
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text !== "") term.paste(text);
          })
          .catch(() => {});
      },
      clear: () => term.clear()
    };
    termViews.set(tab.id, handle);

    term.onData((data) => {
      if (endedRef.current) return;
      void api.write(tab.id, data).then(
        () => {
          writeFailedRef.current = false;
        },
        (error: unknown) => {
          if (endedRef.current) return;
          if (error instanceof TermApiError && error.code === "no-session") {
            // Session ended; the read loop reports the exit. Drop keystrokes.
            return;
          }
          // Surface the first failure once; the read loop clears the banner
          // as soon as the connection recovers.
          if (!writeFailedRef.current) {
            writeFailedRef.current = true;
            onError(`write failed: ${(error as Error).message}`);
          }
        }
      );
    });

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      if (event.ctrlKey && event.shiftKey) {
        if (event.code === "KeyC") {
          handle.copy();
          return false;
        }
        if (event.code === "KeyV") {
          handle.paste();
          return false;
        }
      }
      return true;
    });

    let resizeTimer: number | undefined;
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        return;
      }
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(sendResize, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(host);
    setReady(true);

    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      termViews.delete(tab.id);
      fitRef.current = null;
      termRef.current = null;
      term.dispose();
      setReady(false);
    };
  }, [tab.id]);

  // Re-fit and re-focus when this tab becomes active (dimensions may have
  // changed while it was hidden, and the host session should match).
  useEffect(() => {
    if (!active || !ready) return;
    const frame = requestAnimationFrame(() => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (term === null || fit === null) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      sendResize();
      term.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, ready, tab.id]);

  // Long-poll read loop: drains host output while this tab is active.
  // Transient errors back off and retry instead of terminating the loop; the
  // banner is shown on the first failure and cleared on the first success.
  useEffect(() => {
    if (!active || !ready || tab.exited !== null) return;
    let alive = true;
    let failures = 0;
    let reportedError: string | null = null;
    void (async () => {
      while (alive) {
        let result;
        try {
          result = await api.read(tab.id, READ_TIMEOUT_MS);
        } catch (error) {
          if (!alive) break;
          if (error instanceof TermApiError && error.code === "no-session") {
            // The host no longer tracks this session (killed or pruned):
            // treat it as exited so the tab flips to the reopen state.
            onExit(tab.id, { code: -1 });
            break;
          }
          const message = (error as Error).message;
          if (reportedError !== message) {
            reportedError = message;
            onError(message);
          }
          failures += 1;
          const delay = Math.min(
            READ_RETRY_MAX_MS,
            READ_RETRY_BASE_MS * 2 ** Math.min(failures - 1, 4)
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        if (!alive) break;
        failures = 0;
        if (reportedError !== null) {
          reportedError = null;
          onError(null);
        }
        if (result.data !== "") {
          termRef.current?.write(result.data);
        }
        if (result.exit !== null) {
          endedRef.current = true;
          onExit(tab.id, result.exit);
          break;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [active, ready, tab.id, tab.exited]);

  return (
    <div className="term-viewport" ref={hostRef}>
      {tab.exited !== null ? (
        <div className="term-notice">
          <span>{t("state.exited", { code: tab.exited.code })}</span>
        </div>
      ) : null}
    </div>
  );
}
