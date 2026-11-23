import { test } from "node:test";
import assert from "node:assert/strict";
import { BusActions } from "../src/live/actions.ts";
import { CLAIM_TYPE, CONTENT_KEY, DECISION_TYPE, type BusMessage } from "../src/core/protocol.ts";

interface Sent { kind: "send" | "state"; type: string; key?: string; content: Record<string, any> }

function fakeMatrix(delay = 0) {
  const sent: Sent[] = [];
  let n = 0;
  return {
    sent,
    matrix: {
      async send(_room: string, type: string, content: object) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        sent.push({ kind: "send", type, content: content as Record<string, any> });
        return `$sent${++n}`;
      },
      async putState(_room: string, type: string, key: string, content: object) {
        sent.push({ kind: "state", type, key, content: content as Record<string, any> });
        return `$state${++n}`;
      },
    },
  };
}

const handoff: BusMessage = { id: "$h", ts: 1, sender: "@claudeoli-pc-b:x", from: "pc-b/project-x", to: "pc-a/project-x", kind: "handoff", thread: "t-h", text: "Finish the 2.0 changelog" };

test("approve sends one decision, then one readable message, in that order", async () => {
  const f = fakeMatrix();
  await new BusActions(f.matrix, "!r:x", "Owner").approve(handoff);
  assert.equal(f.sent.length, 2);
  assert.deepEqual([f.sent[0].type, f.sent[0].content], [DECISION_TYPE, { v: 2, decision: "approve", ref: "$h", target: "pc-a/project-x" }]);
  assert.equal(f.sent[1].type, "m.room.message");
  assert.equal(f.sent[1].content.body, "Owner approved: Finish the 2.0 changelog");
  assert.equal(f.sent[1].content[CONTENT_KEY], undefined, "the readable line carries no bus block");
});

test("two approves before the first resolves send one decision", async () => {
  const f = fakeMatrix(20);
  const a = new BusActions(f.matrix, "!r:x", "Owner");
  const [x, y] = await Promise.all([a.approve(handoff), a.approve(handoff)]);
  assert.deepEqual([x, y], [true, false]);
  assert.equal(f.sent.filter((s) => s.type === DECISION_TYPE).length, 1);
});

test("a decision that was sent counts as sent even if the readable line fails", async () => {
  const sent: string[] = [];
  const m = {
    async send(_r: string, type: string) {
      if (type === "m.room.message") throw new Error("network blip");
      sent.push(type);
      return "$d";
    },
    async putState() { return "$s"; },
  };
  assert.equal(await new BusActions(m, "!r:x", "Owner").approve(handoff), true);
  assert.deepEqual(sent, [DECISION_TYPE]);
});

test("refuse sends a refuse decision", async () => {
  const f = fakeMatrix();
  await new BusActions(f.matrix, "!r:x", "Owner").refuse(handoff);
  assert.equal(f.sent[0].content.decision, "refuse");
  assert.equal(f.sent[1].content.body, "Owner refused: Finish the 2.0 changelog");
});

test("a reply to an ask is an answer in the same thread, replying to it", async () => {
  const f = fakeMatrix();
  const ask: BusMessage = { ...handoff, id: "$a", kind: "ask", from: "pc-c/server", to: "oli", thread: "t-a", text: "Restart now?" };
  await new BusActions(f.matrix, "!r:x", "Owner").reply(ask, "yes, restart");
  const c = f.sent[0].content;
  assert.deepEqual(c[CONTENT_KEY], { v: 2, from: "oli", to: "pc-c/server", kind: "answer", thread: "t-a", text: "yes, restart" });
  assert.equal(c.body, "pc-c/server: yes, restart");
  assert.deepEqual(c["m.relates_to"], { "m.in_reply_to": { event_id: "$a" } });
});

test("a reply to a chat is a chat", async () => {
  const f = fakeMatrix();
  await new BusActions(f.matrix, "!r:x", "Owner").reply({ ...handoff, kind: "chat" }, "thanks");
  assert.equal(f.sent[0].content[CONTENT_KEY].kind, "chat");
});

test("a new message starts a new thread", async () => {
  const f = fakeMatrix();
  await new BusActions(f.matrix, "!r:x", "Owner").send("pc-a", "status please");
  const b = f.sent[0].content[CONTENT_KEY];
  assert.match(b.thread, /^t-[0-9a-f]{8}$/);
  assert.equal(b.to, "pc-a");
  assert.equal(f.sent[0].content["m.relates_to"], undefined);
});

test("release clears the claim's state as the owner", async () => {
  const f = fakeMatrix();
  await new BusActions(f.matrix, "!r:x", "Owner").release({ key: "x:src/a.ts", holder: "pc-a/x", note: "", expires: 0 });
  assert.deepEqual(f.sent, [{ kind: "state", type: CLAIM_TYPE, key: "x:src/a.ts", content: {} }]);
});

test("sharing a project the first time makes its room, then records it in roles", async () => {
  const calls: string[] = [];
  let roles: any;
  const m = {
    async send() { return "$x"; },
    async putState(_r: string, type: string, _k: string, c: any) { calls.push(`state ${type}`); roles = c; return "$s"; },
    async createRoom(body: any) { calls.push(`create ${body.name} invite=${body.invite.join(",")}`); return "!px:x"; },
    async invite(room: string, user: string) { calls.push(`invite ${room} ${user}`); },
    async kick(room: string, user: string) { calls.push(`kick ${room} ${user}`); },
  };
  const a = new BusActions(m, "!r:x", "Owner");
  const base = { v: 2 as const, collaborators: false, projects: {}, users: { "@v:x": { level: "viewer" as const, projects: [], pcs: [] } } };
  const after = await a.share(base, "@v:x", "project-x", "@owner:x", ["@claudeoli-pc-a:x"]);
  assert.deepEqual(calls, ["create ClaudeOli · project-x invite=@claudeoli-pc-a:x,@v:x", "state org.claudeoli.roles"]);
  assert.equal(roles.projects["project-x"].room, "!px:x");
  assert.deepEqual(roles.users["@v:x"].projects, ["project-x"]);
  calls.length = 0;
  const after2 = await a.share({ ...after, users: { ...after.users, "@w:x": { level: "viewer", projects: [], pcs: [] } } }, "@w:x", "project-x", "@owner:x", []);
  assert.deepEqual(calls, ["state org.claudeoli.roles", "invite !px:x @w:x"]);
  calls.length = 0;
  await a.unshare(after2, "@w:x", "project-x");
  assert.deepEqual(calls, ["state org.claudeoli.roles", "kick !px:x @w:x"]);
});

test("text over the bus limit, or to a bad address, is refused before sending", async () => {
  const f = fakeMatrix();
  const a = new BusActions(f.matrix, "!r:x", "Owner");
  await assert.rejects(a.send("pc-a", "x".repeat(5000)), /4096/);
  await assert.rejects(a.send("Not An Address", "hi"), /address/);
  await assert.rejects(a.send("oli", "hi"), /address/);
  assert.equal(f.sent.length, 0);
});
