// Builds dev/out/harness.js (plugin + mock Obsidian + the sample notes in dev/fixtures) and, with --serve, serves it.
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const root = "dev/fixtures";
const files = {};
(function walk(dir) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) walk(full);
		else if (e.name.endsWith(".md")) files[path.relative(root, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
	}
})(root);

const build = () =>
	esbuild.build({
		absWorkingDir: process.cwd(),
		entryPoints: ["./dev/harness.ts"],
		bundle: true,
		format: "esm",
		target: "es2022",
		outfile: "dev/out/harness.js",
		sourcemap: "inline",
		alias: { obsidian: "./dev/obsidian-mock.ts" },
		define: { VAULT_FILES: JSON.stringify(files) },
		logLevel: "warning",
	});
await build();
// The page also loads the plugin's real stylesheet.
fs.copyFileSync("src/styles.css", "styles.css");
console.log(`Harness built with ${Object.keys(files).length} sample notes.`);

if (process.argv.includes("--serve")) {
	const port = Number(process.env.PORT) || 5179;
	const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
	const here = path.resolve(".");
	http
		.createServer((req, res) => {
			let url = decodeURIComponent(req.url.split("?")[0]);
			if (url === "/") url = "/dev/harness.html";
			const file = path.resolve("." + url);
			if (!file.startsWith(here + path.sep)) return res.writeHead(403).end();
			// Rebuild on each page load, so a reload shows the latest source.
			const ready = url === "/dev/harness.html" ? build().then(() => fs.copyFileSync("src/styles.css", "styles.css")) : Promise.resolve();
			ready.then(() =>
				fs.readFile(file, (err, data) => {
					if (err) return res.writeHead(404).end("not found");
					res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
					res.end(data);
				}),
			);
		})
		.listen(port, "127.0.0.1", () => console.log(`Harness on http://localhost:${port}`));
}
