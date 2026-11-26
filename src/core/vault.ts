// The vault layer: the known notes' tables, read from their text. Pure: no Obsidian imports.
import { parseTables, tableUnder, type Table } from "./tables.ts";

export interface NotePaths {
	machines: string;
	openWork: string;
	/** Folder holding one `<pc>.md` session log per PC; ends with "/". */
	sessionsDir: string;
	handoff: string;
	board: string;
}

export const DEFAULT_PATHS: NotePaths = {
	machines: "CLAUDE/Setup/Setup Machines.md",
	openWork: "CLAUDE/Setup/Setup Open work.md",
	sessionsDir: "CLAUDE/Setup/Sessions/",
	handoff: "Guides/Session handoff.md",
	board: "Guides/Coordination board.md",
};

export interface VaultModel {
	machines: Table | null;
	tools: Table | null;
	hooks: Table | null;
	queue: Table | null;
	done: Table | null;
	now: Table | null;
	log: Table | null;
	work: Table | null;
	messages: Table | null;
	decisions: string[];
	sessionLogs: Record<string, Table>;
	/** Note paths that don't exist (or couldn't be read). */
	missing: string[];
}

const dirOf = (p: NotePaths) => (p.sessionsDir.endsWith("/") ? p.sessionsDir : p.sessionsDir + "/");

/** Whether a vault path is one the dashboard reads (so a change to it needs a re-read). */
export function watchedPath(path: string, p: NotePaths): boolean {
	if ([p.machines, p.openWork, p.handoff, p.board].includes(path)) return true;
	return path.startsWith(dirOf(p)) && path.endsWith(".md") && !path.slice(dirOf(p).length).includes("/");
}

/** Bullet lines under the "Decisions" heading, without the "- ". */
function decisionsOf(text: string): string[] {
	const out: string[] = [];
	let inside = false;
	for (const line of text.split("\n").map((l) => l.replace(/\r$/, ""))) {
		const h = /^#{1,6}\s+(.*)$/.exec(line);
		if (h) {
			inside = h[1].trim().startsWith("Decisions");
			continue;
		}
		if (inside && /^\s*[-*]\s+/.test(line)) out.push(line.replace(/^\s*[-*]\s+/, "").trim());
	}
	return out;
}

export function readVault(files: Record<string, string | undefined>, p: NotePaths): VaultModel {
	const missing: string[] = [];
	const get = (path: string): string | undefined => {
		const t = files[path];
		if (t === undefined) missing.push(path);
		return t;
	};
	const under = (text: string | undefined, heading: string) => (text === undefined ? null : (tableUnder(text, heading) ?? null));

	const machines = get(p.machines);
	const openWork = get(p.openWork);
	const handoff = get(p.handoff);
	const board = get(p.board);

	const sessionLogs: Record<string, Table> = {};
	for (const [path, text] of Object.entries(files)) {
		if (text === undefined || !watchedPath(path, p) || !path.startsWith(dirOf(p))) continue;
		const t = parseTables(text)[0];
		if (t) sessionLogs[path.slice(dirOf(p).length, -3)] = t;
	}

	return {
		machines: under(machines, "Machines"),
		tools: under(machines, "Tools"),
		hooks: under(machines, "Sync hooks"),
		queue: under(openWork, "Queue"),
		done: under(openWork, "Done"),
		now: under(handoff, "Now"),
		log: under(handoff, "Log"),
		work: under(board, "Work"),
		messages: under(board, "Messages"),
		decisions: board === undefined ? [] : decisionsOf(board),
		sessionLogs,
		missing,
	};
}
