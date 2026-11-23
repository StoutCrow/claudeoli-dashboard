// The dashboard in a browser page with the mock Obsidian and the sample notes in dev/fixtures.
// Flags (query string): theme=dark, zoom=1.5, width=375, section=<id>, live=signedout|ok|offline|rejected, owner=<name>.
import { App, WorkspaceLeaf } from "obsidian";
import ClaudeOliPlugin from "../src/main.ts";
import { VIEW_TYPE } from "../src/ui/view.ts";
import { installFakeServer } from "./fake-sync.ts";

declare const VAULT_FILES: Record<string, string>;

const q = new URLSearchParams(location.search);
document.body.toggleClass("theme-dark", q.get("theme") === "dark");
document.body.toggleClass("theme-light", q.get("theme") !== "dark");
if (q.get("zoom")) document.documentElement.style.setProperty("zoom", q.get("zoom")!);
const pane = document.getElementById("pane")!;
if (q.get("width")) pane.style.setProperty("width", `${q.get("width")}px`);

const app = new App({ ...VAULT_FILES });
const live = q.get("live") ?? "signedout";
if (live !== "signedout") {
	app.saveLocalStorage("claudeoli-dashboard:signin", { homeserver: "https://hs.example.org", userId: "@owner:example.org", token: "fake", deviceId: "HARNESS", roomId: "!agents:example.org" });
	installFakeServer(live);
}
app.saveLocalStorage("claudeoli-dashboard:device", { serverLabel: "pc-c", deviceLabel: "harness" });

const plugin = new ClaudeOliPlugin(app as never, { id: "claudeoli-dashboard" } as never, { ownerName: q.get("owner") ?? "owner" });
await plugin.onload();
const leaf = new WorkspaceLeaf(app, pane);
app.workspace.leaves.push(leaf);
await leaf.setViewState({ type: VIEW_TYPE });
if (q.get("section")) await leaf.view!.setState({ section: q.get("section") }, {});
Object.assign(window, { app, plugin, leaf });
