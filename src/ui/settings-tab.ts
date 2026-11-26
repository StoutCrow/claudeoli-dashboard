import { PluginSettingTab, Setting, type App } from "obsidian";
import type ClaudeOliPlugin from "../main.ts";
import type { NotePaths } from "../core/vault.ts";
import { signOut } from "./signin.ts";

const PATH_ROWS: [keyof NotePaths, string, string][] = [
	["machines", "Setup machines note", "Machines, Tools and Sync hooks tables."],
	["openWork", "Setup open work note", "Queue and Done tables."],
	["sessionsDir", "Session logs folder", "One note per PC, written by the session-end hook."],
	["handoff", "Session handoff note", "Now and Log tables."],
	["board", "Coordination board note", "Work and Messages tables, and Decisions."],
];

/** The settings, drawn the same in Obsidian's settings window and in the dashboard's Settings section. */
export function renderSettings(containerEl: HTMLElement, plugin: ClaudeOliPlugin, redraw: () => void) {
	new Setting(containerEl).setName("This device").setHeading();
	const s = plugin.secrets();
	const signin = new Setting(containerEl).setName("Matrix sign-in");
	if (s) {
		signin.setDesc(`Signed in as ${s.userId}. The access token stays on this device.`);
		signin.addButton((b) =>
			b.setButtonText("Sign out on this device").onClick(async () => {
				b.setDisabled(true);
				await signOut(plugin);
				redraw();
			}),
		);
	} else {
		signin.setDesc("Not signed in on this device. The dashboard shows the vault only.");
		signin.addButton((b) => b.setButtonText("Sign in").setCta().onClick(() => plugin.openSignIn()));
	}
	const d = plugin.device();
	new Setting(containerEl)
		.setName("Server name")
		.setDesc("What the offline line calls the homeserver. Kept on this device.")
		.addText((t) => t.setPlaceholder("Server").setValue(d.serverLabel === "Server" ? "" : d.serverLabel).onChange((v) => plugin.setDevice({ ...plugin.device(), serverLabel: v.trim() })));
	new Setting(containerEl)
		.setName("Device name")
		.setDesc("Names this device's Matrix session, so you can find it in Element X or Cinny.")
		.addText((t) => t.setPlaceholder("This device").setValue(d.deviceLabel === "this device" ? "" : d.deviceLabel).onChange((v) => plugin.setDevice({ ...plugin.device(), deviceLabel: v.trim() })));

	new Setting(containerEl).setName("Notes").setHeading();
	new Setting(containerEl)
		.setName("Your name in the notes")
		.setDesc("Rows owned by this name, or addressed to it, show at the top of the dashboard.")
		.addText((t) =>
			t.setValue(plugin.settings.ownerName).onChange(async (v) => {
				plugin.settings.ownerName = v.trim();
				await plugin.saveSettings();
			}),
		);
	for (const [key, name, desc] of PATH_ROWS) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((t) =>
				t.setValue(plugin.settings.paths[key]).onChange(async (v) => {
					plugin.settings.paths[key] = v.trim();
					await plugin.saveSettings();
				}),
			);
	}
}

export class ClaudeOliSettingTab extends PluginSettingTab {
	private plugin: ClaudeOliPlugin;

	constructor(app: App, plugin: ClaudeOliPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		this.containerEl.empty();
		renderSettings(this.containerEl, this.plugin, () => this.display());
	}
}
