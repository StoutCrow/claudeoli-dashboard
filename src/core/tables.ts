// Markdown (GFM) tables in the vault's known notes. Pure: no Obsidian imports.

export interface Row {
	cells: string[];
	/** 0-based line number in the note. */
	line: number;
	/** The line as written (without a trailing \r). */
	raw: string;
}

export interface Table {
	/** The nearest `#` heading above the table, without the hashes. */
	heading: string;
	header: string[];
	rows: Row[];
	/** 0-based lines of the header row and of the last row. */
	startLine: number;
	endLine: number;
}

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Splits a table row on `|`, except an escaped `\|`, a pipe inside `[[…]]` and a pipe inside backticks. */
export function splitRow(line: string): string[] {
	let s = line.trim();
	if (s.startsWith("|")) s = s.slice(1);
	if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
	const cells: string[] = [];
	let cur = "";
	let link = 0;
	let code = false;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === "\\" && s[i + 1] === "|") {
			cur += "\\|";
			i++;
			continue;
		}
		if (ch === "`") code = !code;
		else if (!code && ch === "[" && s[i + 1] === "[") {
			link++;
			cur += "[[";
			i++;
			continue;
		} else if (!code && link > 0 && ch === "]" && s[i + 1] === "]") {
			link--;
			cur += "]]";
			i++;
			continue;
		} else if (ch === "|" && !code && link === 0) {
			cells.push(cur.trim());
			cur = "";
			continue;
		}
		cur += ch;
	}
	cells.push(cur.trim());
	return cells;
}

const isRow = (line: string) => line.trim().startsWith("|");

export function parseTables(text: string): Table[] {
	const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
	const out: Table[] = [];
	let heading = "";
	for (let i = 0; i < lines.length; i++) {
		const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(lines[i]);
		if (h) {
			heading = h[1];
			continue;
		}
		if (!isRow(lines[i]) || !SEPARATOR.test(lines[i + 1] ?? "")) continue;
		const header = splitRow(lines[i]);
		const t: Table = { heading, header, rows: [], startLine: i, endLine: i + 1 };
		let j = i + 2;
		for (; j < lines.length && isRow(lines[j]); j++) {
			const cells = splitRow(lines[j]);
			while (cells.length < header.length) cells.push("");
			t.rows.push({ cells, line: j, raw: lines[j] });
			t.endLine = j;
		}
		out.push(t);
		i = j - 1;
	}
	return out;
}

/** The first table under a heading that equals or starts with `heading`. */
export function tableUnder(text: string, heading: string): Table | undefined {
	return parseTables(text).find((t) => t.heading === heading || t.heading.startsWith(heading));
}

export function cell(row: Row, table: Table, column: string): string {
	const i = table.header.indexOf(column);
	return i < 0 ? "" : (row.cells[i] ?? "");
}

/** Rows are matched by their first three cells. */
export function rowKey(row: Row): string {
	return row.cells.slice(0, 3).map((c) => c.trim()).join("\u0001");
}
