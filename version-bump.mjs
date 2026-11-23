// Run by `npm version <patch|minor|major>`: copies the new version into manifest.json and records
// which Obsidian version it needs in versions.json (how Obsidian picks a compatible release).
// Node writes UTF-8 without a byte-order mark, which Obsidian needs.
import { readFileSync, writeFileSync } from "node:fs";

const target = process.env.npm_package_version;
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = target;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[target] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
