import { Notice, TFile, type App } from "obsidian";
import { answerBoardMessage, setupToDone, type EditResult } from "../core/edits.ts";
import type { NeedsItem } from "../core/needs.ts";
import { today } from "../core/time.ts";
import type { NotePaths } from "../core/vault.ts";
import { button } from "./common.ts";
import { TextModal } from "./modals.ts";

/** One vault.process() call: the edit sees the note as it is now, and writes nothing if the row changed. */
async function edit(app: App, path: string, f: (text: string) => EditResult): Promise<void> {
	const file = app.vault.getFileByPath(path);
	if (!(file instanceof TFile)) throw new Error(`${path} not found`);
	let refused: string | undefined;
	await app.vault.process(file, (text) => {
		const r = f(text);
		if (r.ok) return r.text;
		refused = r.reason;
		return text;
	});
	if (refused) throw new Error(refused === "changed" ? "This row changed; reload" : "This row is gone; reload");
}

/** The buttons for the owner's vault rows under Needs you. */
export function vaultActions(app: App, paths: NotePaths): (i: NeedsItem) => ((box: HTMLElement) => void) | undefined {
	return (i) => {
		const shown = i.row;
		if (!shown) return undefined;
		if (i.action === "setup-done") {
			return (box) =>
				button(box, "Done", () => {
					edit(app, paths.openWork, (t) => setupToDone(t, shown, today())).then(
						() => new Notice(`Moved to Done: ${i.title}`),
						(e: Error) => new Notice(e.message),
					);
				}, { title: "Move this row to the Done table" });
		}
		if (i.action === "board-answer") {
			return (box) =>
				button(box, "Answer…", () =>
					new TextModal(app, {
						title: `Answer: ${i.title}`,
						context: i.detail,
						cta: "Write answer",
						onSubmit: (text) => edit(app, paths.board, (t) => answerBoardMessage(t, shown, text)),
					}).open(),
				);
		}
		return undefined;
	};
}
