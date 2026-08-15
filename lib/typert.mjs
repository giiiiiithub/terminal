import { n as termErrorSchema, t as DESCRIPTORS } from "./descriptors-DBmAMUTQ.mjs";
//#region src/typert.ts
/**
* Host typert artifact: discovered automatically by @deepseek-ai/dsh-typert-loader
* through the package's "./typert" export and registered into ctx.typert, which
* the typert gateway consults for strict dispatch codecs.
*/
const TYPERT = {
	package: "dsh-terminal",
	face: "host",
	schemas: [{
		name: "termError",
		schema: termErrorSchema
	}],
	invocations: DESCRIPTORS,
	model: {
		services: [{
			description: "Interactive shell sessions for the Web UI: open PTY terminals (cmd.exe by default on Windows), stream input and output, resize, and kill. Backed by node-pty in the host process.",
			summary: "Interactive PTY terminal sessions backed by node-pty.",
			tags: [],
			jsDoc: "/**\n * Interactive PTY terminal sessions for the Web UI.\n */",
			key: "term",
			exportName: "TermService",
			members: [
				{
					kind: "method",
					name: "shells",
					signature: "async shells(request: TermShellsRequest): Promise<TermShellsResult>"
				},
				{
					kind: "method",
					name: "open",
					signature: "async open(request: TermOpenRequest): Promise<TermOpenResult>"
				},
				{
					kind: "method",
					name: "write",
					signature: "async write(request: TermWriteRequest): Promise<TermWriteResult>"
				},
				{
					kind: "method",
					name: "read",
					signature: "async read(request: TermReadRequest): Promise<TermReadResult>"
				},
				{
					kind: "method",
					name: "resize",
					signature: "async resize(request: TermResizeRequest): Promise<TermResizeResult>"
				},
				{
					kind: "method",
					name: "kill",
					signature: "async kill(request: TermKillRequest): Promise<TermKillResult>"
				},
				{
					kind: "method",
					name: "list",
					signature: "async list(request: TermListRequest): Promise<TermListResult>"
				}
			],
			types: [
				{
					name: "TermShellsRequest",
					declaration: "export interface TermShellsRequest {}"
				},
				{
					name: "TermShellsResult",
					declaration: "export type TermShellsResult = TermResult<{ shells: ShellInfo[] }>;"
				},
				{
					name: "TermOpenRequest",
					declaration: "export interface TermOpenRequest { readonly id?: string; readonly shell?: string; readonly cwd?: string; readonly cols?: number; readonly rows?: number; readonly env?: Record<string, string>; }"
				},
				{
					name: "TermOpenResult",
					declaration: "export type TermOpenResult = TermResult<{ id: string; pid: number; shell: string; cwd: string; cols: number; rows: number }>;"
				},
				{
					name: "TermWriteRequest",
					declaration: "export interface TermWriteRequest { readonly id: string; readonly data: string; }"
				},
				{
					name: "TermWriteResult",
					declaration: "export type TermWriteResult = TermResult<{ written: number }>;"
				},
				{
					name: "TermReadRequest",
					declaration: "export interface TermReadRequest { readonly id: string; readonly timeoutMs?: number; }"
				},
				{
					name: "TermReadResult",
					declaration: "export type TermReadResult = TermResult<{ data: string; exit: TermExit | null }>;"
				},
				{
					name: "TermResizeRequest",
					declaration: "export interface TermResizeRequest { readonly id: string; readonly cols: number; readonly rows: number; }"
				},
				{
					name: "TermResizeResult",
					declaration: "export type TermResizeResult = TermResult<{ cols: number; rows: number }>;"
				},
				{
					name: "TermKillRequest",
					declaration: "export interface TermKillRequest { readonly id: string; }"
				},
				{
					name: "TermKillResult",
					declaration: "export type TermKillResult = TermResult<{ killed: boolean }>;"
				},
				{
					name: "TermListRequest",
					declaration: "export interface TermListRequest {}"
				},
				{
					name: "TermListResult",
					declaration: "export type TermListResult = TermResult<{ sessions: TermSessionInfo[] }>;"
				},
				{
					name: "TermResult",
					declaration: "export type TermResult<T> = { ok: true; value: T } | { ok: false; error: TermError };"
				},
				{
					name: "TermError",
					declaration: "export interface TermError { readonly code: string; readonly message: string; }"
				},
				{
					name: "TermExit",
					declaration: "export interface TermExit { readonly code: number; readonly signal?: number; }"
				},
				{
					name: "TermSessionInfo",
					declaration: "export interface TermSessionInfo { readonly id: string; readonly pid: number; readonly shell: string; readonly cwd: string; readonly cols: number; readonly rows: number; readonly alive: boolean; readonly exit: TermExit | null; }"
				},
				{
					name: "ShellInfo",
					declaration: "export interface ShellInfo { readonly id: string; readonly name: string; readonly path: string; }"
				}
			]
		}],
		events: [],
		objects: []
	}
};
//#endregion
export { TYPERT };
