// A small stand-in for the parts of Obsidian's API this plugin uses, so the dashboard runs in a plain
// browser page (dev/harness.ts). Same approach as UniverseView's dev/obsidian-mock.ts, much smaller.
import { createElement, icons } from "lucide";

type Cb = (...a: never[]) => unknown;

// ---- DOM helpers Obsidian adds to every element ----
declare global {
	interface HTMLElement {
		empty(): void;
		addClass(...c: string[]): void;
		removeClass(...c: string[]): void;
		toggleClass(c: string, on: boolean): void;
		hasClass(c: string): boolean;
		setText(t: string): void;
		createEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: { cls?: string; text?: string }): HTMLElementTagNameMap[K];
		createDiv(o?: { cls?: string; text?: string }): HTMLDivElement;
	}
	interface DocumentFragment {
		createDiv(o?: { cls?: string; text?: string }): HTMLDivElement;
	}
}
const P = HTMLElement.prototype;
P.empty = function () {
	while (this.firstChild) this.removeChild(this.firstChild);
};
P.addClass = function (...c) {
	this.classList.add(...c);
};
P.removeClass = function (...c) {
	this.classList.remove(...c);
};
P.toggleClass = function (c, on) {
	this.classList.toggle(c, on);
};
P.hasClass = function (c) {
	return this.classList.contains(c);
};
P.setText = function (t) {
	this.textContent = t;
};
function make<K extends keyof HTMLElementTagNameMap>(tag: K, o: { cls?: string; text?: string } = {}) {
	const e = document.createElement(tag);
	if (o.cls) e.className = o.cls;
	if (o.text !== undefined) e.textContent = o.text;
	return e;
}
P.createEl = function (tag, o) {
	const e = make(tag, o);
	this.appendChild(e);
	return e;
};
P.createDiv = function (o) {
	return this.createEl("div", o);
};
DocumentFragment.prototype.createDiv = function (o) {
	const e = make("div", o);
	this.appendChild(e);
	return e;
};
(window as unknown as Record<string, unknown>).createEl = make;
(window as unknown as Record<string, unknown>).activeDocument = document;
(window as unknown as Record<string, unknown>).createFragment = (cb?: (f: DocumentFragment) => void) => {
	const f = document.createDocumentFragment();
	cb?.(f);
	return f;
};

export function setIcon(target: HTMLElement, name: string) {
	target.querySelector("svg")?.remove();
	const key = name.replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase()) as keyof typeof icons;
	const node = icons[key];
	if (!node) return;
	const svg = createElement(node);
	svg.setAttribute("width", "18");
	svg.setAttribute("height", "18");
	target.appendChild(svg);
}

export const Platform = { isMobile: false, isDesktop: true, isMacOS: false };

// ---- Vault ----
export class TAbstractFile {
	path = "";
	name = "";
}
export class TFile extends TAbstractFile {
	extension = "md";
	basename = "";
	stat = { mtime: Date.now() - 5 * 60_000, ctime: 0, size: 0 };
}
export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
}

class Events {
	private handlers: Record<string, Cb[]> = {};
	on(name: string, cb: Cb) {
		(this.handlers[name] ??= []).push(cb);
		return { name, cb };
	}
	trigger(name: string, ...a: unknown[]) {
		for (const cb of this.handlers[name] ?? []) (cb as (...x: unknown[]) => unknown)(...a);
	}
}

export class Vault extends Events {
	files: Record<string, string>;
	constructor(files: Record<string, string>) {
		super();
		this.files = files;
	}
	private file(path: string): TFile {
		const f = new TFile();
		f.path = path;
		f.name = path.split("/").pop()!;
		f.basename = f.name.replace(/\.md$/, "");
		return f;
	}
	getFileByPath(path: string): TFile | null {
		return path in this.files ? this.file(path) : null;
	}
	getFolderByPath(path: string): TFolder | null {
		const prefix = path.replace(/\/$/, "") + "/";
		const kids = Object.keys(this.files).filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"));
		if (!kids.length) return null;
		const d = new TFolder();
		d.path = path;
		d.children = kids.map((p) => this.file(p));
		return d;
	}
	async cachedRead(f: TFile) {
		return this.files[f.path] ?? "";
	}
	async read(f: TFile) {
		return this.files[f.path] ?? "";
	}
	async process(f: TFile, fn: (t: string) => string) {
		const next = fn(this.files[f.path] ?? "");
		this.files[f.path] = next;
		this.trigger("modify", f);
		return next;
	}
}

// ---- Workspace and views ----
export class Component {
	private cleanups: (() => void)[] = [];
	register(cb: () => void) {
		this.cleanups.push(cb);
	}
	registerEvent(_ref: unknown) {}
	registerInterval(id: number) {
		this.cleanups.push(() => window.clearInterval(id));
		return id;
	}
	registerDomEvent(el: EventTarget, type: string, cb: EventListener) {
		el.addEventListener(type, cb);
		this.cleanups.push(() => el.removeEventListener(type, cb));
	}
	unload() {
		for (const c of this.cleanups.splice(0)) c();
	}
}

export class WorkspaceLeaf {
	view: ItemView | null = null;
	container: HTMLElement;
	app: App;
	constructor(app: App, container: HTMLElement) {
		this.app = app;
		this.container = container;
	}
	async setViewState(s: { type: string }) {
		const make = this.app.workspace.factories[s.type];
		if (!make) return;
		this.view = make(this);
		this.container.empty();
		this.container.appendChild(this.view.containerEl);
		await this.view.onOpen();
	}
	async openFile(f: TFile) {
		console.log("open note", f.path);
	}
}

export class Workspace extends Events {
	app: App;
	leaves: WorkspaceLeaf[] = [];
	factories: Record<string, (leaf: WorkspaceLeaf) => ItemView> = {};
	constructor(app: App) {
		super();
		this.app = app;
	}
	getLeavesOfType(type: string) {
		return this.leaves.filter((l) => l.view?.getViewType() === type);
	}
	getLeaf() {
		return this.leaves[0];
	}
	async revealLeaf() {}
}

export class App {
	vault: Vault;
	workspace: Workspace;
	private store: Record<string, unknown> = {};
	constructor(files: Record<string, string>) {
		this.vault = new Vault(files);
		this.workspace = new Workspace(this);
	}
	loadLocalStorage(key: string) {
		return this.store[key] ?? null;
	}
	saveLocalStorage(key: string, data: unknown) {
		if (data === null) delete this.store[key];
		else this.store[key] = data;
	}
}

export class ItemView extends Component {
	app: App;
	leaf: WorkspaceLeaf;
	containerEl = make("div", { cls: "workspace-leaf-content" });
	contentEl = make("div", { cls: "view-content" });
	constructor(leaf: WorkspaceLeaf) {
		super();
		this.leaf = leaf;
		this.app = leaf.app;
		this.containerEl.appendChild(this.contentEl);
	}
	getViewType() {
		return "";
	}
	async setState(_s: unknown, _r: unknown) {}
	async onOpen() {}
	async onClose() {}
}

export class Plugin extends Component {
	app: App;
	manifest: { id: string };
	data: unknown;
	settingTabs: PluginSettingTab[] = [];
	constructor(app: App, manifest: { id: string }, data: unknown = null) {
		super();
		this.app = app;
		this.manifest = manifest;
		this.data = data;
	}
	async loadData() {
		return this.data;
	}
	async saveData(d: unknown) {
		this.data = d;
		console.log("data.json", JSON.stringify(d));
	}
	registerView(type: string, make: (leaf: WorkspaceLeaf) => ItemView) {
		this.app.workspace.factories[type] = make;
	}
	addCommand(_c: unknown) {}
	addRibbonIcon(_i: string, _t: string, _cb: Cb) {}
	addSettingTab(t: PluginSettingTab) {
		this.settingTabs.push(t);
	}
}

export class PluginSettingTab {
	app: App;
	containerEl = make("div", { cls: "vertical-tab-content" });
	constructor(app: App, _p: Plugin) {
		this.app = app;
	}
	display() {}
}

// ---- Controls ----
class ButtonComponent {
	buttonEl: HTMLButtonElement;
	constructor(parent: HTMLElement) {
		this.buttonEl = parent.createEl("button");
	}
	setButtonText(t: string) {
		this.buttonEl.textContent = t;
		return this;
	}
	setCta() {
		this.buttonEl.addClass("mod-cta");
		return this;
	}
	setWarning() {
		this.buttonEl.addClass("mod-warning");
		return this;
	}
	setDestructive() {
		this.buttonEl.addClass("mod-destructive");
		return this;
	}
	setDisabled(d: boolean) {
		this.buttonEl.disabled = d;
		return this;
	}
	onClick(cb: (e: MouseEvent) => unknown) {
		this.buttonEl.addEventListener("click", (e) => void cb(e));
		return this;
	}
}
class TextComponent {
	inputEl: HTMLInputElement;
	constructor(parent: HTMLElement) {
		this.inputEl = parent.createEl("input");
		this.inputEl.type = "text";
	}
	setValue(v: string) {
		this.inputEl.value = v;
		return this;
	}
	setPlaceholder(v: string) {
		this.inputEl.placeholder = v;
		return this;
	}
	onChange(cb: (v: string) => unknown) {
		this.inputEl.addEventListener("input", () => void cb(this.inputEl.value));
		return this;
	}
}
class TextAreaComponent {
	inputEl: HTMLTextAreaElement;
	constructor(parent: HTMLElement) {
		this.inputEl = parent.createEl("textarea");
	}
	setValue(v: string) {
		this.inputEl.value = v;
		return this;
	}
	setPlaceholder(v: string) {
		this.inputEl.placeholder = v;
		return this;
	}
	onChange(cb: (v: string) => unknown) {
		this.inputEl.addEventListener("input", () => void cb(this.inputEl.value));
		return this;
	}
}
class DropdownComponent {
	selectEl: HTMLSelectElement;
	constructor(parent: HTMLElement) {
		this.selectEl = parent.createEl("select", { cls: "dropdown" });
	}
	addOption(v: string, t: string) {
		const o = this.selectEl.createEl("option", { text: t });
		o.value = v;
		return this;
	}
	addOptions(o: Record<string, string>) {
		for (const [v, t] of Object.entries(o)) this.addOption(v, t);
		return this;
	}
	setValue(v: string) {
		this.selectEl.value = v;
		return this;
	}
	setDisabled(d: boolean) {
		this.selectEl.disabled = d;
		return this;
	}
	onChange(cb: (v: string) => unknown) {
		this.selectEl.addEventListener("change", () => void cb(this.selectEl.value));
		return this;
	}
}

export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;
	constructor(parent: HTMLElement) {
		this.settingEl = parent.createDiv({ cls: "setting-item" });
		this.infoEl = this.settingEl.createDiv({ cls: "setting-item-info" });
		this.nameEl = this.infoEl.createDiv({ cls: "setting-item-name" });
		this.descEl = this.infoEl.createDiv({ cls: "setting-item-description" });
		this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
	}
	setName(n: string) {
		this.nameEl.textContent = n;
		return this;
	}
	setDesc(d: string) {
		this.descEl.textContent = d;
		return this;
	}
	setHeading() {
		this.settingEl.addClass("setting-item-heading");
		return this;
	}
	addButton(cb: (b: ButtonComponent) => unknown) {
		cb(new ButtonComponent(this.controlEl));
		return this;
	}
	addText(cb: (t: TextComponent) => unknown) {
		cb(new TextComponent(this.controlEl));
		return this;
	}
	addTextArea(cb: (t: TextAreaComponent) => unknown) {
		cb(new TextAreaComponent(this.controlEl));
		return this;
	}
	addDropdown(cb: (d: DropdownComponent) => unknown) {
		cb(new DropdownComponent(this.controlEl));
		return this;
	}
}

export class Modal {
	app: App;
	containerEl = make("div", { cls: "modal-container" });
	modalEl = make("div", { cls: "modal" });
	titleEl = make("div", { cls: "modal-title" });
	contentEl = make("div", { cls: "modal-content" });
	constructor(app: App) {
		this.app = app;
		const bg = make("div", { cls: "modal-bg" });
		bg.addEventListener("click", () => this.close());
		this.containerEl.append(bg, this.modalEl);
		this.modalEl.append(this.titleEl, this.contentEl);
	}
	setTitle(t: string) {
		this.titleEl.textContent = t;
		return this;
	}
	open() {
		document.body.appendChild(this.containerEl);
		this.onOpen();
	}
	close() {
		this.onClose();
		this.containerEl.remove();
	}
	onOpen() {}
	onClose() {}
}

export class Notice {
	constructor(message: string | DocumentFragment, duration = 4000) {
		const n = make("div", { cls: "notice" });
		if (typeof message === "string") n.textContent = message;
		else n.appendChild(message);
		let box = document.querySelector<HTMLElement>(".notice-container");
		if (!box) box = document.body.createDiv({ cls: "notice-container" });
		box.appendChild(n);
		window.setTimeout(() => n.remove(), duration);
	}
}

/** Replaced by the harness with a fake homeserver (dev/fake-sync.ts). */
export let requestUrl: (r: { url: string; method?: string; headers?: Record<string, string>; body?: string; throw?: boolean }) => Promise<{ status: number; json: unknown }> = async () => {
	throw new Error("no network in the harness");
};
export function setRequestUrl(f: typeof requestUrl) {
	requestUrl = f;
}
