import { test } from "node:test";
import assert from "node:assert/strict";
import { applySync, emptyLive, handoffState, type LiveCtx } from "../src/core/live.ts";
import { CLAIM_TYPE, CONTENT_KEY, DECISION_TYPE, HANDOFF_WINDOW_MS, PRESENCE_TYPE } from "../src/core/protocol.ts";
import type { MatrixEvent } from "../src/live/matrix.ts";

const OWNER = "@owner:example.org";
const BOT_A = "@claudeoli-pc-a:example.org";
const BOT_B = "@claudeoli-pc-b:example.org";
const ctx: LiveCtx = { ownerId: OWNER, serverName: "example.org" };
let n = 0;
const ev = (e: Partial<MatrixEvent> & { type: string; sender: string; content: MatrixEvent["content"] }): MatrixEvent => ({
  event_id: `$e${++n}`,
  origin_server_ts: 1_000 + n,
  ...e,
});
const busMsg = (sender: string, block: Record<string, unknown>, extra: Partial<MatrixEvent> = {}) =>
  ev({ type: "m.room.message", sender, content: { msgtype: "m.text", body: "x", [CONTENT_KEY]: { v: 2, ...block } }, ...extra });

test("presence counts only for the sender's own PC, with version 1 by default", () => {
  const s = applySync(emptyLive(), [
    ev({ type: PRESENCE_TYPE, sender: BOT_A, state_key: "pc-b", content: { sessions: ["pc-b/x"], seen: 5 } }),
    ev({ type: PRESENCE_TYPE, sender: BOT_A, state_key: "pc-a", content: { sessions: ["pc-a/x"], seen: 7 } }),
  ], ctx);
  assert.deepEqual(Object.keys(s.presence), ["pc-a"]);
  assert.equal(s.presence["pc-a"].version, 1);
  assert.equal(s.presence["pc-a"].seen, 7);
});

test("presence version is read when present", () => {
  const s = applySync(emptyLive(), [ev({ type: PRESENCE_TYPE, sender: BOT_A, state_key: "pc-a", content: { v: 2, version: 2, sessions: [], seen: 7 } })], ctx);
  assert.equal(s.presence["pc-a"].version, 2);
});

test("a claim by pc-a's bot holding a pc-b session is ignored", () => {
  const s = applySync(emptyLive(), [ev({ type: CLAIM_TYPE, sender: BOT_A, state_key: "x:src/a.ts", content: { holder: "pc-b/x", note: "", expires: 9e12 } })], ctx);
  assert.deepEqual(s.claims, []);
});

test("the owner's clear removes a claim; someone else's doesn't", () => {
  let s = applySync(emptyLive(), [ev({ type: CLAIM_TYPE, sender: BOT_A, state_key: "x:src/a.ts", content: { holder: "pc-a/x", note: "n", expires: 9e12 } })], ctx);
  assert.equal(s.claims.length, 1);
  s = applySync(s, [ev({ type: CLAIM_TYPE, sender: BOT_B, state_key: "x:src/a.ts", content: {} })], ctx);
  assert.equal(s.claims.length, 1);
  s = applySync(s, [ev({ type: CLAIM_TYPE, sender: OWNER, state_key: "x:src/a.ts", content: {} })], ctx);
  assert.equal(s.claims.length, 0);
});

test("the holder's own bot can clear its claim", () => {
  let s = applySync(emptyLive(), [ev({ type: CLAIM_TYPE, sender: BOT_A, state_key: "k", content: { holder: "pc-a/x", expires: 9e12 } })], ctx);
  s = applySync(s, [ev({ type: CLAIM_TYPE, sender: BOT_A, state_key: "k", content: {} })], ctx);
  assert.equal(s.claims.length, 0);
});

test("bot messages are read from the block; a from on another PC is dropped", () => {
  const s = applySync(emptyLive(), [
    busMsg(BOT_A, { from: "pc-a/x", to: "oli", kind: "ask", thread: "t-1", text: "Restart?" }),
    busMsg(BOT_A, { from: "pc-b/x", to: "oli", kind: "ask", thread: "t-2", text: "forged" }),
  ], ctx);
  assert.deepEqual(s.messages.map((m) => m.text), ["Restart?"]);
  assert.equal(s.messages[0].kind, "ask");
});

test("the owner's messages are read from the block, or from a 'to: text' body", () => {
  const s = applySync(emptyLive(), [
    busMsg(OWNER, { from: "oli", to: "pc-a/x", kind: "answer", thread: "t-1", text: "yes" }),
    ev({ type: "m.room.message", sender: OWNER, content: { msgtype: "m.text", body: "pc-a/x: go ahead" } }),
    ev({ type: "m.room.message", sender: OWNER, content: { msgtype: "m.text", body: "Owner approved: Finish the changelog" } }),
  ], ctx);
  assert.deepEqual(s.messages.map((m) => [m.from, m.to, m.kind, m.text]), [
    ["oli", "pc-a/x", "answer", "yes"],
    ["oli", "pc-a/x", "chat", "go ahead"],
  ]);
});

test("a status from the owner is ignored; from a bot it is kept apart from messages", () => {
  const s = applySync(emptyLive(), [
    busMsg(BOT_B, { from: "pc-b/y", to: "pc-a/x", kind: "handoff", thread: "t", text: "h" }, { event_id: "$h" }),
    busMsg(OWNER, { from: "oli", to: "pc-a/x", kind: "status", thread: "t", text: "", ref: "$h", state: "approved" }),
    busMsg(BOT_A, { from: "pc-a", to: "pc-b/y", kind: "status", thread: "t", text: "approved", ref: "$h", state: "approved" }),
  ], ctx);
  assert.equal(s.statuses["$h"].state, "approved");
  assert.equal(s.messages.filter((m) => m.kind === "status").length, 0);
});

test("two statuses with the same timestamp resolve to the larger event id", () => {
  const s = applySync(emptyLive(), [
    busMsg(BOT_B, { from: "pc-b/y", to: "pc-a/x", kind: "handoff", thread: "t", text: "h" }, { event_id: "$h" }),
    busMsg(BOT_A, { from: "pc-a", to: "pc-b/y", kind: "status", thread: "t", text: "", ref: "$h", state: "picked-up" }, { event_id: "$b", origin_server_ts: 50 }),
    busMsg(BOT_A, { from: "pc-a", to: "pc-b/y", kind: "status", thread: "t", text: "", ref: "$h", state: "approved" }, { event_id: "$a", origin_server_ts: 50 }),
  ], ctx);
  assert.equal(s.statuses["$h"].state, "picked-up");
});

test("decisions count only from the owner", () => {
  const s = applySync(emptyLive(), [
    ev({ type: DECISION_TYPE, sender: BOT_A, content: { v: 2, decision: "approve", ref: "$h1", target: "pc-a/x" } }),
    ev({ type: DECISION_TYPE, sender: OWNER, content: { v: 2, decision: "refuse", ref: "$h2", target: "pc-a/x" } }),
  ], ctx);
  assert.deepEqual(Object.keys(s.decisions), ["$h2"]);
});

test("handoff state: pending, then expired after the window, else the latest status", () => {
  const s = applySync(emptyLive(), [busMsg(BOT_A, { from: "pc-a/x", to: "pc-b/y", kind: "handoff", thread: "t", text: "Finish it" }, { event_id: "$h", origin_server_ts: 0 })], ctx);
  assert.equal(handoffState(s, "$h", 1000), "pending");
  assert.equal(handoffState(s, "$h", HANDOFF_WINDOW_MS + 1), "expired");
  const t = applySync(s, [busMsg(BOT_B, { from: "pc-b", to: "pc-a/x", kind: "status", thread: "t", text: "", ref: "$h", state: "approved" })], ctx);
  assert.equal(handoffState(t, "$h", HANDOFF_WINDOW_MS + 1), "approved");
});

test("messages are capped at the newest 500", () => {
  const evs = Array.from({ length: 510 }, (_, i) => busMsg(BOT_A, { from: "pc-a/x", to: "all", kind: "chat", thread: "t", text: String(i) }));
  const s = applySync(emptyLive(), evs, ctx);
  assert.equal(s.messages.length, 500);
  assert.equal(s.messages[499].text, "509");
});

test("the same event twice is kept once", () => {
  const e = busMsg(BOT_A, { from: "pc-a/x", to: "all", kind: "chat", thread: "t", text: "hi" });
  const s = applySync(applySync(emptyLive(), [e], ctx), [e], ctx);
  assert.equal(s.messages.length, 1);
});

test("a status counts only from the bot of the handoff's target PC (expired also from its sender's)", () => {
  const h = busMsg(BOT_A, { from: "pc-a/x", to: "pc-b/y", kind: "handoff", thread: "t", text: "Finish it" }, { event_id: "$h2", origin_server_ts: 10 });
  const fromSender = busMsg(BOT_A, { from: "pc-a", to: "pc-a/x", kind: "status", thread: "t", text: "", ref: "$h2", state: "refused" }, { origin_server_ts: 20 });
  let s = applySync(emptyLive(), [h, fromSender], ctx);
  assert.equal(s.statuses["$h2"], undefined);
  s = applySync(s, [busMsg(BOT_A, { from: "pc-a", to: "pc-a/x", kind: "status", thread: "t", text: "", ref: "$h2", state: "expired" }, { origin_server_ts: 30 })], ctx);
  assert.equal(s.statuses["$h2"].state, "expired");
  s = applySync(s, [busMsg(BOT_B, { from: "pc-b", to: "pc-a/x", kind: "status", thread: "t", text: "", ref: "$h2", state: "approved" }, { origin_server_ts: 40 })], ctx);
  assert.equal(s.statuses["$h2"].state, "approved");
});

test("bot accounts in the room are listed from membership, joined or invited", () => {
  let s = applySync(emptyLive(), [
    ev({ type: "m.room.member", sender: OWNER, state_key: "@claudeoli-pc-z:example.org", content: { membership: "invite" } }),
    ev({ type: "m.room.member", sender: OWNER, state_key: "@someone:example.org", content: { membership: "join" } }),
    ev({ type: "m.room.member", sender: BOT_A, state_key: BOT_A, content: { membership: "join" } }),
  ], ctx);
  assert.deepEqual(s.bots.sort(), [BOT_A, "@claudeoli-pc-z:example.org"]);
  s = applySync(s, [ev({ type: "m.room.member", sender: OWNER, state_key: "@claudeoli-pc-z:example.org", content: { membership: "leave" } })], ctx);
  assert.deepEqual(s.bots, [BOT_A]);
});
test("presence carries the commit and branch the bot runs, when it says", () => {
  const s = applySync(emptyLive(), [ev({ type: PRESENCE_TYPE, sender: BOT_A, state_key: "pc-a", content: { v: 2, version: 2, sessions: [], seen: 7, commit: "abc1234", branch: "main" } })], ctx);
  assert.equal(s.presence["pc-a"].commit, "abc1234");
  assert.equal(s.presence["pc-a"].branch, "main");
});