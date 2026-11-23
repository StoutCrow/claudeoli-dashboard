import { cell } from "../../core/tables.ts";
import { OWNER_ADDRESS, type BusMessage } from "../../core/protocol.ts";
import { el, emptyState, group, md, row } from "../common.ts";
import type { SectionCtx } from "../view.ts";

const SHOWN_THREADS = 30;

export function renderMessages(box: HTMLElement, ctx: SectionCtx) {
	if (ctx.actions && ctx.live) {
		const bar = el("div", { cls: "co-toolbar is-end" }, box);
		ctx.actions.newMessage(bar);
	}
	renderBus(box, ctx);
	renderBoard(box, ctx);
}

/** Bus threads that involve the owner, newest first, one row per thread. */
function renderBus(box: HTMLElement, ctx: SectionCtx) {
	const g = group(box, "Agent bus");
	if (!ctx.live) {
		el("div", { cls: "co-line is-muted", text: ctx.conn.kind === "offline" ? "The agents room is offline; showing board messages only." : "Sign in on this device to see bus messages." }, g);
		return;
	}
	const threads = new Map<string, BusMessage[]>();
	for (const m of ctx.live.messages) (threads.get(m.thread) ?? threads.set(m.thread, []).get(m.thread)!).push(m);
	const mine = [...threads.values()]
		.filter((ms) => ms.some((m) => m.from === OWNER_ADDRESS || m.to === OWNER_ADDRESS))
		.sort((a, b) => b[b.length - 1].ts - a[a.length - 1].ts)
		.slice(0, SHOWN_THREADS);
	if (!mine.length) el("div", { cls: "co-line is-muted", text: "No bus messages to or from you yet." }, g);
	for (const ms of mine) {
		const first = ms[0];
		const last = ms[ms.length - 1];
		const other = first.from === OWNER_ADDRESS ? first.to : first.from;
		row(g, {
			kind: first.kind === "chat" ? "Message" : first.kind[0].toUpperCase() + first.kind.slice(1),
			who: other,
			title: first.text,
			detail: `${ms.length > 1 ? `${ms.length} messages · last ` : ""}${last.from} to ${last.to}${ms.length > 1 ? `: ${last.text}` : ""}`,
			source: "live",
			ts: last.ts,
			now: ctx.now,
			actions: last.from !== OWNER_ADDRESS ? ctx.actions?.reply(last) : undefined,
		});
	}
}

function renderBoard(box: HTMLElement, ctx: SectionCtx) {
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
			title: md(cell(r, t, "About")),
			detail: `${md(cell(r, t, "From"))} to ${md(cell(r, t, "To"))}: ${md(cell(r, t, "Message"))}${answer ? `\nAnswer: ${answer}` : ""}`,
			muted: !!answer,
			source: "vault",
			ts: ctx.vault.mtimes[p.board],
			now: ctx.now,
		});
	}
}
