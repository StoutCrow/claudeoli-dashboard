import { cell, type Table } from "../../core/tables.ts";
import { Notice } from "obsidian";
import { commitDiffers } from "../../core/needs.ts";
import { POWER } from "../../core/levels.ts";
import { button, el, emptyState, md, row } from "../common.ts";
import { ConfirmModal } from "../modals.ts";
import type { SectionCtx } from "../view.ts";
import { botLine, knownPcs, openButton, pcHeading } from "./sessions.ts";

const rowFor = (t: Table | null, pc: string) => t?.rows.find((r) => md(cell(r, t, "PC")).toLowerCase() === pc);

export function renderDevices(box: HTMLElement, ctx: SectionCtx) {
	const v = ctx.vault.model;
	const path = ctx.plugin.settings.paths.machines;
	if (!v.machines) {
		emptyState(box, "Setup machines note not found", `Looked for ${path}.`, { label: "Open settings", onClick: () => ctx.go("settings") });
		return;
	}
	const ts = ctx.vault.mtimes[path];
	const update = updateAction(ctx);
	if (update) {
		const bar = el("div", { cls: "co-toolbar is-end" }, box);
		button(bar, "Update all bots", () => update("all"), { title: "Every PC's bot updates itself to the repo's main and reports back" });
	}
	for (const pc of knownPcs(ctx)) {
		const m = rowFor(v.machines, pc);
		const g = pcHeading(box, pc, m ? md(cell(m, v.machines, "Role")) : undefined, botLine(ctx, pc));
		const p = ctx.live?.presence[pc];
		if (p) {
			const differs = ctx.live ? commitDiffers(ctx.live, pc) : 0;
			const build = p.commit ? ` · ${p.commit}${p.branch && p.branch !== "main" ? ` on ${p.branch}` : ""}` : "";
			row(g, {
				title: `Bus bot, protocol v${p.version}${build}`,
				detail: [
					p.version < 2 ? "Too old to accept approvals from the dashboard: update this PC's bot." : `${p.sessions.length} session${p.sessions.length === 1 ? "" : "s"} running`,
					differs ? `runs a different commit from ${differs} other PC${differs === 1 ? "" : "s"}` : "",
				].filter(Boolean).join(" · "),
				source: "live",
				ts: p.seen,
				now: ctx.now,
				muted: p.version >= 2 && !differs,
				actions: update ? (a) => button(a, "Update bot", () => update(pc)) : undefined,
			});
		}
		if (!m) {
			row(g, { title: "Not in the Machines table", now: ctx.now, muted: true });
			continue;
		}
		row(g, {
			title: `Checked ${md(cell(m, v.machines, "Checked")) || "never"}`,
			detail: [md(cell(m, v.machines, "How Claude reaches it")), md(cell(m, v.machines, "Owner"))].filter(Boolean).join(" · "),
			source: "vault",
			ts,
			now: ctx.now,
			actions: (a) => openButton(a, ctx, path),
		});
		const t = rowFor(v.tools, pc);
		if (t && v.tools) {
			const parts = v.tools.header.slice(1).map((h) => [h, md(cell(t, v.tools!, h))]).filter(([, x]) => x);
			row(g, { title: "Tools", detail: parts.map(([h, x]) => `${h.replace(/\s*\(.*\)/, "")} ${x}`).join(" · "), source: "vault", ts, now: ctx.now });
		}
		const h = rowFor(v.hooks, pc);
		if (h && v.hooks) {
			const on = md(cell(h, v.hooks, "Installed")).toLowerCase().startsWith("yes");
			row(g, { title: on ? "Sync hooks installed" : "Sync hooks not installed", detail: on ? `since ${md(cell(h, v.hooks, "Since"))}` : undefined, muted: on, source: "vault", ts, now: ctx.now });
		}
	}
}

/** The owner's "update the bot" action, or null when this device's account isn't the owner or the bus isn't live. */
function updateAction(ctx: SectionCtx): ((target: string) => void) | null {
	const bus = ctx.bus;
	const pl = (ctx.live?.powerLevels ?? {}) as { users?: Record<string, number>; users_default?: number };
	if (!bus || !ctx.me || (pl.users?.[ctx.me] ?? pl.users_default ?? 0) < POWER.owner) return null;
	return (target) =>
		new ConfirmModal(ctx.plugin.app, {
			title: target === "all" ? "Update every bot?" : `Update ${target.toUpperCase()}'s bot?`,
			body:
				`${target === "all" ? "Each PC's bot" : "The bot"} updates its own checkout to the repo's main: a fast-forward only, then npm ci and the tests. ` +
				"If the tests fail it goes back to the commit it was on. It refuses, and tells you why, when its checkout is off main, has uncommitted changes, has unpushed commits, or can't reach GitHub. " +
				"After a good update it restarts. Each bot reports back under Messages.",
			cta: "Update",
			onYes: () => bus.updateBots(target).then(() => void new Notice("Update sent; each bot reports back on the bus")),
		}).open();
}