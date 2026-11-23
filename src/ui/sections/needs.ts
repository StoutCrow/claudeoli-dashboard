import type { NeedsKind } from "../../core/needs.ts";
import { emptyState, md, row } from "../common.ts";
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
	if (!plugin.settings.ownerName) {
		emptyState(box, "Set your name to see what needs you", "Rows the notes give to you, or address to you, show here: setup tasks, board items and board messages.", {
			label: "Open settings",
			onClick: () => ctx.go("settings"),
		});
		return;
	}
	if (!ctx.needs.length) {
		emptyState(box, "Nothing needs you", "Handoffs to approve, questions for you, stale claims, and setup tasks you own show here.");
		return;
	}
	const p = plugin.settings.paths;
	for (const i of ctx.needs) {
		const note = i.kind === "setup" ? p.openWork : p.board;
		row(box, {
			kind: KIND_LABEL[i.kind],
			who: i.kind === "setup" ? i.detail : undefined,
			title: md(i.title),
			detail: md(i.detail),
			source: i.source,
			ts: i.source === "vault" ? vault.mtimes[note] : i.ts,
			now: ctx.now,
		});
	}
}
