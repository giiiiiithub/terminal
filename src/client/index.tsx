/**
 * dsh-terminal browser plugin entry: mounts the term Remote contribution,
 * then registers the header action and the dock panel. Mirrors the
 * api-remotes mount pattern (async apply + disposer chain).
 */
import { createTermApi } from "./api.js";
import { HEADER_ACTION_ORDER, PANEL_ORDER } from "../constants.js";
import { ensureStyles } from "./styles.js";
import { TerminalHeaderAction } from "./components/TerminalHeaderAction.js";
import { TerminalPanel } from "./components/TerminalPanel.js";
import { zh, en } from "./locale.js";
import { TYPERT_REMOTE } from "../remote.js";

const NS = "terminal";

export const inject = ["remote", "slots", "locale"];

type Dispose = (() => void | Promise<void>) | void;

export async function apply(ctx: {
  remote: {
    $mount(contribution: unknown): Promise<Dispose>;
  };
  slots: {
    inject(name: string, callback: () => Dispose | Iterable<Dispose>): void;
    register(
      options: {
        name: string;
        id?: string;
        order?: number;
        locale?: string;
        inject?: (sessionId?: string) => unknown;
      },
      component: unknown
    ): Dispose;
  };
  locale: {
    register(namespace: string, dictionaries: Record<string, unknown>): Dispose;
  };
  effect(callback: () => Dispose | void, label?: string): void;
}): Promise<Dispose> {
  ensureStyles();

  const disposers: Array<() => void | Promise<void>> = [];
  try {
    const dispose = await ctx.remote.$mount(TYPERT_REMOTE);
    if (typeof dispose === "function") disposers.push(dispose);
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose();
    throw error;
  }

  // The namespace is mounted above; the factory encapsulates the gateway
  // reach-around (see createTermApi in ./api.ts).
  const api = createTermApi(ctx);

  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    "terminal: dictionaries"
  );

  ctx.slots.inject("conversation.session.header.actions", () =>
    ctx.slots.register(
      {
        name: "conversation.session.header.actions",
        id: "terminal-action",
        order: HEADER_ACTION_ORDER,
        locale: NS,
        inject: () => ({ api })
      },
      TerminalHeaderAction
    )
  );

  // order 30: the LAST entry in the dock stack, directly above the composer.
  // Todo (0) / Goal (10) / Queue (20) strips render above the panel; the host
  // pins the composer seat at the bottom, so anything growing BELOW the panel
  // (e.g. the queue strip during a live turn) would push the panel's bottom
  // edge upward. Growth above the panel instead extends into the chat area and
  // leaves the panel — and its bottom anchor — untouched.
  ctx.slots.inject("conversation.input.dock", () =>
    ctx.slots.register(
      {
        name: "conversation.input.dock",
        id: "terminal-panel",
        order: PANEL_ORDER,
        locale: NS,
        inject: () => ({ api })
      },
      TerminalPanel
    )
  );

  return async () => {
    for (const dispose of disposers.reverse()) await dispose();
  };
}
