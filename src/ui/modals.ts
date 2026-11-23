import { Modal, Setting, type App } from "obsidian";
import { el } from "./common.ts";

/** Asks for some text (a reply, a board answer); optionally an address first. Calls onSubmit and closes when it resolves. */
export class TextModal extends Modal {
	private opts: {
		title: string;
		context?: string;
		cta: string;
		addresses?: [string, string][];
		onSubmit: (text: string, address?: string) => Promise<unknown>;
	};

	constructor(app: App, opts: TextModal["opts"]) {
		super(app);
		this.opts = opts;
	}

	onOpen() {
		const o = this.opts;
		this.setTitle(o.title);
		if (o.context) el("p", { cls: "co-modal-note co-quote", text: o.context }, this.contentEl);
		let address = o.addresses?.[0]?.[0];
		if (o.addresses) {
			new Setting(this.contentEl).setName("To").addDropdown((d) => {
				for (const [v, label] of o.addresses!) d.addOption(v, label);
				d.setValue(address ?? "");
				d.onChange((v) => (address = v));
			});
		}
		const area = el("textarea", { cls: "co-reply", attr: { rows: "5", "aria-label": o.title } }, this.contentEl);
		const status = el("p", { cls: "co-modal-status", attr: { role: "status" } }, this.contentEl);
		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText(o.cta)
				.setCta()
				.onClick(async () => {
					const text = area.value.trim();
					if (!text) {
						status.setText("Write something first.");
						return;
					}
					b.setDisabled(true);
					try {
						await o.onSubmit(text, address);
						this.close();
					} catch (e) {
						status.setText((e as Error).message);
						b.setDisabled(false);
					}
				}),
		);
		window.requestAnimationFrame(() => area.focus());
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** A yes/no question, in full sentences, before an action that changes something for someone else. */
export class ConfirmModal extends Modal {
	private opts: { title: string; body: string; cta: string; warning?: boolean; onYes: () => Promise<unknown> };

	constructor(app: App, opts: ConfirmModal["opts"]) {
		super(app);
		this.opts = opts;
	}

	onOpen() {
		const o = this.opts;
		this.setTitle(o.title);
		el("p", { cls: "co-modal-body", text: o.body }, this.contentEl);
		const status = el("p", { cls: "co-modal-status", attr: { role: "status" } }, this.contentEl);
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => {
				b.setButtonText(o.cta).onClick(async () => {
					b.setDisabled(true);
					try {
						await o.onYes();
						this.close();
					} catch (e) {
						status.setText((e as Error).message);
						b.setDisabled(false);
					}
				});
				if (o.warning) b.setWarning();
				else b.setCta();
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}
