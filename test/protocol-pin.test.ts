// The same test, with the same literal, lives in the bus repo (test/protocol-pin.test.ts).
// If either side changes an event type, kind, state or version, its own copy of this test fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_PIN } from "../src/core/protocol.ts";

test("protocol pin matches the bus", () => {
  assert.deepEqual(PROTOCOL_PIN, {
    types: ["org.claudeoli.v1", "org.claudeoli.claim", "org.claudeoli.presence", "org.claudeoli.decision", "org.claudeoli.roles"],
    kinds: ["chat", "ask", "answer", "handoff", "claim", "release", "status"],
    states: ["pending", "accepted", "approved", "refused", "picked-up", "done", "dropped", "expired"],
    v: 2,
  });
});
