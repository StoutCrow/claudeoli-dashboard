import { test } from "node:test";
import assert from "node:assert/strict";
import { cell, parseTables, rowKey, splitRow, tableUnder } from "../src/core/tables.ts";

test("splitRow keeps escaped pipes, link aliases and code spans in one cell", () => {
  assert.deepEqual(splitRow("| a | b \\| c | [[n\\|alias]] | `x|y` |"), ["a", "b \\| c", "[[n\\|alias]]", "`x|y`"]);
});

test("splitRow keeps a link alias with a bare pipe in one cell", () => {
  assert.deepEqual(splitRow("| [[note|alias]] | b |"), ["[[note|alias]]", "b"]);
});

const NOTE = [
  "# Title",
  "",
  "## Queue",
  "",
  "| PC | Task | Owner |",
  "|---|---|---|",
  "| pc-a | **Back up** | owner (user) |",
  "| pc-b | Short |",
  "| pc-a | Extra | x | y |",
  "",
  "| not | a table row after a blank line |",
  "",
  "## Done",
  "",
  "| Date | PC | Task |",
  "| --- | :-: | --- |",
  "| 2026-01-01 | pc-a | Task |",
].join("\n");

test("tables are found with the nearest heading above them", () => {
  const ts = parseTables(NOTE);
  assert.equal(ts.length, 2);
  assert.equal(ts[0].heading, "Queue");
  assert.equal(ts[1].heading, "Done");
  assert.deepEqual(ts[0].header, ["PC", "Task", "Owner"]);
});

test("a short row is padded to the header length", () => {
  const t = tableUnder(NOTE, "Queue")!;
  assert.deepEqual(t.rows[1].cells, ["pc-b", "Short", ""]);
});

test("an extra cell is kept", () => {
  const t = tableUnder(NOTE, "Queue")!;
  assert.equal(t.rows[2].cells.length, 4);
});

test("a blank line ends a table", () => {
  const t = tableUnder(NOTE, "Queue")!;
  assert.equal(t.rows.length, 3);
  assert.equal(t.endLine, 8);
});

test("markup is kept as-is in a cell", () => {
  const t = tableUnder(NOTE, "Queue")!;
  assert.equal(cell(t.rows[0], t, "Task"), "**Back up**");
  assert.equal(cell(t.rows[0], t, "Missing"), "");
});

test("rows remember their line and raw text", () => {
  const t = tableUnder(NOTE, "Done")!;
  assert.equal(t.rows[0].line, 16);
  assert.equal(t.rows[0].raw, "| 2026-01-01 | pc-a | Task |");
});

test("rowKey joins the first three cells", () => {
  const t = tableUnder(NOTE, "Done")!;
  assert.equal(rowKey(t.rows[0]), "2026-01-01\u0001pc-a\u0001Task");
});

test("tableUnder matches a heading prefix and Windows line endings", () => {
  const crlf = "## Log (newest first)\r\n\r\n| A | B |\r\n|---|---|\r\n| 1 | 2 |\r\n";
  const t = tableUnder(crlf, "Log")!;
  assert.deepEqual(t.rows[0].cells, ["1", "2"]);
  assert.equal(t.rows[0].raw, "| 1 | 2 |");
});
