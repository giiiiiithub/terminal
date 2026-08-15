/**
 * Session-header action: the Terminal toggle button with a live session
 * badge. Shares the module store with the dock panel.
 *
 * The badge cannot rely on exit events alone: they are only observed by the
 * read loop of the ACTIVE tab, so sessions that exit while their tab is
 * inactive (or while the panel is collapsed) would stay "alive" forever.
 * A periodic `list` poll reconciles the client tabs with the host session
 * map, marking exits (and sessions the host no longer tracks) as done.
 */
import { useEffect, useRef } from "react";
import { BADGE_SYNC_INTERVAL_MS } from "../../constants.js";
import {
  getTermUiSnapshot,
  termUiMarkExited,
  termUiSetOpen,
  useTermUi
} from "../store.js";
import type { TermApi } from "../api.js";

export function TerminalHeaderAction(props: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  api: TermApi;
}): JSX.Element {
  const { t, api } = props;
  const snapshot = useTermUi();
  const alive = snapshot.tabs.filter((tab) => tab.exited === null).length;

  // Reconcile tab state with the host's session map. A session missing from
  // the map is only marked exited after it was absent in two consecutive
  // polls, so a just-opened session racing the snapshot is never mislabeled.
  const absentRef = useRef(new Map<string, number>());
  useEffect(() => {
    let aliveLoop = true;
    const sync = async (): Promise<void> => {
      if (getTermUiSnapshot().tabs.length === 0) return;
      let sessions;
      try {
        sessions = await api.list();
      } catch {
        return; // transient RPC error; the next tick retries
      }
      if (!aliveLoop) return;
      const byId = new Map(sessions.map((s) => [s.id, s]));
      const snapshotNow = getTermUiSnapshot();
      const absent = absentRef.current;
      for (const tab of snapshotNow.tabs) {
        if (tab.exited !== null) continue;
        const info = byId.get(tab.id);
        if (info !== undefined) {
          absent.delete(tab.id);
          if (info.exit !== null) termUiMarkExited(tab.id, info.exit);
        } else {
          const seen = (absent.get(tab.id) ?? 0) + 1;
          absent.set(tab.id, seen);
          if (seen >= 2) termUiMarkExited(tab.id, { code: -1 });
        }
      }
      // Drop counters for tabs that no longer exist.
      const liveIds = new Set(snapshotNow.tabs.map((tab) => tab.id));
      for (const id of absent.keys()) {
        if (!liveIds.has(id)) absent.delete(id);
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), BADGE_SYNC_INTERVAL_MS);
    return () => {
      aliveLoop = false;
      window.clearInterval(timer);
    };
  }, [api]);

  return (
    <button
      type="button"
      className={"term-header-btn" + (snapshot.open ? " term-active" : "")}
      onClick={() => termUiSetOpen(!snapshot.open)}
      title={t("panel.title")}
      aria-label={t("panel.title")}
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      <span className="term-glyph">&gt;_</span>
      <span>{t("panel.title")}</span>
      {alive > 0 ? <span className="term-badge">{alive}</span> : null}
    </button>
  );
}
