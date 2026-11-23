// A fake homeserver for the harness: answers the dashboard's Matrix calls from sample data.
import { setRequestUrl } from "obsidian";

export function installFakeServer(mode: string) {
	setRequestUrl(async (r) => {
		if (mode === "offline") throw new Error("net::ERR_CONNECTION_TIMED_OUT");
		if (mode === "rejected") return { status: 401, json: { errcode: "M_UNKNOWN_TOKEN", error: "Invalid access token" } };
		const u = new URL(r.url);
		if (u.pathname.endsWith("/sync")) {
			// A long-poll that has nothing new waits before answering.
			if (u.searchParams.get("since")) await new Promise((res) => window.setTimeout(res, 30_000));
			return { status: 200, json: { next_batch: "s1", rooms: { join: {} } } };
		}
		return { status: 200, json: {} };
	});
}
