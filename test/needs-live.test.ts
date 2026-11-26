import { test } from "node:test";
import assert from "node:assert/strict";
import { commitDiffers, decisionsEnabled, needsFromLive } from "../src/core/needs.ts";
import { emptyLive, type LiveState } from "../src/core/live.ts";
import type { BusMessage } from "../src/core/protocol.ts";

const msg = (m: Partial<BusMessage> & { id: string }): BusMessage => ({ ts: 1_000, sender: "@claudeoli-pc-a:x", from: "pc-a/x", to: "oli", kind: "chat", thread: "t-1", text: "hi", ...m });
const live = (patch: Partial<LiveState>): LiveState => ({ ...emptyLive(), ...patch });

test("a pending handoff needs a decision; once approved it doesn't", () => {
  const h = msg({ id: "$h", kind: "handoff", from: "pc-a/x", to: "pc-b/y", text: "Finish the changelog" });
  assert.deepEqual(needsFromLive(live({ messages: [h] }), 2_000).map((i) => [i.kind, i.action, i.ref]), [["handoff", "approve-refuse", "$h"]]);
  const done = live({ messages: [h], statuses: { $h: { state: "approved", ts: 3_000, id: "$s" } } });
  assert.deepEqual(needsFromLive(done, 4_000), []);
});

test("an ask to oli needs a reply until oli answers in its thread", () => {
  const ask = msg({ id: "$a", kind: "ask", text: "Restart now?" });
  assert.equal(needsFromLive(live({ messages: [ask] }), 2_000)[0].action, "reply");
  const answered = live({ messages: [ask, msg({ id: "$b", ts: 1_500, from: "oli", to: "pc-a/x", kind: "answer", text: "yes" })] });
  assert.deepEqual(needsFromLive(answered, 2_000), []);
});

test("an ask to someone else needs nobody here", () => {
  assert.deepEqual(needsFromLive(live({ messages: [msg({ id: "$a", kind: "ask", to: "pc-b/y" })] }), 2_000), []);
});

test("a claim past its expiry can be released", () => {
  const s = live({ claims: [{ key: "x:src/a.ts", holder: "pc-a/x", note: "", expires: 1_000 }, { key: "x:src/b.ts", holder: "pc-a/x", note: "", expires: 9_000 }] });
  assert.deepEqual(needsFromLive(s, 2_000).map((i) => [i.kind, i.action, i.ref]), [["claim", "release", "x:src/a.ts"]]);
});

test("decisions need a v2 bot on the handoff's PC", () => {
  const h = msg({ id: "$h", kind: "handoff", to: "pc-b/y" });
  assert.equal(decisionsEnabled(live({ presence: { "pc-b": { pc: "pc-b", sessions: [], seen: 0, version: 1 } } }), h), false);
  assert.equal(decisionsEnabled(live({ presence: { "pc-b": { pc: "pc-b", sessions: [], seen: 0, version: 2 } } }), h), true);
  assert.equal(decisionsEnabled(live({}), h), false);
});

test("a PC whose bot runs a different commit from the others is counted", () => {
  const p = (pc: string, commit?: string) => ({ pc, sessions: [], seen: 0, version: 2, commit });
  const s = live({ presence: { "pc-a": p("pc-a", "aaaaaaa"), "pc-b": p("pc-b", "aaaaaaa"), "pc-c": p("pc-c", "bbbbbbb"), "pc-d": p("pc-d") } });
  assert.equal(commitDiffers(s, "pc-a"), 1);
  assert.equal(commitDiffers(s, "pc-c"), 2);
  assert.equal(commitDiffers(s, "pc-d"), 0, "a bot that doesn't say compares with nobody");
});