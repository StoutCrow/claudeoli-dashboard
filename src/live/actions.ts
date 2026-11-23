// What the owner can do on the bus from the dashboard. Every action is an event sent from the owner's
// own account on this device; the bots check it (sender, level, the handoff's state), not the plugin.
import type { Claim } from "../core/live.ts";
import {
	CLAIM_TYPE, CONTENT_KEY, DECISION_TYPE, OWNER_ADDRESS, PROTOCOL_V, checkText, isAddress, newThreadId, newTxnId,
	type BusMessage, type Decision,
} from "../core/protocol.ts";
import type { Matrix } from "./matrix.ts";

const SUMMARY_CHARS = 80;

export class BusActions {
	private matrix: Pick<Matrix, "send" | "putState">;
	private roomId: string;
	private ownerLabel: string;
	/** Keys of actions in flight, so a double click sends once. */
	private busy = new Set<string>();

	constructor(matrix: Pick<Matrix, "send" | "putState">, roomId: string, ownerLabel: string) {
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
			await this.matrix.send(this.roomId, "m.room.message", { msgtype: "m.text", body: `${this.ownerLabel} ${verb}: ${h.text.slice(0, SUMMARY_CHARS)}` }, newTxnId());
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
