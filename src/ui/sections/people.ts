import { Notice } from "obsidian";
import { POWER, levelOf, parseRoles, projectOf, type Level, type Roles } from "../../core/levels.ts";
import { levelChanges, levelsFor, rolesAfter } from "../../core/rooms.ts";
import { serverOf } from "../../core/protocol.ts";
import { button, dropdown, el, group, row } from "../common.ts";
import { ConfirmModal, TextModal } from "../modals.ts";
import { liveOnly } from "./claims.ts";
import type { SectionCtx } from "../view.ts";

const LEVEL_LABEL: Record<Level, string> = { owner: "Owner", collaborator: "Collaborator", viewer: "Viewer", bot: "Bot" };

export function renderPeople(box: HTMLElement, ctx: SectionCtx) {
	if (liveOnly(box, ctx, "People")) return;
	const live = ctx.live!;
	const me = ctx.me ?? "";
	const pl = (live.powerLevels ?? {}) as { users?: Record<string, number>; users_default?: number; events?: Record<string, number> };
	const isOwner = (pl.users?.[me] ?? pl.users_default ?? 0) >= POWER.owner;
	const roles: Roles = parseRoles(live.roles) ?? { v: 2, collaborators: false, projects: {}, users: {} };
	const bots = Object.keys(live.presence).map((pc) => `@claudeoli-${pc}:${serverOf(me)}`);
	const bus = ctx.bus;
	const run = (p: Promise<unknown>, done: string) => p.then(() => new Notice(done), (e: Error) => new Notice(`Not changed: ${e.message}`));

	const owners = group(box, "Everyone with a level", roles.collaborators ? "collaborators on" : "collaborators switched off");
	row(owners, { kind: "Owner", who: me, title: me, detail: "Everything: approve and refuse, release any claim, change levels and sharing", now: ctx.now });
	for (const b of bots) row(owners, { kind: "Bot", who: b.replace(/^@claudeoli-([^:]+):.*/, "$1"), title: b, detail: "Sends, claims, publishes presence. Never approves.", now: ctx.now, muted: true });

	// Projects anyone could share: the shared ones, and the folders of sessions now live.
	const known = [...new Set([...Object.keys(roles.projects), ...Object.values(live.presence).flatMap((p) => p.sessions.map(projectOf))].filter(Boolean))].sort();

	for (const [id, entry] of Object.entries(roles.users)) {
		row(owners, {
			kind: LEVEL_LABEL[levelOf(roles, id, me) ?? "viewer"],
			title: id,
			detail: [entry.projects.length ? `Sees ${entry.projects.join(", ")}` : "No project shared", entry.pcs.length ? `PCs: ${entry.pcs.join(", ")}` : ""].filter(Boolean).join(" · "),
			now: ctx.now,
			actions: isOwner && bus
				? (a) => {
						const lv = dropdown(a, [["viewer", "Viewer"], ["collaborator", roles.collaborators ? "Collaborator" : "Collaborator (switched off)"]], entry.level, (v) => {
							void run(bus.setRoles(rolesAfter(roles, { user: id, level: v as Level })), `${id} is now ${v}`);
						}, `Level of ${id}`);
						lv.querySelector<HTMLOptionElement>('option[value="collaborator"]')!.disabled = !roles.collaborators;
						const unshared = known.filter((p) => !entry.projects.includes(p));
						if (unshared.length) {
							dropdown(a, [["", "Share a project…"], ...unshared.map((p) => [p, p] as [string, string])], "", (p) => {
								if (!p) return;
								new ConfirmModal(ctx.plugin.app, {
									title: `Share ${p}?`,
									body: `${id} will see ${p}'s room: copies of its bus messages, claims and status, and its sessions' presence. Nothing from other projects.`,
									cta: "Share",
									onYes: () => run(bus.share(roles, id, p, me, bots), `Shared ${p} with ${id}`),
								}).open();
							}, `Share a project with ${id}`);
						}
						for (const p of entry.projects) {
							button(a, `Stop sharing ${p}`, () =>
								new ConfirmModal(ctx.plugin.app, {
									title: `Stop sharing ${p}?`,
									body: `${id} is removed from ${p}'s room and no longer sees it.`,
									cta: "Stop sharing",
									warning: true,
									onYes: () => run(bus.unshare(roles, id, p), `Stopped sharing ${p} with ${id}`),
								}).open(),
							);
						}
					}
				: undefined,
		});
	}
	if (!Object.keys(roles.users).length) el("div", { cls: "co-line is-muted", text: "Nobody else has a level yet." }, owners);

	if (!isOwner || !bus) {
		el("div", { cls: "co-line is-muted", text: "Only the owner changes levels and sharing." }, box);
		return;
	}
	const bar = el("div", { cls: "co-toolbar" }, owners);
	button(bar, "Add a viewer…", () =>
		new TextModal(ctx.plugin.app, {
			title: "Add a viewer",
			context: "Their Matrix user ID, like @name:server. They see nothing until you share a project with them.",
			cta: "Add",
			onSubmit: async (text) => {
				if (!/^@[^:\s]+:\S+$/.test(text)) throw new Error("That isn't a Matrix user ID (@name:server).");
				await bus.setRoles(rolesAfter(roles, { user: text, level: "viewer" }));
			},
		}).open(),
	);

	// The agents room's power levels, as the bus expects them; bots can't set these, so the owner does.
	const target = levelsFor(pl, me, bots, roles.collaborators);
	const changes = levelChanges(pl, target);
	const lv = group(box, "Room levels");
	if (!changes.length) {
		el("div", { cls: "co-line is-muted", text: "The agents room's levels are as the bus expects." }, lv);
		return;
	}
	el("div", { cls: "co-line", text: "The bus expects these changes (bots can't make them; you can):" }, lv);
	el("pre", { cls: "co-diff", text: changes.join("\n") }, lv);
	button(lv, "Update room levels", () =>
		new ConfirmModal(ctx.plugin.app, {
			title: "Update the agents room's levels?",
			body: `This changes who may post what in the agents room:\n${changes.join("\n")}`,
			cta: "Update",
			onYes: () => run(bus.updateLevels(pl, me, bots, roles.collaborators), "Room levels updated"),
		}).open(),
	{ cta: true });
}
