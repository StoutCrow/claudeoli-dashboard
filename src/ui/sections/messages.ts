import { cell } from "../../core/tables.ts";
import { el, emptyState, group, md, row } from "../common.ts";
import type { SectionCtx } from "../view.ts";

export function renderMessages(box: HTMLElement, ctx: SectionCtx) {
	const v = ctx.vault.model;
	const p = ctx.plugin.settings.paths;
	const g = group(box, "Coordination board");
	const t = v.messages;
	if (!t) {
		emptyState(g, "Board messages not found", `Looked for a Messages table in ${p.board}.`);
		return;
	}
	if (!t.rows.length) el("div", { cls: "co-line is-muted", text: "No board messages." }, g);
	for (const r of t.rows) {
		const answer = md(cell(r, t, "Answer"));
		row(g, {
			kind: cell(r, t, "Date"),
			title: `${md(cell(r, t, "About"))}`,
			detail: `${md(cell(r, t, "From"))} to ${md(cell(r, t, "To"))}: ${md(cell(r, t, "Message"))}${answer ? `\nAnswer: ${answer}` : ""}`,
			muted: !!answer,
			source: "vault",
			ts: ctx.vault.mtimes[p.board],
			now: ctx.now,
		});
	}
}
