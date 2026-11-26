// What the owner can do on the bus from the dashboard. Every action is an event sent from the owner's
// own account on this device; the bots check it (sender, level, the handoff's state), not the plugin.
import type { Claim } from "../core/live.ts";
import type { Roles } from "../core/levels.ts";
import { levelsFor, projectRoomBody, rolesAfter, type Levels } from "../core/rooms.ts";
import {
	CLAIM_TYPE, CONTENT_KEY, DECISION_TYPE, OWNER_ADDRESS, ROLES_TYPE, PROTOCOL_V, checkText, isAddress, newThreadId, newTxnId,
	type BusMessage, type Decision,
} from "../core/protocol.ts";
import type { Matrix } from "./matrix.ts";

const SUMMARY_CHARS = 80;

type Ops = Pick<Matrix, "send" | "putState"> & Partial<Pick<Matrix, "createRoom" | "invite" | "kick">>;

export class BusActions {
	private matrix: Ops;
	private roomId: string;
	private ownerLabel: string;
	/** Keys of actions in flight, so a double click sends once. */
	private busy = new Set<string>();

	constructor(matrix: Ops, roomId: string, ownerLabel: string) {
		this.matrix = matrix;
		this.roomId = roomId;
		this.ownerLabel = ownerLabel || "Owner";
	}

	isBusy(key: string): boolean {
		return this.busy.has(key);
	}

	/** Runs f once per key at a time; a second call while the first runs returns false and sends nothing. */
	private async once(key: string, f: () => Promise<void>): Promise<boolean> {
		if (this.busy.has(key)) return false;
		this.busy.add(key);
		try {
			await f();
			return true;
		} finally {
			this.busy.delete(key);
		}
	}

	approve(h: BusMessage): Promise<boolean> {
		return this.decide(h, "approve");
	}

	refuse(h: BusMessage): Promise<boolean> {
		return this.decide(h, "refuse");
	}

	/** The decision event (what the bots act on), then a plain line so people in other clients can follow. */
	private decide(h: BusMessage, decision: Decision["decision"]): Promise<boolean> {
		return this.once(`decide:${h.id}`, async () => {
			const d: Decision = { v: 2, decision, ref: h.id, target: h.to };
			await this.matrix.send(this.roomId, DECISION_TYPE, d, newTxnId());
			const verb = decision === "approve" ? "approved" : "refused";
			// The decision is sent: the readable line is a courtesy, so failing it doesn't undo or re-offer the decision.
			await this.matrix.send(this.roomId, "m.room.message", { msgtype: "m.text", body: `${this.ownerLabel} ${verb}: ${h.text.slice(0, SUMMARY_CHARS)}` }, newTxnId()).catch(() => undefined);
		});
	}

	/** Clears the claim's state as the owner; the holder's bot tells its session at the next read. */
	release(c: Claim): Promise<boolean> {
		return this.once(`release:${c.key}`, async () => {
			await this.matrix.putState(this.roomId, CLAIM_TYPE, c.key, {});
		});
	}

	/** Answers a message in its thread: an ask gets an answer, anything else a chat. */
	reply(m: BusMessage, text: string): Promise<boolean> {
		return this.message(m.from, text, m.kind === "ask" ? "answer" : "chat", m.thread, m.id);
	}

	/** A new message to a session, a PC or all, in a new thread. */
	send(to: string, text: string): Promise<boolean> {
		return this.message(to, text, "chat", newThreadId());
	}

	// ---- the owner's people operations (People section) ----

	/** Writes the roles; the server refuses it from anyone below power 100. */
	setRoles(roles: Roles): Promise<string> {
		return this.matrix.putState(this.roomId, ROLES_TYPE, "", roles);
	}

	/** Sets the agents room's power levels to what levelsFor says (bots can't; the owner can). */
	updateLevels(pl: Levels, ownerId: string, bots: string[], collaboratorsOn: boolean): Promise<string> {
		return this.matrix.putState(this.roomId, "m.room.power_levels", "", levelsFor(pl, ownerId, bots, collaboratorsOn));
	}

	/** Shares a project with a person: its room is made the first time (inviting the bots and them), then roles record it. */
	async share(roles: Roles, user: string, project: string, ownerId: string, bots: string[]): Promise<Roles> {
		let room = roles.projects[project]?.room;
		const made = !room;
		if (!room) {
			if (!this.matrix.createRoom) throw new Error("can't create rooms");
			room = await this.matrix.createRoom(projectRoomBody(project, ownerId, bots, { [user]: roles.users[user]?.level ?? "viewer" }));
		}
		const next = rolesAfter(roles, { user, share: project });
		next.projects[project] = { room };
		await this.setRoles(next);
		if (!made) await this.matrix.invite?.(room, user);
		return next;
	}

	/** Stops sharing: roles first (so bots stop copying for them), then the person leaves the room. */
	async unshare(roles: Roles, user: string, project: string): Promise<Roles> {
		const next = rolesAfter(roles, { user, unshare: project });
		await this.setRoles(next);
		const room = roles.projects[project]?.room;
		if (room) await this.matrix.kick?.(room, user);
		return next;
	}

	private message(to: string, text: string, kind: "chat" | "answer", thread: string, replyTo?: string): Promise<boolean> {
		const err = checkText(text);
		if (err) return Promise.reject(new Error(err));
		if (!isAddress(to) || to === OWNER_ADDRESS) return Promise.reject(new Error(`"${to}" is not an address (a session pc/folder, a PC, or all)`));
		return this.once(`message:${thread}:${text}`, async () => {
			const content: Record<string, unknown> = {
				msgtype: "m.text",
				// The "to: text" body is also how older bots read the owner's messages.
				body: `${to}: ${text}`,
				[CONTENT_KEY]: { v: PROTOCOL_V, from: OWNER_ADDRESS, to, kind, thread, text },
			};
			if (replyTo) content["m.relates_to"] = { "m.in_reply_to": { event_id: replyTo } };
			await this.matrix.send(this.roomId, "m.room.message", content, newTxnId());
		});
	}
}
