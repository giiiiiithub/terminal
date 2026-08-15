/**
 * Presentational building blocks of the terminal panel: the action toolbar
 * (new/shell/cwd/copy/paste/clear + window controls) and the session tab row.
 * Pure props in, callbacks out — no store access, no session lifecycle.
 */
import type { ShellInfo } from "../../types.js";
import type { TermTab } from "../store.js";

export interface TerminalToolbarProps {
  t: (key: string, vars?: Record<string, string | number>) => string;
  busy: boolean;
  shellId: string;
  shells: ShellInfo[] | null;
  cwdChoice: string;
  cwdOptions: string[] | null;
  cwdDisabled: boolean;
  activeId: string | null;
  isFloating: boolean;
  isMaximized: boolean;
  onNew(): void;
  onShellChange(shellId: string): void;
  onCwdChange(path: string): void;
  onCopy(): void;
  onPaste(): void;
  onClear(): void;
  onFloat(): void;
  onMinimize(): void;
  onToggleMaximize(): void;
  onCloseAll(): void;
}

export function TerminalToolbar(props: TerminalToolbarProps): JSX.Element {
  const {
    t,
    busy,
    shellId,
    shells,
    cwdChoice,
    cwdOptions,
    cwdDisabled,
    activeId,
    isFloating,
    isMaximized,
    onNew,
    onShellChange,
    onCwdChange,
    onCopy,
    onPaste,
    onClear,
    onFloat,
    onMinimize,
    onToggleMaximize,
    onCloseAll
  } = props;
  return (
    <div className="term-toolbar">
      <button
        type="button"
        className="term-btn term-btn-primary"
        disabled={busy}
        title={t("tab.new")}
        onClick={onNew}
      >
        +
      </button>
      <select
        className="term-btn term-shell-select"
        value={shellId}
        disabled={busy}
        title={t("action.shell")}
        onChange={(event) => onShellChange(event.target.value)}
      >
        {(shells ?? []).map((shell) => (
          <option key={shell.id} value={shell.id}>
            {shell.name}
          </option>
        ))}
      </select>
      <select
        className="term-btn term-cwd-select"
        value={cwdChoice}
        disabled={busy || cwdDisabled}
        title={t("action.cwd")}
        onChange={(event) => onCwdChange(event.target.value)}
      >
        {(cwdOptions ?? []).map((path) => (
          <option key={path} value={path}>
            {path}
          </option>
        ))}
      </select>
      <span className="term-spacer" />
      {!isFloating ? (
        <button
          type="button"
          className="term-btn"
          disabled={activeId === null}
          title={t("action.copy")}
          onClick={onCopy}
        >
          {t("action.copy")}
        </button>
      ) : null}
      {!isFloating ? (
        <button
          type="button"
          className="term-btn"
          disabled={activeId === null}
          title={t("action.paste")}
          onClick={onPaste}
        >
          {t("action.paste")}
        </button>
      ) : null}
      {!isFloating ? (
        <button
          type="button"
          className="term-btn"
          disabled={activeId === null}
          title={t("action.clear")}
          onClick={onClear}
        >
          {t("action.clear")}
        </button>
      ) : null}
      {!isFloating ? (
        <button
          type="button"
          className="term-btn"
          title={t("action.float")}
          onClick={onFloat}
        >
          ⧉
        </button>
      ) : null}
      {!isFloating ? (
        <button
          type="button"
          className="term-btn"
          title={isMaximized ? t("action.restore") : t("action.maximize")}
          onClick={onToggleMaximize}
        >
          {isMaximized ? "❐" : "□"}
        </button>
      ) : null}
      {!isFloating ? (
        <button
          type="button"
          className="term-btn"
          title={t("action.minimize")}
          onClick={onMinimize}
        >
          —
        </button>
      ) : null}
      {!isFloating ? (
        <button
          type="button"
          className="term-btn term-btn-danger"
          title={t("action.close")}
          onClick={onCloseAll}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export interface TerminalTabRowProps {
  t: (key: string, vars?: Record<string, string | number>) => string;
  tabs: TermTab[];
  activeId: string | null;
  onSelect(tab: TermTab): void;
  onClose(id: string): void;
}

export function TerminalTabRow(props: TerminalTabRowProps): JSX.Element {
  const { t, tabs, activeId, onSelect, onClose } = props;
  return (
    <div className="term-tabs-row">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={
            "term-tab" +
            (tab.id === activeId ? " term-tab-active" : "") +
            (tab.exited !== null ? " term-tab-exited" : "")
          }
          title={tab.cwd}
          onClick={() => onSelect(tab)}
        >
          <span className="term-tab-label">{tab.label}</span>
          <button
            type="button"
            className="term-tab-x"
            title={t("tab.close")}
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
