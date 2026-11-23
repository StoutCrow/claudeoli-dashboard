// The live layer: the agents room's state and timeline, read with the bots' own sender rules,
// so a room member can't make the dashboard show a forged claim, presence, status or decision. Pure.
import { asObj, asStr, type Json, type MatrixEvent } from "../live/matrix.ts";
import {
	CLAIM_TYPE, CONTENT_KEY, DECISION_TYPE, HANDOFF_WINDOW_MS, OWNER_ADDRESS, PRESENCE_TYPE, ROLES_TYPE,
	botPc, isAddress, isPcName, isSessionName, isState, pcOf, toKind, type BusMessage, type State,
} from "./protocol.ts";

export interface Presence {
	pc: string;
	sessions: string[];
	seen: number;
	version: number;
}

export interface Claim {
	key: string;
	holder: string;
	note: string;
	expires: number;
}

export interface StatusMark {
	state: State;
	ts: number;
	id: string;
}

export interface LiveState {
	presence: Record<string, Presence>;
	claims: Claim[];
	/** Bus messages, oldest first; statuses are kept apart in `statuses`. */
	messages: BusMessage[];
	/** Latest status per handoff event id. */
	statuses: Record<string, StatusMark>;
	/** The owner's decisions per handoff event id. */
	decisions: Record<string, { decision: string; ts: number }>;
	/** org.claudeoli.roles content as sent (parsed by core/levels.ts). */
	roles: unknown;
	powerLevels: Json | null;
}

export interface LiveCtx {
	ownerId: string;
	serverName: string;
}

export const MAX_MESSAGES = 500;

export function emptyLive(): LiveState {
	return { presence: {}, claims: [], messages: [], statuses: {}, decisions: {}, roles: null, powerLevels: null };
}

/** Whether status `b` is newer than `a`: by server time, then by event id, the same rule as the bots. */
export const newer = (a: StatusMark | undefined, b: StatusMark) => !a || b.ts > a.ts || (b.ts === a.ts && b.id > a.id);

function ownerMessage(ev: MatrixEvent, s: LiveState): BusMessage | null {
	const base = { id: ev.event_id, ts: ev.origin_server_ts, sender: ev.sender };
	const b = ev.content[CONTENT_KEY];
	if (b && typeof b === "object") {
		const o = asObj(b);
		const to = asStr(o.to);
		const thread = asStr(o.thread);
		const text = asStr(o.text);
		const kind = toKind(o.kind);
		if (o.from !== OWNER_ADDRESS || !to || !isAddress(to) || !thread || text === undefined || (kind !== "chat" && kind !== "answer")) return null;
		return { ...base, from: OWNER_ADDRESS, to, kind, thread, text };
	}
	const body = asStr(ev.content.body);
	if (!body) return null;
	const m = /^\s*([A-Za-z0-9._/-]+):\s*([\s\S]*)$/.exec(body);
	if (!m) return null;
	const to = m[1].toLowerCase();
	const text = m[2].trim();
	if (!text || to === OWNER_ADDRESS || !isAddress(to) || !(to === "all" || isSessionName(to) || (isPcName(to) && to in s.presence))) return null;
	const replyTo = asStr(asObj(asObj(ev.content["m.relates_to"])["m.in_reply_to"]).event_id);
	const prior = replyTo ? s.messages.find((x) => x.id === replyTo) : undefined;
	return { ...base, from: OWNER_ADDRESS, to, kind: "chat", thread: prior?.thread ?? `t-${ev.event_id}`, text };
}

function botMessage(ev: MatrixEvent, pc: string): BusMessage | null {
	const o = asObj(ev.content[CONTENT_KEY]);
	const from = asStr(o.from);
	const to = asStr(o.to);
	const thread = asStr(o.thread);
	const text = asStr(o.text);
	if (!from || !to || !thread || text === undefined || !isAddress(to)) return null;
	if (!(from === pc || (isSessionName(from) && pcOf(from) === pc))) return null;
	const m: BusMessage = { id: ev.event_id, ts: ev.origin_server_ts, sender: ev.sender, from, to, kind: toKind(o.kind), thread, text };
	if (m.kind === "status") {
		const ref = asStr(o.ref);
		if (!ref || !isState(o.state)) return null;
		m.ref = ref;
		m.state = o.state;
	}
	return m;
}

export function applySync(prev: LiveState, events: MatrixEvent[], ctx: LiveCtx): LiveState {
	const s: LiveState = { ...prev, presence: { ...prev.presence }, claims: [...prev.claims], messages: [...prev.messages], statuses: { ...prev.statuses }, decisions: { ...prev.decisions } };
	const seen = new Set(s.messages.map((m) => m.id));
	for (const ev of events) {
		if (!ev || typeof ev.type !== "string" || typeof ev.sender !== "string") continue;
		ev.content = asObj(ev.content);
		const pc = botPc(ev.sender, ctx.serverName);
		const isOwner = ev.sender === ctx.ownerId;
		if (ev.state_key !== undefined) {
			const key = ev.state_key;
			if (ev.type === PRESENCE_TYPE) {
				if (!pc || pc !== key) continue;
				const c = ev.content;
				const sessions = Array.isArray(c.sessions) ? c.sessions.filter((x): x is string => typeof x === "string") : [];
				s.presence[key] = { pc: key, sessions, seen: Number(c.seen ?? ev.origin_server_ts) || ev.origin_server_ts, version: Number(c.version ?? 1) || 1 };
			} else if (ev.type === CLAIM_TYPE) {
				const holder = asStr(ev.content.holder);
				const current = s.claims.find((c) => c.key === key);
				if (holder) {
					if (!pc || pcOf(holder) !== pc) continue;
					s.claims = s.claims.filter((c) => c.key !== key);
					s.claims.push({ key, holder, note: asStr(ev.content.note) ?? "", expires: Number(ev.content.expires ?? 0) });
				} else if (current && (isOwner || (pc !== null && pcOf(current.holder) === pc))) {
					s.claims = s.claims.filter((c) => c.key !== key);
				}
			} else if (ev.type === ROLES_TYPE && key === "" && isOwner) {
				s.roles = ev.content;
			} else if (ev.type === "m.room.power_levels" && key === "") {
				s.powerLevels = ev.content;
			}
			continue;
		}
		if (ev.type === DECISION_TYPE) {
			const ref = asStr(ev.content.ref);
			const decision = asStr(ev.content.decision);
			if (isOwner && ref && (decision === "approve" || decision === "refuse")) s.decisions[ref] = { decision, ts: ev.origin_server_ts };
			continue;
		}
		if (ev.type !== "m.room.message" || seen.has(ev.event_id)) continue;
		const m = pc ? botMessage(ev, pc) : isOwner ? ownerMessage(ev, s) : null;
		if (!m) continue;
		seen.add(m.id);
		if (m.kind === "status") {
			const mark = { state: m.state!, ts: m.ts, id: m.id };
			if (newer(s.statuses[m.ref!], mark)) s.statuses[m.ref!] = mark;
			continue;
		}
		s.messages.push(m);
	}
	if (s.messages.length > MAX_MESSAGES) s.messages = s.messages.slice(-MAX_MESSAGES);
	return s;
}

/** Where a handoff stands: its latest status, else expired after the window, else pending. */
export function handoffState(s: LiveState, handoffId: string, now: number): State {
	const st = s.statuses[handoffId];
	if (st) return st.state;
	const h = s.messages.find((m) => m.id === handoffId);
	if (h && now - h.ts > HANDOFF_WINDOW_MS) return "expired";
	return "pending";
}
