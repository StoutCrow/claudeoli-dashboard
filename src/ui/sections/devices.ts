import { cell, type Table } from "../../core/tables.ts";
import { emptyState, md, row } from "../common.ts";
import type { SectionCtx } from "../view.ts";
import { knownPcs, openButton, pcHeading } from "./sessions.ts";

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
		const g = pcHeading(box, pc, m ? md(cell(m, v.machines, "Role")) : undefined);
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
