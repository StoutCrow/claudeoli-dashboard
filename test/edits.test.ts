import { test } from "node:test";
import assert from "node:assert/strict";
import { answerBoardMessage, setupToDone } from "../src/core/edits.ts";
import { tableUnder } from "../src/core/tables.ts";
import { loadFixtures } from "./fixtures.ts";

const files = loadFixtures();
const OPEN = files["CLAUDE/Setup/Setup Open work.md"];
const BOARD = files["Guides/Coordination board.md"];

const queueRow = (text: string, i: number) => tableUnder(text, "Queue")!.rows[i];
const messageRow = (text: string, i: number) => tableUnder(text, "Messages")!.rows[i];

test("setup to Done moves the row to the top of Done and changes no other line", () => {
  const r = setupToDone(OPEN, queueRow(OPEN, 0), "2026-11-23");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const done = tableUnder(r.text, "Done")!;
  assert.deepEqual(done.rows[0].cells, ["2026-11-23", "pc-a", "Back up this PC itself", "owner (user)"]);
  assert.equal(done.rows[1].cells[2], "Portable Node on PATH");
  assert.equal(tableUnder(r.text, "Queue")!.rows.length, 3);
  const before = OPEN.split("\n").filter((l) => !l.includes("Back up this PC itself"));
  const after = r.text.split("\n").filter((l) => !l.includes("Back up this PC itself"));
  assert.deepEqual(after, before);
});

test("a row whose State changed since it was shown is refused", () => {
  const shown = queueRow(OPEN, 0);
  const changed = OPEN.replace("| owner (user) | next | Pick a drive first. |", "| owner (user) | in progress | Pick a drive first. |");
  assert.deepEqual(setupToDone(changed, shown, "2026-11-23"), { ok: false, reason: "changed" });
});

test("a row that is gone is missing", () => {
  const shown = queueRow(OPEN, 0);
  const gone = OPEN.split("\n").filter((l) => !l.includes("Back up this PC itself")).join("\n");
  assert.deepEqual(setupToDone(gone, shown, "2026-11-23"), { ok: false, reason: "missing" });
});

test("Windows line endings are kept", () => {
  const crlf = OPEN.replace(/\n/g, "\r\n");
  const r = setupToDone(crlf, queueRow(crlf, 1), "2026-11-23");
  assert.equal(r.ok && r.text.includes("\r\n| 2026-11-23 | pc-b | Install the sync hooks | pc-b agent |\r\n"), true);
  assert.equal(r.ok && /[^\r]\n/.test(r.text), false);
});

test("a board answer fills the empty Answer cell, with pipes escaped and lines joined", () => {
  const r = answerBoardMessage(BOARD, messageRow(BOARD, 1), "Yes, a|b\nboth");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const row = messageRow(r.text, 1);
  assert.equal(row.cells[5], "Yes, a\\|b both");
  assert.equal(row.cells.length, 6);
  const others = (t: string) => t.split("\n").filter((l) => !l.includes("Commit author"));
  assert.deepEqual(others(r.text), others(BOARD));
});

test("answering an already answered row is refused as changed", () => {
  const shown = messageRow(BOARD, 1);
  const answered = BOARD.replace("own identity? | |", "own identity? | No. |");
  assert.deepEqual(answerBoardMessage(answered, shown, "Yes"), { ok: false, reason: "changed" });
});
