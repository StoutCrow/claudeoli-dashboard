// One /sync long-poll for the agents room while the dashboard is open, and none while it's closed.
import { applySync, emptyLive, type LiveCtx, type LiveState } from "../core/live.ts";
import { CLAIM_TYPE, DECISION_TYPE, PRESENCE_TYPE, ROLES_TYPE } from "../core/protocol.ts";
import type { ConnState } from "./conn.ts";
import { MatrixError, type Matrix } from "./matrix.ts";

export const LONG_POLL_MS = 30_000;
const FIRST_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

const STATE_TYPES = [CLAIM_TYPE, PRESENCE_TYPE, ROLES_TYPE, "m.room.power_levels", "m.room.member"];

/**
 * The first sync gets current state in its state block, so its timeline asks for messages and decisions only:
 * otherwise a day of presence updates fills the 100 events and pushes every message out. Later syncs also list
 * the state types, because a state change inside a sync window arrives in the timeline.
 */
export function syncFilter(roomId: string, first = false): object {
	return {
		room: {
			rooms: [roomId],
			timeline: { limit: 100, types: first ? ["m.room.message", DECISION_TYPE] : ["m.room.message", DECISION_TYPE, ...STATE_TYPES] },
			state: { types: STATE_TYPES },
			ephemeral: { types: [] },
			account_data: { types: [] },
		},
		presence: { types: [] },
		account_data: { types: [] },
	};
}

export interface SyncLoopOptions {
	matrix: Pick<Matrix, "sync"> & Partial<Pick<Matrix, "getState">>;
	roomId: string;
	ctx: LiveCtx;
	onChange: (s: LiveState, c: ConnState) => void;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}

export class SyncLoop {
	state: LiveState = emptyLive();
	conn: ConnState = { kind: "connecting" };
	private o: SyncLoopOptions;
	private now: () => number;
	/** Bumped by stop(): requestUrl can't be aborted, so an answer from an older generation is dropped. */
	private gen = 0;
	private paused = false;
	private wake: (() => void) | undefined;
	private cancelSleep: (() => void) | undefined;

	constructor(o: SyncLoopOptions) {
		this.o = o;
		this.now = o.now ?? Date.now;
	}

	start() {
		void this.run(++this.gen);
	}

	stop() {
		this.gen++;
		this.cancelSleep?.();
		this.wakeUp();
	}

	/** Hidden (phone app in the background): finish the request in flight, then wait. */
	pause(hidden: boolean) {
		this.paused = hidden;
		if (!hidden) this.wakeUp();
	}

	private wakeUp() {
		const w = this.wake;
		this.wake = undefined;
		w?.();
	}

	private waitOrWake(ms?: number): Promise<void> {
		const woken = new Promise<void>((r) => (this.wake = r));
		if (ms === undefined) return woken;
		const slept = this.o.sleep
			? this.o.sleep(ms)
			: new Promise<void>((r) => {
					const id = window.setTimeout(r, ms);
					this.cancelSleep = () => window.clearTimeout(id);
				});
		return Promise.race([woken, slept]);
	}

	private set(c: ConnState, g: number) {
		if (g !== this.gen) return;
		this.conn = c;
		this.o.onChange(this.state, c);
	}

	private async run(g: number) {
		const { roomId, matrix } = this.o;
		let since: string | undefined;
		let backoff = FIRST_BACKOFF_MS;
		let offlineSince: number | undefined;
		while (g === this.gen) {
			if (this.paused) {
				await this.waitOrWake();
				continue;
			}
			try {
				const r = await matrix.sync(since, since ? LONG_POLL_MS : 0, syncFilter(roomId, !since));
				if (g !== this.gen) return;
				const room = r.rooms?.join?.[roomId];
				let events = [...(room?.state?.events ?? []), ...(room?.timeline?.events ?? [])];
				if (!since && matrix.getState) {
					// The state block is the state at the start of the timeline, and the first timeline holds messages
					// only, so a later state change would be missed: apply the room's current state last.
					const current = await matrix.getState(roomId);
					if (g !== this.gen) return;
					events = [...events, ...current.filter((e) => e.state_key !== undefined)];
				}
				if (events.length) this.state = applySync(this.state, events, this.o.ctx);
				since = r.next_batch;
				backoff = FIRST_BACKOFF_MS;
				offlineSince = undefined;
				this.set({ kind: "ok", at: this.now() }, g);
			} catch (e) {
				if (g !== this.gen) return;
				if (e instanceof MatrixError && (e.status === 401 || e.errcode === "M_UNKNOWN_TOKEN")) {
					this.set({ kind: "token-rejected" }, g);
					return;
				}
				offlineSince ??= this.now();
				this.set({ kind: "offline", since: offlineSince, retryIn: backoff }, g);
				await this.waitOrWake(backoff);
				backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
			}
		}
	}
}
