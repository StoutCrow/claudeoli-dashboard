import { Modal, Notice, Setting, type App } from "obsidian";
import type ClaudeOliPlugin from "../main.ts";
import { Matrix, MatrixError } from "../live/matrix.ts";
import { httpObsidian } from "../live/http.ts";
import { el } from "./common.ts";

/** Signs this device in. The password is sent once to the homeserver and then dropped; only the token is kept, locally. */
export class SignInModal extends Modal {
	private plugin: ClaudeOliPlugin;

	constructor(app: App, plugin: ClaudeOliPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		this.setTitle("Sign in on this device");
		el("p", { cls: "co-modal-note", text: "Use your own Matrix account. The access token is kept in this device's local storage only, never in the vault, and the password is not stored." }, contentEl);
		let homeserver = "";
		let user = "";
		let roomId = "";
		let password: HTMLInputElement | undefined;
		new Setting(contentEl).setName("Homeserver address").setDesc("For example https://matrix.example.org").addText((t) => {
			t.inputEl.type = "url";
			t.onChange((v) => (homeserver = v.trim()));
		});
		new Setting(contentEl).setName("User").setDesc("Your Matrix user ID or name.").addText((t) => {
			t.inputEl.autocomplete = "username";
			t.onChange((v) => (user = v.trim()));
		});
		new Setting(contentEl).setName("Password").addText((t) => {
			t.inputEl.type = "password";
			t.inputEl.autocomplete = "current-password";
			password = t.inputEl;
		});
		const roomRow = new Setting(contentEl)
			.setName("Agents room ID")
			.setDesc("Only needed if the room isn't found by its name.")
			.addText((t) => t.setPlaceholder("!abc:example.org").onChange((v) => (roomId = v.trim())));
		roomRow.settingEl.addClass("co-hidden");
		const status = el("p", { cls: "co-modal-status", attr: { role: "status" } }, contentEl);
		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Sign in")
				.setCta()
				.onClick(async () => {
					if (!/^https?:\/\/\S+$/.test(homeserver) || !user || !password?.value) {
						status.setText("Fill in the full address, the user and the password.");
						return;
					}
					b.setDisabled(true);
					status.setText("Signing in…");
					const pw = password.value;
					password.value = "";
					try {
						const r = await new Matrix(httpObsidian, homeserver).login(user, pw, `ClaudeOli dashboard · ${this.plugin.device().deviceLabel}`);
						const m = new Matrix(httpObsidian, homeserver, r.token);
						const room = roomId || (await m.findAgentsRoom());
						if (!room) {
							await m.logout().catch(() => {});
							roomRow.settingEl.removeClass("co-hidden");
							status.setText("Signed in, but no joined room is named “ClaudeOli agents”. Enter its ID and sign in again.");
							return;
						}
						this.plugin.setSecrets({ homeserver, userId: r.userId, token: r.token, deviceId: r.deviceId, roomId: room });
						new Notice(`Signed in as ${r.userId}`);
						this.close();
					} catch (e) {
						status.setText(e instanceof MatrixError ? `The server said: ${e.message}` : "Couldn't reach the homeserver. Check the address and that Tailscale is on.");
					} finally {
						b.setDisabled(false);
					}
				}),
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** Signs this device out on the server, and forgets its token here even if the server can't be reached. */
export async function signOut(plugin: ClaudeOliPlugin): Promise<void> {
	const s = plugin.secrets();
	if (s) await new Matrix(httpObsidian, s.homeserver, s.token).logout().catch(() => {});
	plugin.setSecrets(null);
}
