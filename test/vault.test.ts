import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PATHS, readVault, watchedPath } from "../src/core/vault.ts";
import { cell } from "../src/core/tables.ts";
import { loadFixtures } from "./fixtures.ts";

const files = loadFixtures();

test("every known table is found in the sample vault", () => {
  const v = readVault(files, DEFAULT_PATHS);
  for (const k of ["machines", "tools", "hooks", "queue", "done", "now", "log", "work", "messages"] as const) {
    assert.ok(v[k], `${k} should be found`);
  }
  assert.deepEqual(v.missing, []);
  assert.equal(v.queue!.rows.length, 4);
  assert.equal(cell(v.messages!.rows[1], v.messages!, "To"), "owner");
});

test("a missing note is listed and its tables are null", () => {
  const partial = { ...files };
  delete partial[DEFAULT_PATHS.board];
  const v = readVault(partial, DEFAULT_PATHS);
  assert.deepEqual(v.missing, [DEFAULT_PATHS.board]);
  assert.equal(v.work, null);
  assert.equal(v.messages, null);
  assert.deepEqual(v.decisions, []);
});

test("session logs are keyed by PC (the file's basename)", () => {
  const v = readVault(files, DEFAULT_PATHS);
  assert.deepEqual(Object.keys(v.sessionLogs), ["pc-a"]);
  assert.equal(v.sessionLogs["pc-a"].rows.length, 3);
});

test("decisions are the bullet lines under Decisions", () => {
  const v = readVault(files, DEFAULT_PATHS);
  assert.equal(v.decisions.length, 2);
  assert.match(v.decisions[0], /^\*\*2026-11-20\*\*: 2\.0 isn't published/);
});

test("watchedPath knows which vault paths the dashboard reads", () => {
  assert.equal(watchedPath(DEFAULT_PATHS.handoff, DEFAULT_PATHS), true);
  assert.equal(watchedPath(DEFAULT_PATHS.sessionsDir + "pc-b.md", DEFAULT_PATHS), true);
  assert.equal(watchedPath("Other/note.md", DEFAULT_PATHS), false);
});
