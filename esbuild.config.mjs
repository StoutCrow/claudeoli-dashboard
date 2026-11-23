// Bundles src/main.ts into main.js (what Obsidian loads) and copies src/styles.css to styles.css.
import esbuild from "esbuild";
import fs from "node:fs";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";

const copyStyles = {
	name: "styles",
	setup(build) {
		build.onEnd(() => fs.writeFileSync("styles.css", fs.readFileSync("src/styles.css", "utf8").replace(/^﻿/, "")));
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
	format: "cjs",
	target: "es2020",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	minify: prod,
	outfile: "main.js",
	plugins: [copyStyles],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
