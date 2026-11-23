import { emptyState } from "../common.ts";
import type { SectionCtx } from "../view.ts";

export function renderPeople(box: HTMLElement, ctx: SectionCtx) {
	emptyState(box, "People come from the agents room", "Everyone's level and the projects shared with them live in the room, so the server and the bots enforce them. Sign in on this device to see them.", ctx.conn.kind === "ok" ? undefined : {
		label: "Sign in",
		onClick: () => ctx.plugin.openSignIn(),
	});
}
