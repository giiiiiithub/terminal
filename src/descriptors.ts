/**
 * Invocation descriptors for the `term` Remote — one source of truth consumed
 * by both the host TYPERT manifest (typert.ts) and the client contribution
 * (remote.ts), mirroring the shape the repo's typert generator emits.
 */
import * as S from "./schemas.js";

const PACKAGE = "dsh-terminal";
const NS = "term";

interface Descriptor {
  id: string;
  service: string;
  namespace: string;
  method: string;
  invocation: { kind: "direct" };
  parameters: Array<{
    name: string;
    wire: string;
    source: "json";
    codec: { mode: "strict"; typeSymbol: string; schema: unknown };
  }>;
  result: { mode: "strict"; typeSymbol: string; schema: unknown };
  sourceLocation: { file: string; line: number; column: number };
}

function def(
  method: string,
  requestSchema: unknown,
  requestType: string,
  resultSchema: unknown,
  resultType: string
): Descriptor {
  return {
    id: `${PACKAGE}#${NS}/${method}`,
    service: NS,
    namespace: NS,
    method,
    invocation: { kind: "direct" },
    parameters: [
      {
        name: "request",
        wire: "request",
        source: "json",
        codec: { mode: "strict", typeSymbol: `${PACKAGE}/types#${requestType}`, schema: requestSchema }
      }
    ],
    result: {
      mode: "strict",
      typeSymbol: `${PACKAGE}/types#${resultType}`,
      schema: resultSchema
    },
    sourceLocation: { file: "src/index.ts", line: 1, column: 1 }
  };
}

export const DESCRIPTORS: Descriptor[] = [
  def("shells", S.shellsRequestSchema, "TermShellsRequest", S.shellsResultSchema, "TermShellsResult"),
  def("open", S.openRequestSchema, "TermOpenRequest", S.openResultSchema, "TermOpenResult"),
  def("write", S.writeRequestSchema, "TermWriteRequest", S.writeResultSchema, "TermWriteResult"),
  def("read", S.readRequestSchema, "TermReadRequest", S.readResultSchema, "TermReadResult"),
  def("resize", S.resizeRequestSchema, "TermResizeRequest", S.resizeResultSchema, "TermResizeResult"),
  def("kill", S.killRequestSchema, "TermKillRequest", S.killResultSchema, "TermKillResult"),
  def("list", S.listRequestSchema, "TermListRequest", S.listResultSchema, "TermListResult")
];
