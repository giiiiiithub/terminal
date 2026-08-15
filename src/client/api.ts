/**
 * Browser-side client for the `term` Remote namespace. The namespace service
 * is mounted by apply() through ctx.remote.$mount(TYPERT_REMOTE); this class
 * unwraps the { ok, value | error } envelope into values or thrown errors and
 * converts base64 wire payloads to/from UTF-8 strings.
 */
import { READ_TIMEOUT_MS } from "../constants.js";
import type {
  ShellInfo,
  TermExit,
  TermOpenResult,
  TermResult,
  TermSessionInfo
} from "../types.js";

export class TermApiError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "TermApiError";
  }
}

type Namespace = {
  shells(request: {}): Promise<TermResult<{ shells: ShellInfo[] }>>;
  open(request: {
    id?: string;
    shell?: string;
    cwd?: string;
    cols?: number;
    rows?: number;
    env?: Record<string, string>;
  }): Promise<TermResult<TermOpenResult>>;
  write(request: { id: string; data: string }): Promise<TermResult<{ written: number }>>;
  read(request: { id: string; timeoutMs?: number }): Promise<
    TermResult<{ data: string; exit: TermExit | null }>
  >;
  resize(request: { id: string; cols: number; rows: number }): Promise<TermResult<{ cols: number; rows: number }>>;
  kill(request: { id: string }): Promise<TermResult<{ killed: boolean }>>;
  list(request: {}): Promise<TermResult<{ sessions: TermSessionInfo[] }>>;
};

/** Encode a UTF-8 string as base64 without blowing the call stack on big chunks. */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decode base64 (UTF-8 bytes) back to a string. */
function decodeBase64(data: string): string {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export class TermApi {
  constructor(private readonly namespace: () => Namespace) {}

  private async call<T>(name: keyof Namespace, args: unknown): Promise<T> {
    const method = (this.namespace() as unknown as Record<string, unknown>)[name];
    if (typeof method !== "function") {
      throw new TermApiError("not-mounted", `term Remote method "${String(name)}" is not mounted`);
    }
    // Two envelopes: the RPC layer ({ ok, value } from the gateway) wraps the
    // business envelope the host service returned ({ ok, value | error }).
    const rpc = (await (method as (a: unknown) => Promise<{ ok: boolean; value?: unknown; error?: { message: string } }>)(args));
    if (!rpc.ok) {
      throw new TermApiError("rpc-failed", rpc.error?.message ?? "remote call failed");
    }
    const business = rpc.value as TermResult<T>;
    if (business.ok) return business.value;
    throw new TermApiError(business.error.code, business.error.message);
  }

  async shells(): Promise<ShellInfo[]> {
    const value = await this.call<{ shells: ShellInfo[] }>("shells", {});
    return value.shells;
  }

  async open(options: {
    id?: string;
    shell?: string;
    cwd?: string;
    cols?: number;
    rows?: number;
    env?: Record<string, string>;
  }): Promise<TermOpenResult> {
    return this.call<TermOpenResult>("open", options);
  }

  async write(id: string, text: string): Promise<void> {
    await this.call("write", { id, data: encodeBase64(text) });
  }

  async read(id: string, timeoutMs = READ_TIMEOUT_MS): Promise<{ data: string; exit: TermExit | null }> {
    const value = await this.call<{ data: string; exit: TermExit | null }>("read", { id, timeoutMs });
    return { data: decodeBase64(value.data), exit: value.exit };
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    await this.call("resize", { id, cols, rows });
  }

  async kill(id: string): Promise<void> {
    await this.call("kill", { id });
  }

  async list(): Promise<TermSessionInfo[]> {
    const value = await this.call<{ sessions: TermSessionInfo[] }>("list", {});
    return value.sessions;
  }
}

/**
 * Build the TermApi bound to the gateway's live `term` namespace service.
 *
 * cordis would otherwise guard `ctx.remote.term` behind its service-resolution
 * reject (the namespace service lives on the gateway's own context, invisible
 * to sibling plugin scopes). The gateway's ClientRemoteService keeps the live
 * namespace services in its public `namespaces` map, so we read the instance
 * directly — its methods are plain (request) => Promise<TermResult<T>> functions
 * (same pattern as dsh-git-ui). If the gateway ever exposes a public accessor,
 * replace the reach-around here rather than at every call site.
 */
export function createTermApi(ctx: { remote: unknown }): TermApi {
  return new TermApi(() => {
    const remote = ctx.remote as {
      namespaces?: Map<string, { service: unknown }>;
    };
    const namespace = remote.namespaces?.get("term")?.service;
    if (namespace === undefined) {
      throw new TermApiError("not-mounted", "term Remote namespace is not mounted");
    }
    return namespace as never;
  });
}
