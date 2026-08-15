/**
 * Module-level UI store for the Terminal panel: open/collapsed state, the tab
 * list (one tab per PTY session), the active tab, the shell menu, and error
 * status. The header action and the dock panel share it via
 * useSyncExternalStore; no cordis service or slot store seat is needed.
 */
import { useSyncExternalStore } from "react";
import type { ShellInfo, TermExit } from "../types.js";

/** One tab in the terminal panel, backed by one host PTY session. */
export interface TermTab {
  /** Host session id (stable across reloads within one server lifetime). */
  readonly id: string;
  /** Display label: shell basename + short cwd. */
  readonly label: string;
  readonly shell: string;
  readonly cwd: string;
  readonly pid: number | null;
  readonly exited: TermExit | null;
}

export interface TermUiSnapshot {
  open: boolean;
  tabs: TermTab[];
  activeId: string | null;
  shells: ShellInfo[] | null;
  /** The shell the next "+" uses; defaults to the first discovered shell. */
  shellId: string;
  busy: boolean;
  error: string | null;
}

const OPEN_KEY = "dsh-terminal.open";

function initialOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

let snapshot: TermUiSnapshot = {
  open: initialOpen(),
  tabs: [],
  activeId: null,
  shells: null,
  shellId: "",
  busy: false,
  error: null
};

const listeners = new Set<() => void>();

function set(patch: Partial<TermUiSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function getTermUiSnapshot(): TermUiSnapshot {
  return snapshot;
}

export function subscribeTermUi(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTermUi(): TermUiSnapshot {
  return useSyncExternalStore(subscribeTermUi, getTermUiSnapshot);
}

export function termUiSetOpen(open: boolean): void {
  set({ open });
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

export function termUiSetShells(shells: ShellInfo[]): void {
  const current = snapshot.shellId;
  const valid = shells.some((s) => s.id === current) ? current : (shells[0]?.id ?? "");
  set({ shells, shellId: valid });
}

export function termUiSetShell(shellId: string): void {
  set({ shellId });
}

export function termUiSetBusy(busy: boolean): void {
  set({ busy });
}

export function termUiSetError(error: string | null): void {
  set({ error });
}

export function termUiAddTab(tab: TermTab): void {
  const tabs = [...snapshot.tabs, tab];
  set({ tabs, activeId: tab.id });
}

export function termUiRemoveTab(id: string): void {
  const tabs = snapshot.tabs.filter((t) => t.id !== id);
  const activeId =
    snapshot.activeId === id
      ? (tabs[tabs.length - 1]?.id ?? null)
      : snapshot.activeId;
  set({ tabs, activeId });
}

export function termUiSetActive(id: string): void {
  set({ activeId: id });
}

export function termUiClearTabs(): void {
  set({ tabs: [], activeId: null });
}

export function termUiMarkExited(id: string, exit: TermExit): void {
  set({
    tabs: snapshot.tabs.map((t) => (t.id === id ? { ...t, exited: exit } : t))
  });
}

/** Build a compact tab label from the shell path and cwd. */
export function termTabLabel(shell: string, cwd: string): string {
  const base = shell.split(/[\\/]/).pop() ?? shell;
  const dir = cwd.split(/[\\/]/).pop() ?? cwd;
  return dir !== "" && dir !== base ? `${base} · ${dir}` : base;
}
