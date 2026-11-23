import { Plugin, TFile, TFolder, type TAbstractFile } from "obsidian";
import { DEFAULT_PATHS, readVault, watchedPath, type NotePaths, type VaultModel } from "./core/vault.ts";
import { DashboardView, VIEW_TYPE } from "./ui/view.ts";
import { ClaudeOliSettingTab } from "./ui/settings-tab.ts";
import { SignInModal } from "./ui/signin.ts";

/** Synced with the vault (data.json): nothing secret, nothing that names a server. */
export interface Settings {
	paths: NotePaths;
	/** The owner's name as the notes write it ("name" or "name (user)"). */
	ownerName: string;
}

/** Kept on this device only (local storage, per vault). */
export interface DeviceSettings {
	/** What the offline line calls the homeserver PC ("Server offline since …"). */
	serverLabel: string;
	/** Names this device's Matrix session ("ClaudeOli dashboard · <label>"). */
	deviceLabel: string;
}

/** This device's Matrix sign-in. Local storage only: never data.json, never the vault. */
export interface LocalSecrets {
	homeserver: string;
	userId: string;
	token: string;
	deviceId: string;
	roomId: string;
}

const DEFAULTS: Settings = { paths: { ...DEFAULT_PATHS }, ownerName: "" };
const SIGNIN_KEY = "claudeoli-dashboard:signin";
const DEVICE_KEY = "claudeoli-dashboard:device";

export interface VaultRead {
	model: VaultModel;
	/** Last change of each note read, by path. */
	mtimes: Record<string, number>;
	at: number;
}

export default class ClaudeOliPlugin extends Plugin {
	settings: Settings = { ...DEFAULTS, paths: { ...DEFAULT_PATHS } };

	async onload() {
		await this.loadSettings();
		this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
		this.addCommand({ id: "open", name: "Open dashboard", callback: () => void this.openDashboard() });
		this.addRibbonIcon("layout-dashboard", "Open ClaudeOli dashboard", () => void this.openDashboard());
		this.addSettingTab(new ClaudeOliSettingTab(this.app, this));
		const changed = (f: TAbstractFile, old?: string) => {
			if (watchedPath(f.path, this.settings.paths) || (old !== undefined && watchedPath(old, this.settings.paths))) this.vaultChanged();
		};
		this.registerEvent(this.app.vault.on("modify", (f) => changed(f)));
		this.registerEvent(this.app.vault.on("create", (f) => changed(f)));
		this.registerEvent(this.app.vault.on("delete", (f) => changed(f)));
		this.registerEvent(this.app.vault.on("rename", (f, old) => changed(f, old)));
	}

	async loadSettings() {
		const data = ((await this.loadData()) ?? {}) as Partial<Settings>;
		this.settings = { ownerName: String(data.ownerName ?? ""), paths: { ...DEFAULT_PATHS, ...(data.paths ?? {}) } };
	}

	async saveSettings() {
		await this.saveData({ paths: this.settings.paths, ownerName: this.settings.ownerName });
		this.vaultChanged();
	}

	device(): DeviceSettings {
		const d = (this.app.loadLocalStorage(DEVICE_KEY) ?? {}) as Partial<DeviceSettings>;
		return { serverLabel: d.serverLabel || "Server", deviceLabel: d.deviceLabel || "this device" };
	}

	setDevice(d: DeviceSettings) {
		this.app.saveLocalStorage(DEVICE_KEY, d);
		this.redraw();
	}

	secrets(): LocalSecrets | null {
		const s = this.app.loadLocalStorage(SIGNIN_KEY) as LocalSecrets | null;
		return s && s.token && s.homeserver && s.roomId ? s : null;
	}

	setSecrets(s: LocalSecrets | null) {
		this.app.saveLocalStorage(SIGNIN_KEY, s);
		for (const v of this.views()) v.restartLive();
	}

	openSignIn() {
		new SignInModal(this.app, this).open();
	}

	async openDashboard() {
		const { workspace } = this.app;
		const leaf = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}

	/** Reads the known notes. Missing notes are listed, not errors. */
	async readVault(): Promise<VaultRead> {
		const p = this.settings.paths;
		const files: Record<string, string | undefined> = {};
		const mtimes: Record<string, number> = {};
		const read = async (f: TFile) => {
			files[f.path] = await this.app.vault.cachedRead(f);
			mtimes[f.path] = f.stat.mtime;
		};
		for (const path of [p.machines, p.openWork, p.handoff, p.board]) {
			const f = this.app.vault.getFileByPath(path);
			if (f) await read(f);
		}
		const dir = this.app.vault.getFolderByPath(p.sessionsDir.replace(/\/$/, ""));
		if (dir instanceof TFolder) for (const c of dir.children) if (c instanceof TFile && c.extension === "md") await read(c);
		return { model: readVault(files, p), mtimes, at: Date.now() };
	}

	private views(): DashboardView[] {
		return this.app.workspace.getLeavesOfType(VIEW_TYPE).map((l) => l.view).filter((v): v is DashboardView => v instanceof DashboardView);
	}

	private vaultChanged() {
		for (const v of this.views()) v.refreshVault();
	}

	redraw() {
		for (const v of this.views()) v.render();
	}
}
