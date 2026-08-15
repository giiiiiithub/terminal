/**
 * Zod schemas for the dsh-terminal wire contract. Bundled into both faces:
 * the host typert manifest validates incoming args and outgoing results, and
 * the client contribution validates the same envelope on the browser side.
 */
import { z } from "zod";

export const termErrorSchema = z.object({
  code: z.string(),
  message: z.string()
});

export function okSchema<T extends z.ZodType>(value: T) {
  return z.object({ ok: z.literal(true), value });
}

export function resultSchema<T extends z.ZodType>(value: T) {
  return z.union([
    okSchema(value),
    z.object({ ok: z.literal(false), error: termErrorSchema })
  ]);
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

// ── shells ──────────────────────────────────────────────────────────────────

export const shellsRequestSchema = z.object({});

export const shellsResultSchema = resultSchema(
  z.object({ shells: z.array(shellInfoSchema) })
);

// ── open ────────────────────────────────────────────────────────────────────

export const openRequestSchema = z.object({
  id: z.string().min(1).optional(),
  shell: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  cols: z.number().int().min(2).max(1000).optional(),
  rows: z.number().int().min(1).max(500).optional(),
  env: z.record(z.string(), z.string()).optional()
});

export const openResultSchema = resultSchema(
  z.object({
    id: z.string(),
    pid: z.number(),
    shell: z.string(),
    cwd: z.string(),
    cols: z.number(),
    rows: z.number()
  })
);

// ── write ───────────────────────────────────────────────────────────────────

export const writeRequestSchema = z.object({
  id: z.string().min(1),
  data: z.string()
});

export const writeResultSchema = resultSchema(
  z.object({ written: z.number() })
);

// ── read ────────────────────────────────────────────────────────────────────

export const readRequestSchema = z.object({
  id: z.string().min(1),
  timeoutMs: z.number().int().min(0).max(30_000).optional()
});

export const readResultSchema = resultSchema(
  z.object({
    data: z.string(),
    exit: z.union([exitSchema, z.null()])
  })
);

// ── resize ──────────────────────────────────────────────────────────────────

export const resizeRequestSchema = z.object({
  id: z.string().min(1),
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(500)
});

export const resizeResultSchema = resultSchema(
  z.object({ cols: z.number(), rows: z.number() })
);

// ── kill / list ─────────────────────────────────────────────────────────────

export const killRequestSchema = z.object({
  id: z.string().min(1)
});

export const killResultSchema = resultSchema(
  z.object({ killed: z.boolean() })
);

export const listRequestSchema = z.object({});

export const listResultSchema = resultSchema(
  z.object({ sessions: z.array(sessionInfoSchema) })
);
