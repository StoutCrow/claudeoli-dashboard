// Small UI helpers, copied in spirit from UniverseView's render/common.ts (prefix `co-` instead of `universeview-`).
import { Notice, setIcon } from "obsidian";
import { age } from "../core/time.ts";

export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	opts: { cls?: string; text?: string; attr?: Record<string, string>; title?: string } = {},
	parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
	const e = createEl(tag);
	if (opts.cls) e.className = opts.cls;
	if (opts.text !== undefined) e.textContent = opts.text;
	if (opts.title) e.setAttribute("aria-label", opts.title);
	for (const [k, v] of Object.entries(opts.attr ?? {})) e.setAttribute(k, v);
	parent?.appendChild(e);
	return e;
}

/** Lucide renamed several icons; Obsidian versions ship different sets, so try older names too. */
const ICON_FALLBACKS: Record<string, string[]> = {
	"layout-dashboard": ["layout-grid", "layout"],
	"circle-check": ["check-circle"],
	"triangle-alert": ["alert-triangle"],
	"messages-square": ["message-square"],
	"refresh-cw": ["rotate-cw"],
	"square-pen": ["pencil", "edit"],
};

export function icon(target: HTMLElement, name: string) {
	setIcon(target, name);
	if (target.querySelector("svg")) return;
	for (const alt of ICON_FALLBACKS[name] ?? []) {
		setIcon(target, alt);
		if (target.querySelector("svg")) return;
	}
}

export function iconButton(parent: HTMLElement, iconName: string, label: string, onClick: (evt: MouseEvent) => void, cls = ""): HTMLElement {
	const b = el("button", { cls: `clickable-icon co-icon-btn ${cls}`.trim(), title: label }, parent);
	icon(b, iconName);
	b.addEventListener("click", (evt) => {
		evt.preventDefault();
		onClick(evt);
	});
	return b;
}

/** A text button. `cta` makes it the one primary action in its place. */
export function button(parent: HTMLElement, label: string, onClick: (evt: MouseEvent) => void, opts: { cta?: boolean; warning?: boolean; title?: string } = {}): HTMLButtonElement {
	const b = el("button", { cls: `co-btn${opts.cta ? " mod-cta" : ""}${opts.warning ? " mod-warning" : ""}`, text: label }, parent);
	if (opts.title) b.title = opts.title;
	b.addEventListener("click", (evt) => {
		evt.preventDefault();
		onClick(evt);
	});
	return b;
}

export function dropdown(parent: HTMLElement, options: [string, string][], value: string, onChange: (v: string) => void, label?: string): HTMLSelectElement {
	const s = el("select", { cls: "dropdown co-select" }, parent);
	if (label) {
		s.setAttribute("aria-label", label);
		s.title = label;
	}
	for (const [v, text] of options) {
		const o = el("option", { text }, s);
		o.value = v;
	}
	s.value = value;
	s.addEventListener("change", () => onChange(s.value));
	return s;
}

/** Marks an on/off button as on or off: filled when on, for sight and for screen readers. */
export function setPressed(b: HTMLElement, on: boolean) {
	b.toggleClass("is-active", on);
	b.setAttribute("aria-pressed", String(on));
}

export function toggleChip(parent: HTMLElement, label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
	const chip = el("button", { cls: "co-chip is-toggle", text: label }, parent);
	setPressed(chip, value);
	chip.addEventListener("click", () => {
		value = !value;
		setPressed(chip, value);
		onChange(value);
	});
	return chip;
}

/** A segmented switch: one of a few choices, all visible. */
export function segmented(parent: HTMLElement, options: [string, string][], value: string, onChange: (v: string) => void, label: string): HTMLElement {
	const box = el("div", { cls: "co-segmented", attr: { role: "radiogroup", "aria-label": label } }, parent);
	const buttons: [string, HTMLElement][] = [];
	for (const [v, text] of options) {
		const b = el("button", { cls: "co-segment", text, attr: { role: "radio" } }, box);
		b.addEventListener("click", () => {
			for (const [k, x] of buttons) {
				x.toggleClass("is-active", k === v);
				x.setAttribute("aria-checked", String(k === v));
			}
			onChange(v);
		});
		buttons.push([v, b]);
	}
	for (const [k, x] of buttons) {
		x.toggleClass("is-active", k === value);
		x.setAttribute("aria-checked", String(k === value));
	}
	return box;
}

export function emptyState(parent: HTMLElement, title: string, body: string, action?: { label: string; onClick: () => void }) {
	const box = el("div", { cls: "co-empty" }, parent);
	el("div", { cls: "co-empty-title", text: title }, box);
	el("div", { cls: "co-empty-body", text: body }, box);
	if (action) button(box, action.label, action.onClick, { cta: true });
	return box;
}

/** How long to rest on a "?" before its tip opens. */
const HELP_DELAY_MS = 350;

/** A small "?" that explains something when you rest on it (or tab to it). */
export function helpTip(parent: HTMLElement, text: string): HTMLElement {
	const q = el("span", { cls: "co-help", text: "?", attr: { tabindex: "0", role: "button", "aria-label": text } }, parent);
	let pop: HTMLElement | undefined;
	let timer = 0;
	const show = () => {
		window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			pop?.remove();
			// Inside the dashboard when there is one, so a re-render or a closed tab takes the tip with it.
			const box = el("div", { cls: "co-help-pop", text }, q.closest<HTMLElement>(".co-dash") ?? activeDocument.body);
			pop = box;
			const r = q.getBoundingClientRect();
			const below = r.bottom + 6 + box.offsetHeight < window.innerHeight - 8;
			box.style.setProperty("--co-pop-top", `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - box.offsetHeight)}px`);
			box.style.setProperty("--co-pop-left", `${Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left + r.width / 2 - box.offsetWidth / 2))}px`);
			box.addClass("is-visible");
		}, HELP_DELAY_MS);
	};
	const hide = () => {
		window.clearTimeout(timer);
		pop?.remove();
		pop = undefined;
	};
	q.addEventListener("mouseenter", show);
	q.addEventListener("mouseleave", hide);
	q.addEventListener("focus", show);
	q.addEventListener("blur", hide);
	return q;
}

/** A notice that does something when its message is clicked. */
export function clickNotice(message: string, duration: number, onClick: () => void): Notice {
	return new Notice(createFragment((f) => f.createDiv({ text: message }).addEventListener("click", onClick)), duration);
}

/** A table cell as plain text: bold and code marks dropped, links shown by their alias, escaped pipes unescaped. */
export function md(s: string): string {
	return s
		.replace(/\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target)
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/\\\|/g, "|")
		.trim();
}

const PALETTE = ["--color-blue", "--color-purple", "--color-green", "--color-orange", "--color-pink", "--color-cyan", "--color-yellow", "--color-red"];

/** A stable colour from a name, so a PC or a person looks the same everywhere. */
export function hashColor(key: string): string {
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
	return `var(${PALETTE[Math.abs(h) % PALETTE.length]})`;
}

/** The PC part of "name@pc", "pc/folder" or a bare PC name, lower-cased. */
export function pcPart(who: string): string {
	const at = who.indexOf("@");
	const s = at >= 0 ? who.slice(at + 1) : who;
	return s.split(/[/,\s(]/)[0].toLowerCase();
}

/** A coloured dot for a PC or a person. */
export function identityDot(parent: HTMLElement, key: string): HTMLElement {
	const d = el("span", { cls: "co-dot", attr: { "aria-hidden": "true" } }, parent);
	d.style.setProperty("--co-dot", hashColor(key));
	return d;
}

export interface RowSpec {
	/** A short label in the first column ("Handoff", "Setup"). */
	kind?: string;
	/** PC or person, for the identity dot. */
	who?: string;
	title: string;
	detail?: string;
	source?: "vault" | "live";
	ts?: number;
	now: number;
	/** Adds the row's buttons. */
	actions?: (box: HTMLElement) => void;
	muted?: boolean;
}

/** One line of a list: what, then where it came from and how old, then what you can do. */
export function row(parent: HTMLElement, r: RowSpec): HTMLElement {
	const line = el("div", { cls: `co-row${r.muted ? " is-muted" : ""}` }, parent);
	if (r.kind !== undefined) el("span", { cls: "co-row-kind", text: r.kind }, line);
	const main = el("div", { cls: "co-row-main" }, line);
	const top = el("div", { cls: "co-row-title" }, main);
	if (r.who) identityDot(top, pcPart(r.who));
	el("span", { text: r.title }, top);
	if (r.detail) el("div", { cls: "co-row-detail", text: r.detail }, main);
	const side = el("div", { cls: "co-row-side" }, line);
	if (r.source || r.ts !== undefined) {
		const meta = el("span", { cls: "co-row-meta" }, side);
		if (r.source) el("span", { cls: `co-source is-${r.source}`, text: r.source }, meta);
		if (r.ts !== undefined) el("span", { cls: "co-age", text: age(r.now - r.ts), attr: { title: new Date(r.ts).toLocaleString() } }, meta);
	}
	if (r.actions) r.actions(el("div", { cls: "co-row-actions" }, side));
	return line;
}

/** A group heading inside a section: a hairline and a quiet title. */
export function group(parent: HTMLElement, title: string, note?: string): HTMLElement {
	const g = el("div", { cls: "co-group" }, parent);
	const h = el("div", { cls: "co-group-head" }, g);
	el("span", { cls: "co-group-title", text: title }, h);
	if (note) el("span", { cls: "co-group-note", text: note }, h);
	return g;
}
