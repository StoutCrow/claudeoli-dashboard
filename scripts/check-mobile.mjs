// Fails when src/ uses something that breaks on Obsidian mobile or leaks past the plugin's lifetime.
// Run: node scripts/check-mobile.mjs
import fs from "node:fs";
import path from "node:path";

const RULES = [
	[/from\s+["'](?:node:[^"']+|fs|path|crypto|child_process|os|http|https)["']/, "Node module import (not on mobile)"],
	[/require\(\s*["'](?:fs|path|crypto|child_process|os|http|https)["']/, "Node module require (not on mobile)"],
	[/\b(?:innerHTML|outerHTML)\b/, "innerHTML/outerHTML (build elements instead)"],
	[/(?<![.\w])fetch\(/, "fetch() (use requestUrl)"],
	[/\b(?:window|document)\.addEventListener\(/, "global listener (use registerDomEvent)"],
	[/(?<![.\w])(?:window\.)?setInterval\(/, "setInterval (use registerInterval)"],
	[/\bdetachLeavesOfType\(/, "detaching leaves (never in onunload)"],
];
// One-shot timers are allowed only where they are tracked and cleared.
const TIMER_OK = new Set(["src/live/loop.ts", "src/ui/common.ts"]);
const TIMER = [/(?<![.\w])(?:window\.)?setTimeout\(/, "setTimeout outside the tracked-timer files"];

const hits = [];
function walk(dir) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) walk(full);
		else if (e.name.endsWith(".ts")) check(full.split(path.sep).join("/"));
	}
}
function check(file) {
	const lines = fs.readFileSync(file, "utf8").split("\n");
	lines.forEach((line, i) => {
		if (/^\s*(\/\/|\*)/.test(line)) return;
		const rules = TIMER_OK.has(file) ? RULES : [...RULES, TIMER];
		for (const [re, why] of rules) if (re.test(line)) hits.push(`${file}:${i + 1}: ${why}`);
	});
}
walk("src");
if (hits.length) {
	console.error(hits.join("\n"));
	process.exit(1);
}
console.log("mobile-safe: ok");
