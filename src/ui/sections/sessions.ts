import { cell } from "../../core/tables.ts";
import { el, emptyState, identityDot, md, pcPart, row } from "../common.ts";
import type { SectionCtx } from "../view.ts";

const SHOWN_LOG_ROWS = 5;

/** Every PC the vault knows about, in the Machines table's order, then any others. */
export function knownPcs(ctx: SectionCtx): string[] {
	const v = ctx.vault.model;
	const out: string[] = [];
	const add = (pc: string) => {
		const k = pc.trim().toLowerCase();
		if (k && !out.includes(k)) out.push(k);
	};
	for (const r of v.machines?.rows ?? []) add(md(cell(r, v.machines!, "PC")));
	for (const pc of Object.keys(v.sessionLogs)) add(pc);
	for (const r of v.now?.rows ?? []) add(pcPart(cell(r, v.now!, "Who / session")));
	return out;
}

export function pcHeading(parent: HTMLElement, pc: string, note?: string): HTMLElement {
	const g = el("div", { cls: "co-group" }, parent);
	const h = el("div", { cls: "co-group-head" }, g);
	identityDot(h, pc);
	el("span", { cls: "co-group-title", text: pc.toUpperCase() }, h);
	if (note) el("span", { cls: "co-group-note", text: note }, h);
	return g;
}

export function renderSessions(box: HTMLElement, ctx: SectionCtx) {
	const v = ctx.vault.model;
	const p = ctx.plugin.settings.paths;
	const pcs = knownPcs(ctx);
	if (!pcs.length) {
		emptyState(box, "No sessions found", `Nothing in ${p.handoff} or ${p.sessionsDir} yet.`, { label: "Open settings", onClick: () => ctx.go("settings") });
		return;
	}
	for (const pc of pcs) {
		const g = pcHeading(box, pc);
		const now = (v.now?.rows ?? []).filter((r) => pcPart(cell(r, v.now!, "Who / session")) === pc);
		for (const r of now) {
			row(g, {
				kind: "Now",
				title: md(cell(r, v.now!, "Area")),
				detail: [md(cell(r, v.now!, "Project")), md(cell(r, v.now!, "Who / session")), md(cell(r, v.now!, "Notes"))].filter(Boolean).join(" · "),
				source: "vault",
				ts: ctx.vault.mtimes[p.handoff],
				now: ctx.now,
				actions: (a) => openButton(a, ctx, p.handoff),
			});
		}
		const log = v.sessionLogs[pc];
		if (!log) {
			el("div", { cls: "co-line is-muted", text: "No session log on this PC yet." }, g);
			continue;
		}
		for (const r of log.rows.slice(-SHOWN_LOG_ROWS).reverse()) {
			const logged = md(cell(r, log, "Log row today")).toLowerCase() !== "no";
			row(g, {
				kind: "Ended",
				title: md(cell(r, log, "Folder")),
				detail: `${cell(r, log, "Ended")} · ${md(cell(r, log, "Why it ended"))}${logged ? "" : " · no handoff Log row"}`,
				muted: logged,
				now: ctx.now,
				actions: (a) => openButton(a, ctx, `${p.sessionsDir.replace(/\/?$/, "/")}${pc}.md`),
			});
		}
	}
}

export function openButton(parent: HTMLElement, ctx: SectionCtx, path: string) {
	const b = el("button", { cls: "co-btn is-quiet", text: "Open note" }, parent);
	b.addEventListener("click", () => ctx.openNote(path));
}
