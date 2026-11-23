// "Needs you": everything waiting on the owner, with the action beside it. Pure.
import { cell, rowKey, type Row, type Table } from "./tables.ts";
import type { VaultModel } from "./vault.ts";

export type NeedsKind = "handoff" | "ask" | "claim" | "setup" | "board-work" | "board-message";

export interface NeedsItem {
	kind: NeedsKind;
	source: "vault" | "live";
	title: string;
	detail: string;
	ts?: number;
	/** rowKey for vault rows, event id or claim key for live ones. */
	ref: string;
	action?: "approve-refuse" | "reply" | "release" | "setup-done" | "board-answer";
	/** The vault row shown, so an edit can refuse if it changed since. */
	row?: Row;
}

/** Plain text of a cell for a title: bold marks dropped. */
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").trim();

/** Whether an Owner or To cell names the owner: "owner", "owner (user)", or one of a list ("a, owner and b"). */
export function namesOwner(value: string, ownerName: string): boolean {
	const name = ownerName.trim().toLowerCase();
	if (!name) return false;
	return value
		.split(/,|\band\b/i)
		.map((p) => p.replace(/\(user\)/i, "").trim().toLowerCase())
		.some((p) => p === name);
}

function rowsOf(t: Table | null, keep: (r: Row, t: Table) => boolean): [Row, Table][] {
	return t ? t.rows.filter((r) => keep(r, t)).map((r) => [r, t] as [Row, Table]) : [];
}

export function needsFromVault(v: VaultModel, ownerName: string): NeedsItem[] {
	const out: NeedsItem[] = [];
	for (const [r, t] of rowsOf(v.queue, (r, t) => namesOwner(cell(r, t, "Owner"), ownerName) && cell(r, t, "State").trim() !== "done")) {
		out.push({ kind: "setup", source: "vault", title: plain(cell(r, t, "Task")), detail: `${cell(r, t, "PC")} · ${cell(r, t, "State")}`, ref: rowKey(r), action: "setup-done", row: r });
	}
	for (const [r, t] of rowsOf(v.work, (r, t) => namesOwner(cell(r, t, "Owner"), ownerName) && ["review", "blocked"].includes(cell(r, t, "State").trim()))) {
		out.push({ kind: "board-work", source: "vault", title: plain(cell(r, t, "Feature")), detail: `${cell(r, t, "Project")} · ${cell(r, t, "State")}`, ref: rowKey(r), row: r });
	}
	for (const [r, t] of rowsOf(v.messages, (r, t) => namesOwner(cell(r, t, "To"), ownerName) && !cell(r, t, "Answer").trim())) {
		out.push({ kind: "board-message", source: "vault", title: plain(cell(r, t, "About")), detail: cell(r, t, "Message"), ref: rowKey(r), action: "board-answer", row: r });
	}
	return out;
}
