// Fails when a tracked file contains a word from a private list (PC names, user names, server names...).
// The list is kept OUTSIDE this repository, one word per line; point CO_NAMES_FILE at it.
// Run after `git add -A`, before every commit: CO_NAMES_FILE=<path> node scripts/check-names.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const listPath = process.env.CO_NAMES_FILE;
if (!listPath) {
	console.error("set CO_NAMES_FILE to the private names list");
	process.exit(2);
}
const names = fs.readFileSync(listPath, "utf8").split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const hits = [];
for (const f of files) {
	let text;
	try {
		text = fs.readFileSync(f, "utf8").toLowerCase();
	} catch {
		continue;
	}
	for (const n of names) if (text.includes(n) || f.toLowerCase().includes(n)) hits.push(`${f}: ${n}`);
}
if (hits.length) {
	console.error(`${hits.length} private name(s) found:\n${hits.join("\n")}`);
	process.exit(1);
}
console.log(`names: ok (${files.length} tracked files, ${names.length} names)`);
