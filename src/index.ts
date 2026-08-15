/**
 * dsh-terminal host half: a Typert Remote service named `term` that spawns
 * real PTY shells with node-pty (cmd.exe by default on Windows, like an IDE
 * terminal) and streams their output to the browser through long-poll reads.
 *
 * Wire contract: base64-encoded UTF-8 in both directions (node-pty yields
 * already-decoded JS strings; Buffer keeps the transport JSON-safe for
 * control bytes and any codepage the shell produces). Every method returns
 * the { ok, value | error } envelope declared by ./typert.
 */
import { homedir } from "node:os";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import * as pty from "node-pty";
import {
  MAX_BUFFER_BYTES,
  MAX_EXITED_TOMBSTONES,
  MAX_SESSIONS,
  READ_TIMEOUT_MS,
  SESSION_PRUNE_DELAY_MS
} from "./constants.js";
import type {
  ShellInfo,
  TermExit,
  TermError,
  TermKillRequest,
  TermKillResult,
  TermListResult,
  TermOpenRequest,
  TermOpenResult,
  TermReadRequest,
  TermReadResult,
  TermResizeRequest,
  TermResizeResult,
  TermResult,
  TermSessionInfo,
  TermShellsResult,
  TermWriteRequest,
  TermWriteResult
} from "./types.js";

export interface TermServiceConfig {
  /** Default shell executable; defaults to cmd.exe on Windows, /bin/zsh on macOS, /bin/bash elsewhere. */
  shell?: string;
  /** Default working directory for new sessions; defaults to the home dir. */
  cwd?: string;
  /** Extra environment variables merged over the host process env. */
  env?: Record<string, string>;
  /** Long-poll ceiling for `read` when the client sends no timeoutMs. */
  defaultReadTimeoutMs?: number;
  /** Per-session output buffer cap; oldest bytes are dropped beyond it. */
  maxBufferBytes?: number;
}

/** One live PTY session plus its pending-output buffer and read waiters. */
interface PtySession {
  readonly id: string;
  readonly pty: pty.IPty;
  readonly shell: string;
  readonly cwd: string;
  cols: number;
  rows: number;
  /** Pending decoded output not yet drained by a `read`. */
  buffer: string;
  /** Long-poll waiters; the oldest is woken when data or exit arrives. */
  waiters: Array<{ resolve: (value: TermResult<TermReadResult>) => void; timer: NodeJS.Timeout }>;
  exited: TermExit | null;
  /** Pending prune-to-tombstone timer for an exited session. */
  pruneTimer?: NodeJS.Timeout;
}

function fail(code: string, message: string): TermError {
  return { code, message };
}

/** Reasonable clamp for PTY dimensions. */
function clampCols(value: number): number {
  return Math.max(2, Math.min(1000, Math.floor(value)));
}
function clampRows(value: number): number {
  return Math.max(1, Math.min(500, Math.floor(value)));
}

/** Where a shell name lives on this platform. */
function defaultShell(): string {
  if (process.platform === "win32") return "cmd.exe";
  if (process.platform === "darwin") return "/bin/zsh";
  return "/bin/bash";
}

export default class TermService extends TypertRemoteService {
  private readonly sessions = new Map<string, PtySession>();
  /** Exit records of pruned/killed sessions, so late `read` calls still see the exit. */
  private readonly exitedSessions = new Map<string, TermExit>();
  private readonly config: Required<
    Pick<TermServiceConfig, "defaultReadTimeoutMs" | "maxBufferBytes">
  > &
    TermServiceConfig;
  private shellCache: ShellInfo[] | null = null;

  constructor(ctx: Context, config: TermServiceConfig = {}) {
    super(ctx, "term");
    this.config = {
      defaultReadTimeoutMs: READ_TIMEOUT_MS,
      maxBufferBytes: MAX_BUFFER_BYTES,
      ...config
    };
    ctx.effect(() => () => {
      for (const session of this.sessions.values()) {
        try {
          session.pty.kill();
        } catch {
          /* already gone */
        }
      }
      this.sessions.clear();
    });
  }

  // ── shells ────────────────────────────────────────────────────────────────

  /** Enumerate shells available on this machine (probed once per service). */
  async shells(_request: {}): Promise<TermResult<TermShellsResult>> {
    if (this.shellCache !== null) return { ok: true, value: { shells: this.shellCache } };
    const shells = await this.probeShells();
    this.shellCache = shells;
    return { ok: true, value: { shells } };
  }

  private async probeShells(): Promise<ShellInfo[]> {
    const found: ShellInfo[] = [];
    if (process.platform === "win32") {
      found.push({ id: "cmd", name: "cmd.exe", path: "cmd.exe" });
      const powershell = join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe"
      );
      if (existsSync(powershell)) {
        found.push({ id: "powershell", name: "Windows PowerShell", path: powershell });
      }
      for (const candidate of [
        { id: "pwsh", name: "pwsh", cmd: "pwsh" },
        { id: "bash", name: "Git Bash", cmd: "bash" }
      ]) {
        const resolved = await this.resolveOnPath(candidate.cmd);
        if (resolved !== null) {
          found.push({ id: candidate.id, name: candidate.name, path: resolved });
        }
      }
    } else {
      for (const [id, name, path] of [
        ["bash", "bash", "/bin/bash"],
        ["zsh", "zsh", "/bin/zsh"],
        ["sh", "sh", "/bin/sh"]
      ] as const) {
        if (existsSync(path)) found.push({ id, name, path });
      }
    }
    return found;
  }

  private async resolveOnPath(command: string): Promise<string | null> {
    const where = process.platform === "win32" ? "where.exe" : "which";
    try {
      const output = await new Promise<string>((resolve, reject) => {
        execFile(where, [command], { timeout: 2000, windowsHide: true }, (error, stdout) => {
          if (error !== null) reject(error);
          else resolve(stdout);
        });
      });
      const line = output.split(/\r?\n/).map((s) => s.trim()).find((s) => s !== "");
      return line !== undefined && line !== "" ? line : null;
    } catch {
      return null;
    }
  }

  /** Keep an exit record for a session that left the live map. */
  private rememberExit(id: string, exit: TermExit): void {
    if (this.exitedSessions.size >= MAX_EXITED_TOMBSTONES) {
      const oldest = this.exitedSessions.keys().next().value;
      if (oldest !== undefined) this.exitedSessions.delete(oldest);
    }
    this.exitedSessions.set(id, exit);
  }

  /** Move an exited session out of the live map into the tombstone set. */
  private pruneSession(id: string): void {
    const session = this.sessions.get(id);
    if (session === undefined || session.exited === null) return;
    this.sessions.delete(id);
    this.rememberExit(id, session.exited);
  }

  /** When the live map is at capacity, evict exited sessions to make room. */
  private makeRoomForSession(): void {
    if (this.sessions.size < MAX_SESSIONS) return;
    for (const [id, session] of this.sessions) {
      if (this.sessions.size < MAX_SESSIONS) break;
      if (session.exited !== null) {
        this.sessions.delete(id);
        clearTimeout(session.pruneTimer);
        this.rememberExit(id, session.exited);
      }
    }
  }

  // ── open ──────────────────────────────────────────────────────────────────

  async open(request: TermOpenRequest): Promise<TermResult<TermOpenResult>> {
    const shell = request.shell ?? this.config.shell ?? defaultShell();
    const cwd = request.cwd ?? this.config.cwd ?? homedir();
    const cols = clampCols(request.cols ?? 80);
    const rows = clampRows(request.rows ?? 24);
    const id = request.id ?? randomUUID();

    if (this.sessions.has(id)) {
      return { ok: false, error: fail("id-conflict", `session "${id}" already exists`) };
    }
    // A pruned id is free for reuse; drop any stale exit record for it.
    this.exitedSessions.delete(id);
    this.makeRoomForSession();
    if (this.sessions.size >= MAX_SESSIONS) {
      return {
        ok: false,
        error: fail("session-limit", `too many live sessions (${MAX_SESSIONS})`)
      };
    }
    // ConPTY hard-crashes the host when the working directory does not exist,
    // so validate it up front instead of letting node-pty spawn.
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
      return {
        ok: false,
        error: fail("bad-cwd", `working directory "${cwd}" does not exist`)
      };
    }

    let child: pty.IPty;
    try {
      child = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env: {
          ...process.env,
          ...this.config.env,
          ...request.env,
          TERM: "xterm-256color"
        }
      });
    } catch (error) {
      return {
        ok: false,
        error: fail("spawn-failed", `could not start "${shell}" in "${cwd}": ${(error as Error).message}`)
      };
    }

    const session: PtySession = {
      id,
      pty: child,
      shell,
      cwd,
      cols,
      rows,
      buffer: "",
      waiters: [],
      exited: null
    };
    this.sessions.set(id, session);

    child.onData((data) => {
      session.buffer += data;
      if (session.buffer.length > this.config.maxBufferBytes) {
        session.buffer = session.buffer.slice(-this.config.maxBufferBytes);
      }
      this.wakeWaiters(session, null);
    });
    child.onExit(({ exitCode, signal }) => {
      // The gateway's JSON-safety check rejects object keys whose value is
      // undefined, so never leave `signal` in place when the platform did
      // not deliver one (node-pty on Windows emits undefined).
      const code = typeof exitCode === "number" && Number.isFinite(exitCode) ? exitCode : 0;
      const sig = typeof signal === "number" && Number.isFinite(signal) ? signal : undefined;
      const exit: TermExit = sig === undefined ? { code } : { code, signal: sig };
      if (this.sessions.has(id)) {
        // Natural exit: keep the record around for the grace period so
        // clients can still read the exit, then move it to the tombstone set.
        session.exited = exit;
        this.wakeWaiters(session, exit);
        session.pruneTimer = setTimeout(() => this.pruneSession(id), SESSION_PRUNE_DELAY_MS);
        session.pruneTimer.unref?.();
      } else {
        // Killed via `kill` while alive: the map entry is already gone, but
        // the exit must still reach late readers through the tombstone set.
        this.wakeWaiters(session, exit);
        this.rememberExit(id, exit);
      }
    });

    return {
      ok: true,
      value: { id, pid: child.pid, shell, cwd, cols, rows }
    };
  }

  // ── write ─────────────────────────────────────────────────────────────────

  async write(request: TermWriteRequest): Promise<TermResult<TermWriteResult>> {
    const session = this.sessions.get(request.id);
    if (session === undefined) {
      return { ok: false, error: fail("no-session", `session "${request.id}" does not exist`) };
    }
    if (session.exited !== null) {
      return { ok: false, error: fail("exited", `session "${request.id}" has already exited`) };
    }
    let text: string;
    try {
      text = Buffer.from(request.data, "base64").toString("utf8");
    } catch {
      return { ok: false, error: fail("bad-data", "input is not valid base64") };
    }
    try {
      session.pty.write(text);
    } catch (error) {
      return {
        ok: false,
        error: fail("write-failed", (error as Error).message)
      };
    }
    return { ok: true, value: { written: text.length } };
  }

  // ── read (long-poll) ──────────────────────────────────────────────────────

  async read(request: TermReadRequest): Promise<TermResult<TermReadResult>> {
    const session = this.sessions.get(request.id);
    if (session === undefined) {
      // Pruned or killed sessions keep a tombstone exit so late readers
      // observe a clean exit instead of a spurious no-session error.
      const exit = this.exitedSessions.get(request.id);
      if (exit !== undefined) return { ok: true, value: { data: "", exit } };
      return { ok: false, error: fail("no-session", `session "${request.id}" does not exist`) };
    }
    if (session.exited !== null) {
      return {
        ok: true,
        value: { data: this.drain(session), exit: session.exited }
      };
    }
    const pending = this.drain(session);
    if (pending !== "") {
      return { ok: true, value: { data: pending, exit: null } };
    }
    const timeoutMs = request.timeoutMs ?? this.config.defaultReadTimeoutMs;
    return new Promise<TermResult<TermReadResult>>((resolve) => {
      let settled = false;
      const finish = (value: TermResult<TermReadResult>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const index = session.waiters.indexOf(waiter);
        if (index >= 0) session.waiters.splice(index, 1);
        resolve(value);
      };
      const timer = setTimeout(() => {
        finish({ ok: true, value: { data: this.drain(session), exit: null } });
      }, timeoutMs);
      const waiter = { resolve: finish, timer };
      session.waiters.push(waiter);
    });
  }

  /** Resolve pending waiters with whatever output is buffered (or the exit). */
  private wakeWaiters(session: PtySession, exit: TermExit | null): void {
    if (session.waiters.length === 0) return;
    const waiter = session.waiters.shift()!;
    waiter.resolve({
      ok: true,
      value: { data: this.drain(session), exit }
    });
    if (exit !== null) {
      for (const rest of session.waiters.splice(0)) {
        rest.resolve({ ok: true, value: { data: "", exit } });
      }
    }
  }

  private drain(session: PtySession): string {
    const pending = session.buffer;
    session.buffer = "";
    return Buffer.from(pending, "utf8").toString("base64");
  }

  // ── resize / kill / list ──────────────────────────────────────────────────

  async resize(request: TermResizeRequest): Promise<TermResult<TermResizeResult>> {
    const session = this.sessions.get(request.id);
    if (session === undefined) {
      return { ok: false, error: fail("no-session", `session "${request.id}" does not exist`) };
    }
    const cols = clampCols(request.cols);
    const rows = clampRows(request.rows);
    try {
      session.pty.resize(cols, rows);
    } catch (error) {
      return {
        ok: false,
        error: fail("resize-failed", (error as Error).message)
      };
    }
    session.cols = cols;
    session.rows = rows;
    return { ok: true, value: { cols, rows } };
  }

  async kill(request: TermKillRequest): Promise<TermResult<TermKillResult>> {
    const session = this.sessions.get(request.id);
    if (session === undefined) {
      return { ok: false, error: fail("no-session", `session "${request.id}" does not exist`) };
    }
    // `kill` means "this session is gone": drop it from the live map now so
    // its id is reusable and `list` stops showing it. Killing an already-
    // exited PTY would also make node-pty run its console-list helper against
    // a torn-down console (noisy), so short-circuit on the recorded exit.
    this.sessions.delete(request.id);
    clearTimeout(session.pruneTimer);
    if (session.exited !== null) {
      this.rememberExit(request.id, session.exited);
      return { ok: true, value: { killed: false } };
    }
    if (process.platform === "win32") {
      // node-pty's kill relies on a console-list helper that can fail to
      // attach (AttachConsole) and then terminates only the shell itself,
      // orphaning its children (same behavior as VS Code's terminal). Force-
      // kill the whole tree FIRST while the shell is still alive, so children
      // like `npm run dev` die with the tab.
      try {
        await new Promise<void>((resolve) => {
          execFile("taskkill", ["/PID", String(session.pty.pid), "/T", "/F"], {
            windowsHide: true,
            timeout: 3000
          }, () => resolve());
        });
      } catch {
        /* best effort */
      }
    }
    try {
      session.pty.kill();
    } catch {
      /* already gone */
    }
    return { ok: true, value: { killed: true } };
  }

  async list(_request: {}): Promise<TermResult<TermListResult>> {
    const sessions: TermSessionInfo[] = [];
    for (const session of this.sessions.values()) {
      sessions.push({
        id: session.id,
        pid: session.pty.pid,
        shell: session.shell,
        cwd: session.cwd,
        cols: session.cols,
        rows: session.rows,
        alive: session.exited === null,
        exit: session.exited
      });
    }
    return { ok: true, value: { sessions } };
  }
}