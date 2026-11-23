// Obsidian's own review rules (the ones the community directory checks with), run with `npm run lint`.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import { DEFAULT_BRANDS } from "./node_modules/eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js";

export default defineConfig([
	{ ignores: ["main.js", "node_modules/**", "dev/**", "scripts/**", "test/**", "*.mjs"] },
	...obsidianmd.configs.recommended,
	// The plugin's own name, and the protocol and product names it shows, keep their capitals.
	{
		rules: {
			"obsidianmd/ui/sentence-case": ["warn", { enforceCamelCaseLower: true, brands: [...DEFAULT_BRANDS, "ClaudeOli", "Matrix", "Element X", "Cinny", "Tailscale", "Claude Code"] }],
		},
	},
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
			},
		},
	},
]);
