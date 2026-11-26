// A fake homeserver for the harness: answers the dashboard's Matrix calls from sample data.
// Every name is made up. Sent events are echoed back on the next sync, so actions can be tried.
import { setRequestUrl } from "obsidian";

const OWNER = "@owner:example.org";
const bot = (pc: string) => `@claudeoli-${pc}:example.org`;
const KEY = "org.claudeoli.v1";

let n = 0;
const ago = (ms: number) => Date.now() - ms;
type Ev = { type: string; sender: string; content: Record<string, unknown>; state_key?: string; event_id?: string; origin_server_ts?: number };
const ev = (e: Ev) => ({ event_id: `$fake${++n}`, origin_server_ts: Date.now(), ...e });
const msg = (pc: string, from: string, to: string, kind: string, text: string, thread: string, at: number, extra: Record<string, unknown> = {}) =>
	ev({ type: "m.room.message", sender: bot(pc), origin_server_ts: at, content: { msgtype: "m.text", body: `${from} → ${to}: ${text}`, [KEY]: { v: 2, from, to, kind, thread, text, ...extra } } });

function sample() {
	const state = [
		ev({ type: "org.claudeoli.presence", sender: bot("pc-a"), state_key: "pc-a", content: { v: 2, version: 2, sessions: ["pc-a/project-x", "pc-a/project-y"], seen: ago(20_000) } }),
		ev({ type: "org.claudeoli.presence", sender: bot("pc-b"), state_key: "pc-b", content: { v: 2, version: 2, sessions: ["pc-b/setup"], seen: ago(70_000) } }),
		ev({ type: "org.claudeoli.presence", sender: bot("pc-c"), state_key: "pc-c", content: { v: 1, sessions: [], seen: ago(3 * 3600_000) } }),
		ev({ type: "org.claudeoli.claim", sender: bot("pc-a"), state_key: "project-x:src/main.ts", content: { v: 1, holder: "pc-a/project-x", note: "2.0 changelog", expires: Date.now() + 3 * 3600_000 } }),
		ev({ type: "org.claudeoli.claim", sender: bot("pc-b"), state_key: "project-y:src/sync.ts", content: { v: 1, holder: "pc-b/setup", note: "retry loop", expires: ago(40 * 60_000) } }),
		// A room made before the levels change: everyone at 50, so People offers "Update room levels".
		ev({ type: "m.room.power_levels", sender: OWNER, state_key: "", content: { users: { [OWNER]: 100, [bot("pc-a")]: 50, [bot("pc-b")]: 50 }, users_default: 50, events: { "org.claudeoli.claim": 50, "org.claudeoli.presence": 50 } } }),
		ev({ type: "org.claudeoli.roles", sender: OWNER, state_key: "", content: { v: 2, collaborators: false, projects: {}, users: { "@viewer:example.org": { level: "viewer", projects: [], pcs: ["pc-d"] } } } }),
		// A forged claim (pc-a's bot holding for pc-b): the dashboard must not show it.
		ev({ type: "org.claudeoli.claim", sender: bot("pc-a"), state_key: "project-y:README.md", content: { v: 1, holder: "pc-b/setup", expires: Date.now() + 3600_000 } }),
	];
	const handoff = msg("pc-b", "pc-b/project-x", "pc-a/project-x", "handoff", "Finish the 2.0 changelog", "t-h1", ago(12 * 60_000));
	const approved = msg("pc-b", "pc-b/setup", "pc-a/project-y", "handoff", "Run the sync tests on pc-a", "t-h2", ago(50 * 60_000));
	const toOld = msg("pc-a", "pc-a/project-x", "pc-c/server", "handoff", "Restart the chat server after the update", "t-h3", ago(30 * 60_000));
	const timeline = [
		handoff,
		approved,
		toOld,
		msg("pc-a", "pc-a", "pc-b/setup", "status", "approved", "t-h2", ago(45 * 60_000), { ref: approved.event_id, state: "approved" }),
		msg("pc-c", "pc-c/server", "oli", "ask", "Restart the chat server now?", "t-a1", ago(3 * 60_000)),
		msg("pc-a", "pc-a/project-y", "oli", "chat", "Tests pass: 42. Ready to push when you say.", "t-c1", ago(25 * 60_000)),
		ev({ type: "m.room.message", sender: OWNER, origin_server_ts: ago(20 * 60_000), content: { msgtype: "m.text", body: "pc-a/project-y: thanks, push it", [KEY]: { v: 2, from: "oli", to: "pc-a/project-y", kind: "chat", thread: "t-c1", text: "thanks, push it" } } }),
	];
	return { state, timeline };
}

export function installFakeServer(mode: string) {
	const sent: ReturnType<typeof ev>[] = [];
	setRequestUrl(async (r) => {
		if (mode === "offline") throw new Error("net::ERR_CONNECTION_TIMED_OUT");
		if (mode === "rejected") return { status: 401, json: { errcode: "M_UNKNOWN_TOKEN", error: "Invalid access token" } };
		const u = new URL(r.url);
		const room = "!agents:example.org";
		if (u.pathname.endsWith("/sync")) {
			if (!u.searchParams.get("since")) {
				const s = sample();
				return { status: 200, json: { next_batch: "s1", rooms: { join: { [room]: { state: { events: s.state }, timeline: { events: s.timeline } } } } } };
			}
			// A long-poll answers at once when something was sent, else after a while.
			for (let i = 0; i < 30 && !sent.length; i++) await new Promise((res) => window.setTimeout(res, 1000));
			const out = sent.splice(0);
			return { status: 200, json: { next_batch: `s${++n}`, rooms: { join: out.length ? { [room]: { timeline: { events: out.filter((e) => e.state_key === undefined) }, state: { events: out.filter((e) => e.state_key !== undefined) } } } : {} } } };
		}
		const m = /\/rooms\/[^/]+\/(send|state)\/([^/]+)\/([^/]*)$/.exec(u.pathname);
		if (m && r.method === "PUT") {
			const content = JSON.parse(r.body ?? "{}") as Record<string, unknown>;
			const e = ev({ type: decodeURIComponent(m[2]), sender: OWNER, content, ...(m[1] === "state" ? { state_key: decodeURIComponent(m[3]) } : {}) });
			sent.push(e);
			console.log("sent", e.type, JSON.stringify(content));
			// The bot on the target PC answers a decision with a status, as the real one would.
			if (e.type === "org.claudeoli.decision") {
				const ref = String(content.ref);
				const state = content.decision === "approve" ? "approved" : "refused";
				window.setTimeout(() => sent.push(msg("pc-a", "pc-a", "pc-b/project-x", "status", state, "t-h1", Date.now(), { ref, state })), 1500);
			}
			return { status: 200, json: { event_id: e.event_id } };
		}
		return { status: 200, json: {} };
	});
}
