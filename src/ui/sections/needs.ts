import type { NeedsKind } from "../../core/needs.ts";
import { handoffState } from "../../core/live.ts";
import { emptyState, group, md, row } from "../common.ts";
import type { SectionCtx } from "../view.ts";

export const KIND_LABEL: Record<NeedsKind, string> = {
	handoff: "Handoff",
	ask: "Ask",
	claim: "Claim",
	setup: "Setup",
	"board-work": "Board",
	"board-message": "Message",
};

export function renderNeeds(box: HTMLElement, ctx: SectionCtx) {
	const { plugin, vault } = ctx;
	const p = plugin.settings.paths;
	if (!plugin.settings.ownerName && !ctx.live) {
		emptyState(box, "Set your name to see what needs you", "Rows the notes give to you, or address to you, show here: setup tasks, board items and board messages.", {
			label: "Open settings",
			onClick: () => ctx.go("settings"),
		});
		return;
	}
	if (!ctx.needs.length) emptyState(box, "Nothing needs you", "Handoffs to approve, questions for you, stale claims, and setup tasks you own show here.");
	for (const i of ctx.needs) {
		const note = i.kind === "setup" ? p.openWork : p.board;
		row(box, {
			kind: KIND_LABEL[i.kind],
			who: i.source === "live" ? i.detail : i.kind === "setup" ? i.detail : undefined,
			title: i.source === "vault" ? md(i.title) : i.title,
			detail: i.source === "vault" ? md(i.detail) : i.detail,
			source: i.source,
			ts: i.source === "vault" ? vault.mtimes[note] : i.ts,
			now: ctx.now,
			actions: ctx.actions?.need(i),
		});
	}
	// Approved handoffs wait for their session's next start; say so, so nobody approves twice.
	const waiting = (ctx.live?.messages ?? []).filter((m) => m.kind === "handoff" && handoffState(ctx.live!, m.id, ctx.now) === "approved");
	if (waiting.length) {
		const g = group(box, "Approved, waiting");
		for (const m of waiting) row(g, { kind: "Handoff", who: m.to, title: m.text, detail: `Waiting for ${m.to} to pick this up`, source: "live", ts: ctx.live!.statuses[m.id]?.ts, now: ctx.now, muted: true });
	}
}
