// The dashboard's two vault edits. Each runs inside one vault.process() call on the text as it is at
// write time, touches only its own rows, and refuses when the row changed since it was shown
// (agents edit the same notes through Obsidian Sync). Pure.
import { cell, rowKey, tableUnder, type Row, type Table } from "./tables.ts";

export type EditResult = { ok: true; text: string } | { ok: false; reason: "changed" | "missing" };

/** The shown row in today's text: missing if no row has its first three cells, changed if it was edited. */
function find(t: Table | undefined, shown: Row): Row | "missing" | "changed" {
	const now = t?.rows.find((r) => rowKey(r) === rowKey(shown));
	if (!now) return "missing";
	return now.raw === shown.raw ? now : "changed";
}

const splitLines = (text: string) => ({ eol: text.includes("\r\n") ? "\r\n" : "\n", lines: text.split(/\r?\n/) });
const rowLine = (cells: string[]) => `| ${cells.join(" | ")} |`;

/**
 * A table cell from free text: one line, pipes escaped. No regex lookbehind (iOS before 16.4 can't parse one):
 * an already escaped pipe matches first and is kept as it is.
 */
export const asCell = (s: string) => s.replace(/\r?\n+/g, " ").replace(/\\\||\|/g, (m) => (m === "|" ? "\\|" : m)).trim();

/** Moves a Queue row to the top of Done (Date, PC, Task, Owner), in one edit. */
export function setupToDone(text: string, shown: Row, date: string): EditResult {
	const queue = tableUnder(text, "Queue");
	const done = tableUnder(text, "Done");
	const row = find(queue, shown);
	if (row === "missing" || row === "changed") return { ok: false, reason: row };
	if (!queue || !done) return { ok: false, reason: "missing" };
	const doneRow = rowLine(done.header.map((h) => (h === "Date" ? date : cell(row, queue, h))));
	const { eol, lines } = splitLines(text);
	let at = done.startLine + 2;
	lines.splice(row.line, 1);
	if (row.line < at) at--;
	lines.splice(at, 0, doneRow);
	return { ok: true, text: lines.join(eol) };
}

/** Fills the empty Answer cell of a board message. */
export function answerBoardMessage(text: string, shown: Row, answer: string): EditResult {
	const t = tableUnder(text, "Messages");
	const row = find(t, shown);
	if (row === "missing" || row === "changed") return { ok: false, reason: row };
	const i = t!.header.indexOf("Answer");
	if (i < 0 || row.cells[i]?.trim()) return { ok: false, reason: "changed" };
	const cells = [...row.cells];
	cells[i] = asCell(answer);
	const { eol, lines } = splitLines(text);
	lines[row.line] = rowLine(cells);
	return { ok: true, text: lines.join(eol) };
}
