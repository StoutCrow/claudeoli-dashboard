import { emptyState } from "../common.ts";
import type { SectionCtx } from "../view.ts";

export function renderClaims(box: HTMLElement, ctx: SectionCtx) {
	if (ctx.conn.kind !== "ok") {
		emptyState(box, "Claims are live only", "Sign in on this device to see live activity: file claims come from the agents room.", {
			label: "Sign in",
			onClick: () => ctx.plugin.openSignIn(),
		});
		return;
	}
	emptyState(box, "No claims right now", "When a session claims a file, it shows here with its holder and expiry.");
}
