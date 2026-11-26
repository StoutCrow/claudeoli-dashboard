import { test } from "node:test";
import assert from "node:assert/strict";
import { needsFromVault } from "../src/core/needs.ts";
import { age, today } from "../src/core/time.ts";
import { DEFAULT_PATHS, readVault } from "../src/core/vault.ts";
import { loadFixtures } from "./fixtures.ts";

const v = readVault(loadFixtures(), DEFAULT_PATHS);

test("setup rows owned by the owner and not done need them", () => {
  const items = needsFromVault(v, "owner").filter((i) => i.kind === "setup");
  assert.deepEqual(items.map((i) => i.title), ["Back up this PC itself", 'Turn on "Sync all other types"']);
  assert.equal(items[0].action, "setup-done");
  assert.equal(items[0].ref, "pc-a\u0001Back up this PC itself\u0001owner (user)");
  assert.equal(items[0].source, "vault");
});

test("a setup row owned by an agent needs nobody", () => {
  const items = needsFromVault(v, "owner");
  assert.ok(!items.some((i) => i.title === "Install the sync hooks"));
});

test("board work owned by the owner in review or blocked shows, without an action", () => {
  const items = needsFromVault(v, "owner").filter((i) => i.kind === "board-work");
  assert.deepEqual(items.map((i) => i.title), ["Push access on pc-d"]);
  assert.equal(items[0].action, undefined);
});

test("only unanswered board messages to the owner need them", () => {
  const items = needsFromVault(v, "owner").filter((i) => i.kind === "board-message");
  assert.deepEqual(items.map((i) => i.title), ["Commit author"]);
  assert.equal(items[0].action, "board-answer");
});

test("an empty owner name matches nothing", () => {
  assert.deepEqual(needsFromVault(v, ""), []);
});

test("age is short and exact", () => {
  assert.equal(age(20_000), "20 s");
  assert.equal(age(180_000), "3 min");
  assert.equal(age(2 * 3600_000 + 5), "2 h");
  assert.equal(age(4 * 86400_000), "4 d");
  assert.equal(age(-5), "0 s");
});

test("today is YYYY-MM-DD in local time", () => {
  assert.equal(today(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});
