import { test } from "node:test";
import assert from "node:assert/strict";
import { SyncLoop, syncFilter } from "../src/live/loop.ts";
import { MatrixError, type SyncResponse } from "../src/live/matrix.ts";
import type { ConnState } from "../src/live/conn.ts";
import { DECISION_TYPE } from "../src/core/protocol.ts";

type Step = SyncResponse | Error;

/** A fake Matrix whose sync answers from a script, one step per call; then it hangs until released. */
function fake(steps: Step[]) {
  const calls: { since?: string }[] = [];
  let release: (() => void) | undefined;
  const matrix = {
    async sync(since: string | undefined): Promise<SyncResponse> {
      calls.push({ since });
      const step = steps.shift();
      if (step instanceof Error) throw step;
      if (step) return step;
      await new Promise<void>((r) => (release = r));
      return { next_batch: "late", rooms: { join: {} } };
    },
  };
  return { matrix, calls, release: () => release?.() };
}

const ok = (batch: string): SyncResponse => ({ next_batch: batch, rooms: { join: {} } });
const tick = () => new Promise((r) => setImmediate(r));

function run(steps: Step[], now = () => 1_000) {
  const f = fake(steps);
  const waits: number[] = [];
  const conns: ConnState[] = [];
  const loop = new SyncLoop({
    matrix: f.matrix as never,
    roomId: "!r:example.org",
    ctx: { ownerId: "@owner:example.org", serverName: "example.org" },
    onChange: (_s, c) => conns.push(c),
    now,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  return { loop, waits, conns, ...f };
}

test("three network failures back off 2, 4 and 8 s and stay offline since the first", async () => {
  let t = 1_000;
  const r = run([new Error("down"), new Error("down"), new Error("down")], () => (t += 10));
  r.loop.start();
  for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(r.waits, [2000, 4000, 8000]);
  const last = r.conns.at(-1)!;
  assert.equal(last.kind, "offline");
  assert.equal(last.kind === "offline" && last.since, 1_010);
  r.loop.stop();
});

test("backoff is capped at 60 s", async () => {
  const r = run(Array.from({ length: 8 }, () => new Error("down")));
  r.loop.start();
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(Math.max(...r.waits), 60_000);
  r.loop.stop();
});

test("a success after failures is ok, and the next sync passes since", async () => {
  const r = run([new Error("down"), ok("s1")]);
  r.loop.start();
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(r.loop.conn.kind, "ok");
  assert.deepEqual(r.calls.map((c) => c.since), [undefined, undefined, "s1"]);
  r.loop.stop();
});

test("an unknown token stops the loop as token-rejected", async () => {
  const r = run([new MatrixError(401, "M_UNKNOWN_TOKEN", "bad")]);
  r.loop.start();
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(r.loop.conn.kind, "token-rejected");
  assert.equal(r.calls.length, 1);
});

test("a sync that answers after stop() changes nothing", async () => {
  const r = run([ok("s1")]);
  r.loop.start();
  for (let i = 0; i < 5; i++) await tick();
  const before = r.conns.length;
  r.loop.stop();
  r.release();
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(r.conns.length, before);
});

test("pause(true) makes no new request until pause(false)", async () => {
  const r = run([ok("s1"), ok("s2"), ok("s3")]);
  r.loop.pause(true);
  r.loop.start();
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(r.calls.length, 0);
  r.loop.pause(false);
  for (let i = 0; i < 10; i++) await tick();
  assert.ok(r.calls.length >= 1);
  r.loop.stop();
});

test("the filter asks for the agents room and the bus's event types only", () => {
  const f = syncFilter("!r:x") as { room: { rooms: string[]; timeline: { types: string[] } } };
  assert.deepEqual(f.room.rooms, ["!r:x"]);
  assert.deepEqual(f.room.timeline.types, ["m.room.message", DECISION_TYPE]);
});
