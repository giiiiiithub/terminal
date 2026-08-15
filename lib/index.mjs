import { homedir } from "node:os";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import * as pty from "node-pty";
//#region src/constants.ts
/** Per-session output buffer cap; oldest bytes are dropped beyond it. */
const MAX_BUFFER_BYTES = 2e6;
/** How long an exited session stays in the live map before being pruned. */
const SESSION_PRUNE_DELAY_MS = 6e4;
//#endregion
//#region src/index.ts
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
function fail(code, message) {
	return {
		code,
		message
	};
}
/** Reasonable clamp for PTY dimensions. */
function clampCols(value) {
	return Math.max(2, Math.min(1e3, Math.floor(value)));
}
function clampRows(value) {
	return Math.max(1, Math.min(500, Math.floor(value)));
}
/** Where a shell name lives on this platform. */
function defaultShell() {
	if (process.platform === "win32") return "cmd.exe";
	if (process.platform === "darwin") return "/bin/zsh";
	return "/bin/bash";
}
var TermService = class extends TypertRemoteService {
	sessions = /* @__PURE__ */ new Map();
	/** Exit records of pruned/killed sessions, so late `read` calls still see the exit. */
	exitedSessions = /* @__PURE__ */ new Map();
	config;
	shellCache = null;
	constructor(ctx, config = {}) {
		super(ctx, "term");
		this.config = {
			defaultReadTimeoutMs: 250,
			maxBufferBytes: MAX_BUFFER_BYTES,
			...config
		};
		ctx.effect(() => () => {
			for (const session of this.sessions.values()) try {
				session.pty.kill();
			} catch {}
			this.sessions.clear();
		});
	}
	/** Enumerate shells available on this machine (probed once per service). */
	async shells(_request) {
		if (this.shellCache !== null) return {
			ok: true,
			value: { shells: this.shellCache }
		};
		const shells = await this.probeShells();
		this.shellCache = shells;
		return {
			ok: true,
			value: { shells }
		};
	}
	async probeShells() {
		const found = [];
		if (process.platform === "win32") {
			found.push({
				id: "cmd",
				name: "cmd.exe",
				path: "cmd.exe"
			});
			const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
			if (existsSync(powershell)) found.push({
				id: "powershell",
				name: "Windows PowerShell",
				path: powershell
			});
			for (const candidate of [{
				id: "pwsh",
				name: "pwsh",
				cmd: "pwsh"
			}, {
				id: "bash",
				name: "Git Bash",
				cmd: "bash"
			}]) {
				const resolved = await this.resolveOnPath(candidate.cmd);
				if (resolved !== null) found.push({
					id: candidate.id,
					name: candidate.name,
					path: resolved
				});
			}
		} else for (const [id, name, path] of [
			[
				"bash",
				"bash",
				"/bin/bash"
			],
			[
				"zsh",
				"zsh",
				"/bin/zsh"
			],
			[
				"sh",
				"sh",
				"/bin/sh"
			]
		]) if (existsSync(path)) found.push({
			id,
			name,
			path
		});
		return found;
	}
	async resolveOnPath(command) {
		const where = process.platform === "win32" ? "where.exe" : "which";
		try {
			const line = (await new Promise((resolve, reject) => {
				execFile(where, [command], {
					timeout: 2e3,
					windowsHide: true
				}, (error, stdout) => {
					if (error !== null) reject(error);
					else resolve(stdout);
				});
			})).split(/\r?\n/).map((s) => s.trim()).find((s) => s !== "");
			return line !== void 0 && line !== "" ? line : null;
		} catch {
			return null;
		}
	}
	/** Keep an exit record for a session that left the live map. */
	rememberExit(id, exit) {
		if (this.exitedSessions.size >= 64) {
			const oldest = this.exitedSessions.keys().next().value;
			if (oldest !== void 0) this.exitedSessions.delete(oldest);
		}
		this.exitedSessions.set(id, exit);
	}
	/** Move an exited session out of the live map into the tombstone set. */
	pruneSession(id) {
		const session = this.sessions.get(id);
		if (session === void 0 || session.exited === null) return;
		this.sessions.delete(id);
		this.rememberExit(id, session.exited);
	}
	/** When the live map is at capacity, evict exited sessions to make room. */
	makeRoomForSession() {
		if (this.sessions.size < 64) return;
		for (const [id, session] of this.sessions) {
			if (this.sessions.size < 64) break;
			if (session.exited !== null) {
				this.sessions.delete(id);
				clearTimeout(session.pruneTimer);
				this.rememberExit(id, session.exited);
			}
		}
	}
	async open(request) {
		const shell = request.shell ?? this.config.shell ?? defaultShell();
		const cwd = request.cwd ?? this.config.cwd ?? homedir();
		const cols = clampCols(request.cols ?? 80);
		const rows = clampRows(request.rows ?? 24);
		const id = request.id ?? randomUUID();
		if (this.sessions.has(id)) return {
			ok: false,
			error: fail("id-conflict", `session "${id}" already exists`)
		};
		this.exitedSessions.delete(id);
		this.makeRoomForSession();
		if (this.sessions.size >= 64) return {
			ok: false,
			error: fail("session-limit", `too many live sessions (64)`)
		};
		if (!existsSync(cwd) || !statSync(cwd).isDirectory()) return {
			ok: false,
			error: fail("bad-cwd", `working directory "${cwd}" does not exist`)
		};
		let child;
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
				error: fail("spawn-failed", `could not start "${shell}" in "${cwd}": ${error.message}`)
			};
		}
		const session = {
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
			if (session.buffer.length > this.config.maxBufferBytes) session.buffer = session.buffer.slice(-this.config.maxBufferBytes);
			this.wakeWaiters(session, null);
		});
		child.onExit(({ exitCode, signal }) => {
			const code = typeof exitCode === "number" && Number.isFinite(exitCode) ? exitCode : 0;
			const sig = typeof signal === "number" && Number.isFinite(signal) ? signal : void 0;
			const exit = sig === void 0 ? { code } : {
				code,
				signal: sig
			};
			if (this.sessions.has(id)) {
				session.exited = exit;
				this.wakeWaiters(session, exit);
				session.pruneTimer = setTimeout(() => this.pruneSession(id), SESSION_PRUNE_DELAY_MS);
				session.pruneTimer.unref?.();
			} else {
				this.wakeWaiters(session, exit);
				this.rememberExit(id, exit);
			}
		});
		return {
			ok: true,
			value: {
				id,
				pid: child.pid,
				shell,
				cwd,
				cols,
				rows
			}
		};
	}
	async write(request) {
		const session = this.sessions.get(request.id);
		if (session === void 0) return {
			ok: false,
			error: fail("no-session", `session "${request.id}" does not exist`)
		};
		if (session.exited !== null) return {
			ok: false,
			error: fail("exited", `session "${request.id}" has already exited`)
		};
		let text;
		try {
			text = Buffer.from(request.data, "base64").toString("utf8");
		} catch {
			return {
				ok: false,
				error: fail("bad-data", "input is not valid base64")
			};
		}
		try {
			session.pty.write(text);
		} catch (error) {
			return {
				ok: false,
				error: fail("write-failed", error.message)
			};
		}
		return {
			ok: true,
			value: { written: text.length }
		};
	}
	async read(request) {
		const session = this.sessions.get(request.id);
		if (session === void 0) {
			const exit = this.exitedSessions.get(request.id);
			if (exit !== void 0) return {
				ok: true,
				value: {
					data: "",
					exit
				}
			};
			return {
				ok: false,
				error: fail("no-session", `session "${request.id}" does not exist`)
			};
		}
		if (session.exited !== null) return {
			ok: true,
			value: {
				data: this.drain(session),
				exit: session.exited
			}
		};
		const pending = this.drain(session);
		if (pending !== "") return {
			ok: true,
			value: {
				data: pending,
				exit: null
			}
		};
		const timeoutMs = request.timeoutMs ?? this.config.defaultReadTimeoutMs;
		return new Promise((resolve) => {
			let settled = false;
			const finish = (value) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				const index = session.waiters.indexOf(waiter);
				if (index >= 0) session.waiters.splice(index, 1);
				resolve(value);
			};
			const timer = setTimeout(() => {
				finish({
					ok: true,
					value: {
						data: this.drain(session),
						exit: null
					}
				});
			}, timeoutMs);
			const waiter = {
				resolve: finish,
				timer
			};
			session.waiters.push(waiter);
		});
	}
	/** Resolve pending waiters with whatever output is buffered (or the exit). */
	wakeWaiters(session, exit) {
		if (session.waiters.length === 0) return;
		session.waiters.shift().resolve({
			ok: true,
			value: {
				data: this.drain(session),
				exit
			}
		});
		if (exit !== null) for (const rest of session.waiters.splice(0)) rest.resolve({
			ok: true,
			value: {
				data: "",
				exit
			}
		});
	}
	drain(session) {
		const pending = session.buffer;
		session.buffer = "";
		return Buffer.from(pending, "utf8").toString("base64");
	}
	async resize(request) {
		const session = this.sessions.get(request.id);
		if (session === void 0) return {
			ok: false,
			error: fail("no-session", `session "${request.id}" does not exist`)
		};
		const cols = clampCols(request.cols);
		const rows = clampRows(request.rows);
		try {
			session.pty.resize(cols, rows);
		} catch (error) {
			return {
				ok: false,
				error: fail("resize-failed", error.message)
			};
		}
		session.cols = cols;
		session.rows = rows;
		return {
			ok: true,
			value: {
				cols,
				rows
			}
		};
	}
	async kill(request) {
		const session = this.sessions.get(request.id);
		if (session === void 0) return {
			ok: false,
			error: fail("no-session", `session "${request.id}" does not exist`)
		};
		this.sessions.delete(request.id);
		clearTimeout(session.pruneTimer);
		if (session.exited !== null) {
			this.rememberExit(request.id, session.exited);
			return {
				ok: true,
				value: { killed: false }
			};
		}
		if (process.platform === "win32") try {
			await new Promise((resolve) => {
				execFile("taskkill", [
					"/PID",
					String(session.pty.pid),
					"/T",
					"/F"
				], {
					windowsHide: true,
					timeout: 3e3
				}, () => resolve());
			});
		} catch {}
		try {
			session.pty.kill();
		} catch {}
		return {
			ok: true,
			value: { killed: true }
		};
	}
	async list(_request) {
		const sessions = [];
		for (const session of this.sessions.values()) sessions.push({
			id: session.id,
			pid: session.pty.pid,
			shell: session.shell,
			cwd: session.cwd,
			cols: session.cols,
			rows: session.rows,
			alive: session.exited === null,
			exit: session.exited
		});
		return {
			ok: true,
			value: { sessions }
		};
	}
};
//#endregion
export { TermService as default };
