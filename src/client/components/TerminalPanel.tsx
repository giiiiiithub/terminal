/**
 * TerminalPanel — the dock occupant / floating tool window. Layout:
 * action row (new/shell/cwd/copy/paste/clear + window controls), a separate
 * session-tab row underneath, and an xterm viewport that fills the rest.
 *
 * Window management (dock/float geometry, drag gestures) lives in
 * useTermWindow; the action row and tab row are presentational components in
 * TerminalToolbar. This component owns session lifecycle: shell/cwd choice,
 * open/close/reopen, auto-open on expand, and error state.
 */
import { useEffect, useRef, useState } from "react";
import type { TermApi } from "../api.js";
import {
  termTabLabel,
  termUiAddTab,
  termUiClearTabs,
  termUiMarkExited,
  termUiRemoveTab,
  termUiSetActive,
  termUiSetBusy,
  termUiSetError,
  termUiSetShell,
  termUiSetShells,
  termUiSetOpen,
  useTermUi
} from "../store.js";
import { termViews, XtermView } from "./XtermView.js";
import { TerminalTabRow, TerminalToolbar } from "./TerminalToolbar.js";
import { useTermWindow, type DragMode } from "./useTermWindow.js";

const RESIZE_HANDLES: Array<{ mode: DragMode; cls: string }> = [
  { mode: "float-n", cls: "term-resize-n" },
  { mode: "float-s", cls: "term-resize-s" },
  { mode: "float-e", cls: "term-resize-e" },
  { mode: "float-w", cls: "term-resize-w" },
  { mode: "float-ne", cls: "term-resize-ne" },
  { mode: "float-nw", cls: "term-resize-nw" },
  { mode: "float-se", cls: "term-resize-se" },
  { mode: "float-sw", cls: "term-resize-sw" }
];

export function TerminalPanel(props: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  api: TermApi;
  useWorkspaces?: <T>(selector: (state: { items: Array<{ path: string }> }) => T) => T;
  useSessions?: <T>(selector: (state: { byId: Record<string, { cwd?: string }> }) => T) => T;
  sessionId?: string | null;
}): JSX.Element | null {
  const { t, api, useWorkspaces, useSessions, sessionId } = props;
  const snapshot = useTermUi();
  const window = useTermWindow(snapshot.open);
  // The selector returns the store's items array by reference (stable between
  // updates) — mapping inside the selector would hand useSyncExternalStore a new
  // snapshot every render. The first item is the CURRENT session's workspace.
  const workspaceItems =
    useWorkspaces !== undefined ? useWorkspaces((state) => state.items) : null;
  const workspacePath = workspaceItems?.[0]?.path ?? "";
  const workspacePaths = workspaceItems?.map((item) => item.path) ?? null;
  /** The CURRENT session's workspace directory — read from the sessions store
   * byId record (same source the app's own ConversationRoot uses). */
  const sessionCwd =
    useSessions !== undefined && sessionId !== undefined && sessionId !== null
      ? (useSessions((state) => state.byId[sessionId]?.cwd ?? "") ?? "")
      : "";
  const currentCwd = sessionCwd !== "" ? sessionCwd : workspacePath;
  /** Dropdown options: current session workspace first, then all workspaces. */
  const cwdOptions =
    currentCwd === ""
      ? (workspacePaths ?? [])
      : [currentCwd, ...(workspacePaths ?? []).filter((path) => path !== currentCwd)];
  const cwdHintRef = useRef("");
  /** Working directory the next "+" session opens in; "" means the default. */
  const [cwdChoice, setCwdChoice] = useState("");
  /** Set once the user picks a directory by hand; until then the dropdown
   * follows the current session's workspace. */
  const cwdTouchedRef = useRef(false);
  /** Consecutive AUTO-open failures; past the cap the panel stops retrying so a
   * persistently failing session cannot spin the browser. Manual opens do not
   * count against the budget. */
  const autoOpenFailures = useRef(0);
  const prevOpenRef = useRef(snapshot.open);

  // Remember the first workspace path as the default cwd for new sessions.
  useEffect(() => {
    if (workspacePath !== "" && cwdHintRef.current === "") {
      cwdHintRef.current = workspacePath;
    }
  }, [workspacePath]);

  // Follow the CURRENT session's workspace unless the user picked one by hand.
  useEffect(() => {
    if (cwdTouchedRef.current) return;
    setCwdChoice(currentCwd !== "" ? currentCwd : workspacePath);
  }, [currentCwd, workspacePath]);

  // Discover available shells once.
  useEffect(() => {
    if (snapshot.shells !== null) return;
    let alive = true;
    void api
      .shells()
      .then((shells) => {
        if (alive) termUiSetShells(shells);
      })
      .catch(() => {
        /* shells stay unknown; the host default still applies */
      });
    return () => {
      alive = false;
    };
  }, [snapshot.shells]);

  async function openSession(shellPath?: string, source: "auto" | "manual" = "manual"): Promise<void> {
    if (snapshot.busy) return;
    termUiSetBusy(true);
    termUiSetError(null);
    try {
      const result = await api.open({
        ...(shellPath !== undefined ? { shell: shellPath } : {}),
        ...(cwdChoice !== ""
          ? { cwd: cwdChoice }
          : cwdHintRef.current !== ""
            ? { cwd: cwdHintRef.current }
            : {}),
        cols: 80,
        rows: 24
      });
      termUiAddTab({
        id: result.id,
        label: termTabLabel(result.shell, result.cwd),
        shell: result.shell,
        cwd: result.cwd,
        pid: result.pid,
        exited: null
      });
    } catch (error) {
      if (source === "auto") autoOpenFailures.current += 1;
      termUiSetError((error as Error).message);
    } finally {
      termUiSetBusy(false);
    }
  }

  // Reset the auto-open failure budget whenever the user re-expands the panel.
  useEffect(() => {
    if (snapshot.open && !prevOpenRef.current) autoOpenFailures.current = 0;
    prevOpenRef.current = snapshot.open;
  }, [snapshot.open]);

  // Auto-open the first session when the panel expands with no tabs, but stop
  // after 3 consecutive failures: an open that can never succeed must surface
  // as an error, not as an infinite retry loop that pegs the browser. The
  // selected shell from the dropdown applies here too, matching the "+" button.
  useEffect(() => {
    if (!snapshot.open || snapshot.tabs.length > 0 || snapshot.busy) return;
    if (autoOpenFailures.current >= 3) return;
    void openSession(selectedShell?.path, "auto");
  }, [snapshot.open, snapshot.tabs.length, snapshot.busy, snapshot.shells]);

  function closeTab(id: string): void {
    void api.kill(id).catch(() => {});
    termUiRemoveTab(id);
  }

  /** Close the window: kill every session, clear tabs, and collapse. */
  function closeAll(): void {
    for (const tab of snapshot.tabs) void api.kill(tab.id).catch(() => {});
    termUiClearTabs();
    window.minimize();
    termUiSetOpen(false);
  }

  /** Minimize: collapse the panel (sessions keep running on the host). */
  function minimize(): void {
    window.minimize();
    termUiSetOpen(false);
  }

  const selectedShell =
    snapshot.shells?.find((shell) => shell.id === snapshot.shellId) ??
    snapshot.shells?.[0] ??
    null;

  const copy = (): void => {
    termViews.get(snapshot.activeId ?? "")?.copy();
  };
  const paste = (): void => {
    termViews.get(snapshot.activeId ?? "")?.paste();
  };
  const clear = (): void => {
    termViews.get(snapshot.activeId ?? "")?.clear();
  };

  // ── shared content: action row, tab row, error banner, viewport ──────────
  const content = (
    <>
      <TerminalToolbar
        t={t}
        busy={snapshot.busy}
        shellId={snapshot.shellId}
        shells={snapshot.shells}
        cwdChoice={cwdChoice}
        cwdOptions={cwdOptions}
        cwdDisabled={workspaceItems === null}
        activeId={snapshot.activeId}
        isFloating={window.isFloating}
        isMaximized={window.isMaximized}
        onNew={() => void openSession(selectedShell?.path)}
        onShellChange={(shellId) => termUiSetShell(shellId)}
        onCwdChange={(path) => {
          cwdTouchedRef.current = true;
          setCwdChoice(path);
        }}
        onCopy={copy}
        onPaste={paste}
        onClear={clear}
        onFloat={window.enterFloat}
        onMinimize={minimize}
        onToggleMaximize={window.toggleMaximize}
        onCloseAll={closeAll}
      />

      <TerminalTabRow
        t={t}
        tabs={snapshot.tabs}
        activeId={snapshot.activeId}
        onSelect={(tab) => {
          if (tab.exited !== null) {
            // Reopen a fresh session with the same shell.
            termUiRemoveTab(tab.id);
            void openSession(tab.shell);
          } else {
            termUiSetActive(tab.id);
          }
        }}
        onClose={closeTab}
      />

      {snapshot.error !== null ? (
        <div className="term-error">
          <span>{t("state.error", { message: snapshot.error })}</span>
        </div>
      ) : null}

      <div className="term-body">
        {snapshot.tabs.map((tab) => (
          <div
            key={tab.id}
            data-term-host-wrap
            style={{ display: tab.id === snapshot.activeId ? undefined : "none" }}
          >
            <XtermView
              api={api}
              tab={tab}
              active={tab.id === snapshot.activeId}
              t={t}
              onExit={(id, exit) => termUiMarkExited(id, exit)}
              onError={(message) => termUiSetError(message)}
            />
          </div>
        ))}
        {snapshot.tabs.length === 0 ? (
          <div className="term-notice">{snapshot.busy ? t("state.opening") : t("state.empty")}</div>
        ) : null}
      </div>
    </>
  );

  // ── floating window ───────────────────────────────────────────────────────
  if (window.isFloating) {
    return (
      <div
        className="term-float"
        data-term-root
        style={{ left: window.floatRect.x, top: window.floatRect.y, width: window.floatRect.w, height: window.floatRect.h }}
      >
        <div className="term-float-bar" onMouseDown={window.beginDrag("float-move")}>
          <span className="term-glyph">&gt;_</span>
          <span className="term-float-title">{t("panel.title")}</span>
          <span className="term-spacer" />
          <button
            type="button"
            className="term-btn"
            disabled={snapshot.activeId === null}
            title={t("action.copy")}
            onClick={copy}
          >
            {t("action.copy")}
          </button>
          <button
            type="button"
            className="term-btn"
            disabled={snapshot.activeId === null}
            title={t("action.paste")}
            onClick={paste}
          >
            {t("action.paste")}
          </button>
          <button
            type="button"
            className="term-btn"
            disabled={snapshot.activeId === null}
            title={t("action.clear")}
            onClick={clear}
          >
            {t("action.clear")}
          </button>
          <button
            type="button"
            className="term-btn"
            title={t("action.dock")}
            onClick={window.dockWindow}
          >
            ⧉ {t("action.dock")}
          </button>
          <button
            type="button"
            className="term-btn"
            title={t("action.minimize")}
            onClick={minimize}
          >
            —
          </button>
          <button
            type="button"
            className="term-btn term-btn-danger"
            title={t("action.close")}
            onClick={closeAll}
          >
            ×
          </button>
        </div>
        <div className="term-float-body">{content}</div>
        {RESIZE_HANDLES.map((handle) => (
          <div
            key={handle.cls}
            className={"term-resize " + handle.cls}
            onMouseDown={window.beginDrag(handle.mode)}
          />
        ))}
      </div>
    );
  }

  // ── dock mode ─────────────────────────────────────────────────────────────
  if (!snapshot.open) {
    return null;
  }
  // Maximize = fill the chat area exactly; otherwise stay inside the measured
  // dock ceiling so the sticky seat keeps the bottom edge anchored.
  const appliedHeight = window.isMaximized
    ? window.dockAvail > 0
      ? window.dockAvail
      : undefined
    : window.dockAvail > 0
      ? Math.min(window.panelHeight, window.dockAvail)
      : window.panelHeight;
  return (
    <div data-term-root>
      <div
        ref={window.setPanelRef}
        className="term-panel"
        style={{ height: appliedHeight }}
      >
        <div
          className="term-grip-top"
          title={t("action.resizeHint")}
          onMouseDown={window.beginDrag("dock-top")}
        />
        {content}
      </div>
    </div>
  );
}
