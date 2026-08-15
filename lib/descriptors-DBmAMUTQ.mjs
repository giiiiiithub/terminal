import { z } from "zod";
//#region src/schemas.ts
/**
* Zod schemas for the dsh-terminal wire contract. Bundled into both faces:
* the host typert manifest validates incoming args and outgoing results, and
* the client contribution validates the same envelope on the browser side.
*/
const termErrorSchema = z.object({
	code: z.string(),
	message: z.string()
});
function okSchema(value) {
	return z.object({
		ok: z.literal(true),
		value
	});
}
function resultSchema(value) {
	return z.union([okSchema(value), z.object({
		ok: z.literal(false),
		error: termErrorSchema
	})]);
}
const exitSchema = z.object({
	code: z.number(),
	signal: z.number().optional()
});
const shellInfoSchema = z.object({
	id: z.string(),
	name: z.string(),
	path: z.string()
});
const sessionInfoSchema = z.object({
	id: z.string(),
	pid: z.number(),
	shell: z.string(),
	cwd: z.string(),
	cols: z.number(),
	rows: z.number(),
	alive: z.boolean(),
	exit: z.union([exitSchema, z.null()])
});
const shellsRequestSchema = z.object({});
const shellsResultSchema = resultSchema(z.object({ shells: z.array(shellInfoSchema) }));
const openRequestSchema = z.object({
	id: z.string().min(1).optional(),
	shell: z.string().min(1).optional(),
	cwd: z.string().min(1).optional(),
	cols: z.number().int().min(2).max(1e3).optional(),
	rows: z.number().int().min(1).max(500).optional(),
	env: z.record(z.string(), z.string()).optional()
});
const openResultSchema = resultSchema(z.object({
	id: z.string(),
	pid: z.number(),
	shell: z.string(),
	cwd: z.string(),
	cols: z.number(),
	rows: z.number()
}));
const writeRequestSchema = z.object({
	id: z.string().min(1),
	data: z.string()
});
const writeResultSchema = resultSchema(z.object({ written: z.number() }));
const readRequestSchema = z.object({
	id: z.string().min(1),
	timeoutMs: z.number().int().min(0).max(3e4).optional()
});
const readResultSchema = resultSchema(z.object({
	data: z.string(),
	exit: z.union([exitSchema, z.null()])
}));
const resizeRequestSchema = z.object({
	id: z.string().min(1),
	cols: z.number().int().min(2).max(1e3),
	rows: z.number().int().min(1).max(500)
});
const resizeResultSchema = resultSchema(z.object({
	cols: z.number(),
	rows: z.number()
}));
const killRequestSchema = z.object({ id: z.string().min(1) });
const killResultSchema = resultSchema(z.object({ killed: z.boolean() }));
const listRequestSchema = z.object({});
const listResultSchema = resultSchema(z.object({ sessions: z.array(sessionInfoSchema) }));
//#endregion
//#region src/descriptors.ts
/**
* Invocation descriptors for the `term` Remote — one source of truth consumed
* by both the host TYPERT manifest (typert.ts) and the client contribution
* (remote.ts), mirroring the shape the repo's typert generator emits.
*/
const PACKAGE = "dsh-terminal";
const NS = "term";
function def(method, requestSchema, requestType, resultSchema, resultType) {
	return {
		id: `${PACKAGE}#${NS}/${method}`,
		service: NS,
		namespace: NS,
		method,
		invocation: { kind: "direct" },
		parameters: [{
			name: "request",
			wire: "request",
			source: "json",
			codec: {
				mode: "strict",
				typeSymbol: `${PACKAGE}/types#${requestType}`,
				schema: requestSchema
			}
		}],
		result: {
			mode: "strict",
			typeSymbol: `${PACKAGE}/types#${resultType}`,
			schema: resultSchema
		},
		sourceLocation: {
			file: "src/index.ts",
			line: 1,
			column: 1
		}
	};
}
const DESCRIPTORS = [
	def("shells", shellsRequestSchema, "TermShellsRequest", shellsResultSchema, "TermShellsResult"),
	def("open", openRequestSchema, "TermOpenRequest", openResultSchema, "TermOpenResult"),
	def("write", writeRequestSchema, "TermWriteRequest", writeResultSchema, "TermWriteResult"),
	def("read", readRequestSchema, "TermReadRequest", readResultSchema, "TermReadResult"),
	def("resize", resizeRequestSchema, "TermResizeRequest", resizeResultSchema, "TermResizeResult"),
	def("kill", killRequestSchema, "TermKillRequest", killResultSchema, "TermKillResult"),
	def("list", listRequestSchema, "TermListRequest", listResultSchema, "TermListResult")
];
//#endregion
export { termErrorSchema as n, DESCRIPTORS as t };
