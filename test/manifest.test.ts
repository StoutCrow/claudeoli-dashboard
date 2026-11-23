import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const raw = readFileSync("manifest.json");
const manifest = JSON.parse(raw.toString("utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

test("manifest.json starts with '{' (no byte-order mark)", () => {
  assert.equal(raw[0], 123);
});

test("versions.json maps the manifest version to its minAppVersion", () => {
  assert.equal(versions[manifest.version], manifest.minAppVersion);
});

test("manifest identity", () => {
  assert.equal(manifest.id, "claudeoli-dashboard");
  assert.equal(manifest.name, "ClaudeOli");
  assert.equal(manifest.minAppVersion, "1.13.0");
  assert.equal(manifest.isDesktopOnly, false);
  assert.equal(manifest.author, "Oli_G");
  assert.equal(manifest.authorUrl, "https://github.com/StoutCrow");
  assert.match(manifest.description, /Written entirely by AI \(Claude\)\.$/);
});

test("package.json version equals the manifest version", () => {
  assert.equal(pkg.version, manifest.version);
});
