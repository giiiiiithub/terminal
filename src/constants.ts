/**
 * Shared constants for dsh-terminal. Bundled into both faces (host service
 * and browser client), so wire-level defaults used on both ends stay in one
 * place instead of being re-declared per file.
 */

/** Long-poll ceiling for `read` when the caller sends no timeoutMs. */
export const READ_TIMEOUT_MS = 250;

/** Per-session output buffer cap; oldest bytes are dropped beyond it. */
export const MAX_BUFFER_BYTES = 2_000_000;

/** Debounce for sending resize to the host after a fit. */
export const RESIZE_DEBOUNCE_MS = 150;

/** Base backoff between read-loop retries after a transient RPC error. */
export const READ_RETRY_BASE_MS = 250;

/** Cap for the read-loop retry backoff. */
export const READ_RETRY_MAX_MS = 5_000;

/** Live-session cap; beyond it, exited sessions are pruned to make room. */
export const MAX_SESSIONS = 64;

/** Tombstone cap for exited sessions kept for late `read` calls. */
export const MAX_EXITED_TOMBSTONES = 64;

/** How long an exited session stays in the live map before being pruned. */
export const SESSION_PRUNE_DELAY_MS = 60_000;

/** Badge/list sync interval while the terminal panel exists. */
export const BADGE_SYNC_INTERVAL_MS = 5_000;

/** Slot orders: header action and dock panel. */
export const HEADER_ACTION_ORDER = 40;
export const PANEL_ORDER = 30;
