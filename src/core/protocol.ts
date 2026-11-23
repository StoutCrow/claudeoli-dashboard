// The agent bus's message format, mirrored from the bus repo's src/shared/protocol.ts.
// Copied, not shared: test/protocol-pin.test.ts pins the same list in both repos. Pure.
import type { MatrixEvent } from "../live/matrix.ts";

export type { MatrixEvent };

export const CONTENT_KEY = "org.claudeoli.v1";
export const CLAIM_TYPE = "org.claudeoli.claim";
export const PRESENCE_TYPE = "org.claudeoli.presence";
export const DECISION_TYPE = "org.claudeoli.decision";
export const ROLES_TYPE = "org.claudeoli.roles";
export const KINDS = ["chat", "ask", "answer", "handoff", "claim", "release", "status"] as const;
export const STATES = ["pending", "accepted", "approved", "refused", "picked-up", "done", "dropped", "expired"] as const;
export const PROTOCOL_V = 2;
/** A handoff with no decision after this long is expired (the bus's delivery window). */
export const HANDOFF_WINDOW_MS = 7 * 86400_000;
export const MAX_TEXT_BYTES = 4096;
/** The address the owner has on the bus. */
export const OWNER_ADDRESS = "oli";

export type Kind = (typeof KINDS)[number];
export type State = (typeof STATES)[number];

export const PROTOCOL_PIN = {
	types: [CONTENT_KEY, CLAIM_TYPE, PRESENCE_TYPE, DECISION_TYPE, ROLES_TYPE],
	kinds: [...KINDS],
	states: [...STATES],
	v: PROTOCOL_V,
};

export interface BusMessage {
	/** Matrix event id */
	id: string;
	/** origin_server_ts */
	ts: number;
	/** Matrix user id */
	sender: string;
	/** session name, a PC, or "oli" */
	from: string;
	to: string;
	kind: Kind;
	thread: string;
	text: string;
	/** For kind "status": the handoff it is about, and its new state. */
	ref?: string;
	state?: State;
}

export interface Decision {
	v: 2;
	decision: "approve" | "refuse";
	/** The handoff's event id. */
	ref: string;
	/** The session the handoff is for. */
	target: string;
}

const ADDRESS = /^(all|oli|[a-z0-9-]+|[a-z0-9-]+\/[a-z0-9._-]+)$/;
const SESSION = /^[a-z0-9-]+\/[a-z0-9._-]+$/;
const PC = /^[a-z0-9-]+$/;

export const isAddress = (s: string) => ADDRESS.test(s);
export const isSessionName = (s: string) => SESSION.test(s);
export const isPcName = (s: string) => PC.test(s) && s !== "all" && s !== OWNER_ADDRESS;

export function pcOf(name: string): string {
	const i = name.indexOf("/");
	return i < 0 ? name : name.slice(0, i);
}

/** Strips the "-<digits>" suffix the bot adds for a second session in the same folder. */
export function baseOf(name: string): string {
	if (!name.includes("/")) return name;
	return name.replace(/-\d+$/, "");
}

/** The PC a bot account belongs to, or null if the sender is not one of the bus's bots. */
export function botPc(sender: string, serverName: string): string | null {
	const m = /^@claudeoli-([a-z0-9-]+):(.+)$/.exec(sender);
	if (!m || m[2] !== serverName) return null;
	return m[1];
}

export const serverOf = (userId: string) => userId.slice(userId.indexOf(":") + 1);

export function formatBody(from: string, to: string, text: string): string {
	return `${from} → ${to}: ${text}`;
}

/** Null when the text can be sent, else why not (the bus's own limit and wording). */
export function checkText(text: string): string | null {
	if (!text) return "text is empty";
	const bytes = new TextEncoder().encode(text).length;
	if (bytes > MAX_TEXT_BYTES) return `text is ${bytes} bytes; the limit is ${MAX_TEXT_BYTES}. Put long content in a vault note and send a link.`;
	return null;
}

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");

export const newThreadId = () => "t-" + hex(4);
export const newTxnId = () => "co-" + hex(8);

export const toKind = (k: unknown): Kind => ((KINDS as readonly unknown[]).includes(k) ? (k as Kind) : "chat");
export const isState = (s: unknown): s is State => (STATES as readonly unknown[]).includes(s);
