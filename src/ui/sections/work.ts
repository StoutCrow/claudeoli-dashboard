import { cell, type Row, type Table } from "../../core/tables.ts";
import { dropdown, el, emptyState, group, md, pcPart, row } from "../common.ts";
import type { SectionCtx } from "../view.ts";

interface Item {
	pc: string;
	project: string;
	owner: string;
	state: string;
	title: string;
	detail: string;
	note: string;
}

const ANY = "";

function items(t: Table | null, map: (r: Row, t: Table) => Item): Item[] {
	return t ? t.rows.map((r) => map(r, t)) : [];
}

export function renderWork(box: HTMLElement, ctx: SectionCtx) {
	const v = ctx.vault.model;
	const p = ctx.plugin.settings.paths;
	const queue = items(v.queue, (r, t) => ({
		pc: md(cell(r, t, "PC")).toLowerCase(),
		project: "Setup",
		owner: md(cell(r, t, "Owner")),
		state: md(cell(r, t, "State")),
		title: md(cell(r, t, "Task")),
		detail: md(cell(r, t, "Notes")),
		note: p.openWork,
	})).filter((i) => i.state !== "done");
	const board = items(v.work, (r, t) => ({
		// Only "name@pc" owners name a PC; "owner (user)" is a person.
		pc: md(cell(r, t, "Owner")).includes("@") ? pcPart(md(cell(r, t, "Owner"))) : "",
		project: md(cell(r, t, "Project")),
		owner: md(cell(r, t, "Owner")),
		state: md(cell(r, t, "State")),
		title: md(cell(r, t, "Feature")),
		detail: [md(cell(r, t, "Files or area")), md(cell(r, t, "Notes"))].filter(Boolean).join(" · "),
		note: p.board,
	}));
	if (!queue.length && !board.length) {
		emptyState(box, "No open work", `Nothing open in ${p.openWork} or ${p.board}.`);
		return;
	}
	const all = [...queue, ...board];
	const bar = el("div", { cls: "co-toolbar" }, box);
	const filter = (key: "pc" | "project" | "owner", label: string, values: string[]) => {
		const opts: [string, string][] = [[ANY, label], ...[...new Set(values)].filter(Boolean).sort().map((x) => [x, x] as [string, string])];
		dropdown(bar, opts, ctx.ui[`work.${key}`] ?? ANY, (x) => {
			ctx.ui[`work.${key}`] = x;
			ctx.redraw();
		}, label);
	};
	filter("pc", "All PCs", all.map((i) => i.pc));
	filter("project", "All projects", all.map((i) => i.project));
	filter("owner", "All owners", all.map((i) => i.owner));
	const keep = (i: Item) => (["pc", "project", "owner"] as const).every((k) => !ctx.ui[`work.${k}`] || i[k] === ctx.ui[`work.${k}`]);

	const list = (title: string, xs: Item[]) => {
		const shown = xs.filter(keep);
		const g = group(box, title, `${shown.length} of ${xs.length}`);
		if (!shown.length) el("div", { cls: "co-line is-muted", text: "Nothing matches these filters." }, g);
		for (const i of shown) {
			row(g, {
				kind: i.state,
				who: i.pc || undefined,
				title: i.title,
				detail: [i.project === "Setup" ? i.pc : i.project, i.owner, i.detail].filter(Boolean).join(" · "),
				source: "vault",
				ts: ctx.vault.mtimes[i.note],
				now: ctx.now,
			});
		}
	};
	list("Setup queue", queue);
	list("Coordination board", board);
}
