import { age, clock } from "../../core/time.ts";
import { emptyState, row } from "../common.ts";
import type { SectionCtx } from "../view.ts";

/** "in 3 h" or "2 h ago". */
export const until = (t: number, now: number) => (t >= now ? `in ${age(t - now)}` : `${age(now - t)} ago`);

export function liveOnly(box: HTMLElement, ctx: SectionCtx, what: string): boolean {
	if (ctx.live) return false;
	const c = ctx.conn;
	if (c.kind === "offline") emptyState(box, `${ctx.plugin.device().serverLabel} offline since ${clock(c.since)}`, `${what} come from the agents room, so they show again when it answers.`);
	else if (c.kind === "connecting") emptyState(box, "Connecting…", `${what} come from the agents room.`);
	else emptyState(box, `${what} are live only`, "Sign in on this device to see live activity from the agents room.", { label: "Sign in", onClick: () => ctx.plugin.openSignIn() });
	return true;
}

export function renderClaims(box: HTMLElement, ctx: SectionCtx) {
	if (liveOnly(box, ctx, "Claims")) return;
	const claims = [...ctx.live!.claims].sort((a, b) => a.expires - b.expires);
	if (!claims.length) {
		emptyState(box, "No claims right now", "When a session claims a file, it shows here with its holder and expiry.");
		return;
	}
	for (const c of claims) {
		const expired = c.expires < ctx.now;
		row(box, {
			kind: expired ? "Expired" : "Claimed",
			who: c.holder,
			title: c.key,
			detail: [c.holder, c.note, `expires ${until(c.expires, ctx.now)}`].filter(Boolean).join(" · "),
			source: "live",
			now: ctx.now,
			actions: ctx.actions?.claim(c),
		});
	}
}
