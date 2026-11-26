import { cell, type Table } from "../../core/tables.ts";
import { emptyState, md, row } from "../common.ts";
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
	for (const pc of knownPcs(ctx)) {
		const m = rowFor(v.machines, pc);
		const g = pcHeading(box, pc, m ? md(cell(m, v.machines, "Role")) : undefined, botLine(ctx, pc));
		const p = ctx.live?.presence[pc];
		if (p) row(g, { title: `Bus bot, protocol v${p.version}`, detail: p.version < 2 ? "Too old to accept approvals from the dashboard: update this PC's bot." : `${p.sessions.length} session${p.sessions.length === 1 ? "" : "s"} running`, source: "live", ts: p.seen, now: ctx.now, muted: p.version >= 2 });
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
