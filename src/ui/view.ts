import { ItemView, TFile, type WorkspaceLeaf } from "obsidian";
import type ClaudeOliPlugin from "../main.ts";
import type { VaultRead } from "../main.ts";
import type { ConnState } from "../live/conn.ts";
import { needsFromLive, needsFromVault, type NeedsItem } from "../core/needs.ts";
import type { Claim, LiveState } from "../core/live.ts";
import { serverOf, type BusMessage } from "../core/protocol.ts";
import { Matrix } from "../live/matrix.ts";
import { httpObsidian } from "../live/http.ts";
import { SyncLoop } from "../live/loop.ts";
import { age, clock } from "../core/time.ts";
import { button, dropdown, el } from "./common.ts";
import { renderNeeds } from "./sections/needs.ts";
import { renderSessions } from "./sections/sessions.ts";
import { renderDevices } from "./sections/devices.ts";
import { renderClaims } from "./sections/claims.ts";
import { renderWork } from "./sections/work.ts";
import { renderMessages } from "./sections/messages.ts";
import { renderPeople } from "./sections/people.ts";
import { renderSettings } from "./settings-tab.ts";

export const VIEW_TYPE = "claudeoli-dashboard";

export type SectionId = "needs" | "sessions" | "devices" | "claims" | "work" | "messages" | "people" | "settings";

const SECTIONS: [SectionId, string][] = [
	["needs", "Needs you"],
	["sessions", "Sessions"],
	["devices", "Devices"],
	["claims", "Claims"],
	["work", "Work"],
	["messages", "Messages"],
	["people", "People"],
	["settings", "Settings"],
];

/** Buttons a section can put on a row; each returns the row's `actions` builder, or undefined when not offered. */
export interface ActionUI {
	handoff(m: BusMessage): ((box: HTMLElement) => void) | undefined;
	reply(m: BusMessage): ((box: HTMLElement) => void) | undefined;
	claim(c: Claim): ((box: HTMLElement) => void) | undefined;
	need(i: NeedsItem): ((box: HTMLElement) => void) | undefined;
	newMessage(box: HTMLElement): void;
}

/** What every section is drawn from. */
export interface SectionCtx {
	plugin: ClaudeOliPlugin;
	vault: VaultRead;
	/** The agents room, only while the connection is ok (stale data is never shown as live). */
	live: LiveState | null;
	conn: ConnState;
	needs: NeedsItem[];
	/** Null until the actions exist (and for viewers). */
	actions: ActionUI | null;
	now: number;
	/** Per-view UI state that survives a redraw (filters). */
	ui: Record<string, string>;
	openNote(path: string): void;
	go(section: SectionId): void;
	redraw(): void;
}

export class DashboardView extends ItemView {
	private plugin: ClaudeOliPlugin;
	private section: SectionId = "needs";
	private vault: VaultRead | null = null;
	private conn: ConnState = { kind: "signed-out" };
	private live: LiveState | null = null;
	private loop: SyncLoop | null = null;
	private ui: Record<string, string> = {};
	private pendingRead = 0;

	constructor(leaf: WorkspaceLeaf, plugin: ClaudeOliPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE;
	}
	getDisplayText() {
		return "ClaudeOli";
	}
	getIcon() {
		return "layout-dashboard";
	}

	getState(): Record<string, unknown> {
		return { section: this.section };
	}

	async setState(state: unknown, result: Parameters<ItemView["setState"]>[1]) {
		const s = (state ?? {}) as { section?: SectionId };
		if (s.section && SECTIONS.some(([id]) => id === s.section)) this.section = s.section;
		await super.setState(state, result);
		this.render();
	}

	async onOpen() {
		this.contentEl.addClass("co-dash");
		await this.readVault();
		// Ages are repainted once a minute while the dashboard is open; nothing runs while it's closed.
		this.registerInterval(window.setInterval(() => this.render(), 60_000));
		// On a phone in the background, the long-poll waits until the app is back.
		this.registerDomEvent(document, "visibilitychange", () => this.loop?.pause(document.visibilityState === "hidden"));
		this.restartLive();
	}

	async onClose() {
		this.loop?.stop();
		this.loop = null;
		if (this.pendingRead) window.cancelAnimationFrame(this.pendingRead);
		this.contentEl.empty();
	}

	/** A watched note changed: re-read once per frame, however many events arrive. */
	refreshVault() {
		if (this.pendingRead) return;
		this.pendingRead = window.requestAnimationFrame(() => {
			this.pendingRead = 0;
			void this.readVault();
		});
	}

	private async readVault() {
		this.vault = await this.plugin.readVault();
		this.render();
	}

	/** Opened, or the sign-in changed: (re)start the one long-poll. */
	restartLive() {
		this.loop?.stop();
		this.loop = null;
		this.live = null;
		const s = this.plugin.secrets();
		this.conn = s ? { kind: "connecting" } : { kind: "signed-out" };
		if (s) {
			this.loop = new SyncLoop({
				matrix: new Matrix(httpObsidian, s.homeserver, s.token),
				roomId: s.roomId,
				ctx: { ownerId: s.userId, serverName: serverOf(s.userId) },
				onChange: (state, conn) => {
					this.live = state;
					this.conn = conn;
					this.render();
				},
			});
			this.loop.start();
		}
		this.render();
	}

	private ctx(): SectionCtx | null {
		if (!this.vault) return null;
		return {
			plugin: this.plugin,
			vault: this.vault,
			live: this.conn.kind === "ok" ? this.live : null,
			conn: this.conn,
			needs: [...(this.conn.kind === "ok" && this.live ? needsFromLive(this.live, Date.now()) : []), ...needsFromVault(this.vault.model, this.plugin.settings.ownerName)],
			actions: null,
			now: Date.now(),
			ui: this.ui,
			openNote: (path) => this.openNote(path),
			go: (s) => {
				this.section = s;
				this.render();
			},
			redraw: () => this.render(),
		};
	}

	private openNote(path: string) {
		const f = this.app.vault.getFileByPath(path);
		if (f instanceof TFile) void this.app.workspace.getLeaf("tab").openFile(f);
	}

	render() {
		const ctx = this.ctx();
		const root = this.contentEl;
		const scroll = root.querySelector(".co-body")?.scrollTop ?? 0;
		root.empty();
		if (!ctx) {
			el("div", { cls: "co-loading", text: "Reading the vault…" }, root);
			return;
		}
		const nav = el("nav", { cls: "co-nav", attr: { "aria-label": "Sections" } }, root);
		const main = el("div", { cls: "co-main" }, root);
		for (const [id, label] of SECTIONS) {
			const b = el("button", { cls: "co-nav-item" }, nav);
			el("span", { text: label }, b);
			if (id === "needs" && ctx.needs.length) el("span", { cls: "co-count", text: String(ctx.needs.length) }, b);
			b.toggleClass("is-active", id === this.section);
			if (id === this.section) b.setAttribute("aria-current", "page");
			b.addEventListener("click", () => ctx.go(id));
		}

		const head = el("div", { cls: "co-head" }, main);
		// On a narrow pane the section list folds into this picker (CSS decides which shows).
		const picker = dropdown(head, SECTIONS.map(([id, label]) => [id, id === "needs" && ctx.needs.length ? `${label} (${ctx.needs.length})` : label]), this.section, (v) => ctx.go(v as SectionId), "Section");
		picker.addClass("co-picker");
		el("h2", { cls: "co-title", text: SECTIONS.find(([id]) => id === this.section)![1] }, head);
		el("div", { cls: "co-status", text: `${liveStatus(ctx.conn, ctx.now)} · vault: read ${age(ctx.now - ctx.vault.at)} ago` }, head);

		this.banner(main, ctx);
		const body = el("div", { cls: "co-body" }, main);
		const draw: Record<SectionId, (box: HTMLElement, c: SectionCtx) => void> = {
			needs: renderNeeds,
			sessions: renderSessions,
			devices: renderDevices,
			claims: renderClaims,
			work: renderWork,
			messages: renderMessages,
			people: renderPeople,
			settings: (box, c) => renderSettings(el("div", { cls: "co-settings" }, box), c.plugin, () => this.render()),
		};
		draw[this.section](body, ctx);
		body.scrollTop = scroll;
	}

	private banner(main: HTMLElement, ctx: SectionCtx) {
		const c = ctx.conn;
		if (c.kind === "ok" || c.kind === "connecting") return;
		const b = el("div", { cls: "co-banner", attr: { role: "status" } }, main);
		if (c.kind === "signed-out") {
			el("span", { text: "Not signed in on this device. Showing the vault only." }, b);
			button(b, "Sign in", () => this.plugin.openSignIn());
		} else if (c.kind === "token-rejected") {
			el("span", { text: "Signed out on this device (the server no longer accepts its sign-in). Showing the vault only." }, b);
			button(b, "Sign in", () => this.plugin.openSignIn());
		} else {
			el("span", { text: `${this.plugin.device().serverLabel} offline since ${clock(c.since)}. Showing the vault only.` }, b);
		}
	}
}

export function liveStatus(c: ConnState, now: number): string {
	switch (c.kind) {
		case "ok":
			return "live: ok";
		case "connecting":
			return "live: connecting";
		case "offline":
			return `live: offline ${age(now - c.since)}`;
		case "token-rejected":
			return "live: signed out";
		default:
			return "live: not signed in";
	}
}
