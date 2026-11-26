import { Notice, type App } from "obsidian";
import { decisionsEnabled, type NeedsItem } from "../core/needs.ts";
import { handoffState, type Claim, type LiveState } from "../core/live.ts";
import type { BusMessage } from "../core/protocol.ts";
import type { BusActions } from "../live/actions.ts";
import { button, el } from "./common.ts";
import { ConfirmModal, TextModal } from "./modals.ts";
import type { ActionUI } from "./view.ts";

export interface ActionDeps {
	app: App;
	bus: BusActions | null;
	live: LiveState | null;
	now: number;
	/** Handoff ids decided from here whose status hasn't arrived yet. */
	sent: Set<string>;
	redraw: () => void;
	/** Vault actions (Task 17), by the need's kind. */
	vault?: (i: NeedsItem) => ((box: HTMLElement) => void) | undefined;
}

const fail = (e: unknown) => new Notice(`Not sent: ${(e as Error).message}`);

export function makeActionUI(d: ActionDeps): ActionUI {
	const { bus, live } = d;

	const handoff = (m: BusMessage) => (box: HTMLElement) => {
		if (!bus || !live) return;
		const state = handoffState(live, m.id, d.now);
		if (state !== "pending") {
			el("span", { cls: "co-note", text: "Already decided" }, box);
			return;
		}
		if (d.sent.has(m.id) || bus.isBusy(`decide:${m.id}`)) {
			el("span", { cls: "co-note", text: "Sent, waiting for the bot" }, box);
			return;
		}
		if (!decisionsEnabled(live, m)) {
			el("span", { cls: "co-note", text: "Bots too old to accept approvals", attr: { title: `The bot on ${m.to.split("/")[0]} must speak protocol v2. Answer in that session's own chat instead.` } }, box);
			return;
		}
		const act = (approve: boolean) => {
			d.sent.add(m.id);
			d.redraw();
			(approve ? bus.approve(m) : bus.refuse(m)).catch((e) => {
				d.sent.delete(m.id);
				fail(e);
				d.redraw();
			});
		};
		button(box, "Approve", () => act(true), { cta: true, title: `Approve: ${m.from} hands "${m.text}" to ${m.to}` });
		button(box, "Refuse", () => act(false));
	};

	const reply = (m: BusMessage) => (box: HTMLElement) => {
		if (!bus) return;
		button(box, "Reply…", () =>
			new TextModal(d.app, {
				title: `Reply to ${m.from}`,
				context: m.text,
				cta: "Send",
				onSubmit: (text) => bus.reply(m, text),
			}).open(),
		);
	};

	const claim = (c: Claim) => (box: HTMLElement) => {
		if (!bus) return;
		button(box, "Release", () =>
			new ConfirmModal(d.app, {
				title: "Release this claim?",
				body: `Release ${c.key}, held by ${c.holder}? Its session is told at its next bus read. It can claim the file again.`,
				cta: "Release",
				warning: true,
				onYes: () => bus.release(c),
			}).open(),
		);
	};

	return {
		handoff,
		reply,
		claim,
		need(i: NeedsItem) {
			if (i.source === "vault") return d.vault?.(i);
			if (!live) return undefined;
			if (i.action === "approve-refuse" || i.action === "reply") {
				const m = live.messages.find((x) => x.id === i.ref);
				return m ? (i.action === "reply" ? reply(m) : handoff(m)) : undefined;
			}
			if (i.action === "release") {
				const c = live.claims.find((x) => x.key === i.ref);
				return c ? claim(c) : undefined;
			}
			return undefined;
		},
		newMessage(box: HTMLElement) {
			if (!bus || !live) return;
			const addresses: [string, string][] = [];
			for (const p of Object.values(live.presence).sort((a, b) => a.pc.localeCompare(b.pc))) {
				for (const s of p.sessions) addresses.push([s, s]);
				addresses.push([p.pc, `${p.pc} (every session on it)`]);
			}
			addresses.push(["all", "all (every session)"]);
			button(box, "New message", () =>
				new TextModal(d.app, { title: "New bus message", cta: "Send", addresses, onSubmit: (text, to) => bus.send(to ?? "all", text) }).open(),
			{ cta: true });
		},
	};
}
