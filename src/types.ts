/**
 * Shared wire types for the dsh-terminal Remote. Both the host service and
 * the browser client consume this module (each face bundles its own copy).
 */

/** Business error carried by the failure branch of every Remote result. */
export interface TermError {
  readonly code: string;
  readonly message: string;
}

/** Enumerate available shells. */
export interface TermShellsRequest {}

/** List live sessions. */
export interface TermListRequest {}

/** Envelope used by every Remote method of the `term` namespace. */
export type TermResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: TermError };

/** One discoverable shell. */
export interface ShellInfo {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

/** Exit record of a finished PTY session. */
export interface TermExit {
  readonly code: number;
  readonly signal?: number;
}

/** Summary of one PTY session for the `list` method. */
export interface TermSessionInfo {
  readonly id: string;
  readonly pid: number;
  readonly shell: string;
  readonly cwd: string;
  readonly cols: number;
  readonly rows: number;
  readonly alive: boolean;
  readonly exit: TermExit | null;
}

/** Start a new PTY session. */
export interface TermOpenRequest {
  /** Client-chosen session id; the host generates one when absent. */
  readonly id?: string;
  /** Shell executable; defaults to the service config, then cmd.exe / bash. */
  readonly shell?: string;
  /** Working directory; defaults to the service config, then the home dir. */
  readonly cwd?: string;
  readonly cols?: number;
  readonly rows?: number;
  /** Extra environment variables merged over the host process env. */
  readonly env?: Record<string, string>;
}

export interface TermOpenResult {
  readonly id: string;
  readonly pid: number;
  readonly shell: string;
  readonly cwd: string;
  readonly cols: number;
  readonly rows: number;
}

/** Feed input to one session. `data` is base64-encoded UTF-8 bytes. */
export interface TermWriteRequest {
  readonly id: string;
  readonly data: string;
}

export interface TermWriteResult {
  readonly written: number;
}

/**
 * Pull pending output from one session. `data` is base64-encoded UTF-8
 * bytes; the call holds up to `timeoutMs` (default 250) when the session is
 * idle so the browser can long-poll instead of busy-polling. When the
 * session has exited, `exit` is populated and no further data ever arrives.
 */
export interface TermReadRequest {
  readonly id: string;
  readonly timeoutMs?: number;
}

export interface TermReadResult {
  readonly data: string;
  readonly exit: TermExit | null;
}

export interface TermResizeRequest {
  readonly id: string;
  readonly cols: number;
  readonly rows: number;
}

export interface TermResizeResult {
  readonly cols: number;
  readonly rows: number;
}

export interface TermKillRequest {
  readonly id: string;
}

export interface TermKillResult {
  readonly killed: boolean;
}

export interface TermListResult {
  readonly sessions: TermSessionInfo[];
}

export interface TermShellsResult {
  readonly shells: ShellInfo[];
}
