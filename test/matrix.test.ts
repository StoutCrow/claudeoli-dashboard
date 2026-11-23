import { test } from "node:test";
import assert from "node:assert/strict";
import { Matrix, MatrixError, type Http, type HttpRequest } from "../src/live/matrix.ts";

function recorder(reply: (req: HttpRequest) => { status: number; json: unknown } = () => ({ status: 200, json: {} })) {
  const calls: HttpRequest[] = [];
  const http: Http = async (req) => {
    calls.push(req);
    return reply(req);
  };
  return { calls, http };
}

test("login posts a password login and returns the new session", async () => {
  const { calls, http } = recorder(() => ({ status: 200, json: { access_token: "tok", user_id: "@owner:example.org", device_id: "DEV" } }));
  const m = new Matrix(http, "https://hs.example.org/");
  const r = await m.login("owner", "pw", "ClaudeOli dashboard · desk");
  assert.deepEqual(r, { token: "tok", userId: "@owner:example.org", deviceId: "DEV" });
  assert.equal(calls[0].url, "https://hs.example.org/_matrix/client/v3/login");
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(JSON.parse(calls[0].body!), {
    type: "m.login.password",
    identifier: { type: "m.id.user", user: "owner" },
    password: "pw",
    initial_device_display_name: "ClaudeOli dashboard · desk",
  });
  assert.equal(calls[0].headers?.Authorization, undefined);
});

test("the token goes only in the Authorization header", async () => {
  const { calls, http } = recorder(() => ({ status: 200, json: { user_id: "@owner:example.org" } }));
  await new Matrix(http, "https://hs.example.org", "secret-token").whoami();
  assert.equal(calls[0].headers?.Authorization, "Bearer secret-token");
  assert.ok(!calls[0].url.includes("secret-token"));
});

test("an unknown token throws a MatrixError with its errcode", async () => {
  const { http } = recorder(() => ({ status: 401, json: { errcode: "M_UNKNOWN_TOKEN", error: "Invalid token" } }));
  await assert.rejects(new Matrix(http, "https://hs.example.org", "t").whoami(), (e: unknown) => e instanceof MatrixError && e.errcode === "M_UNKNOWN_TOKEN" && e.status === 401);
});

test("send PUTs to the room with ids URL-encoded", async () => {
  const { calls, http } = recorder(() => ({ status: 200, json: { event_id: "$e1" } }));
  const id = await new Matrix(http, "https://hs.example.org", "t").send("!room:example.org", "org.claudeoli.decision", { v: 2 }, "txn 1");
  assert.equal(id, "$e1");
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].url, "https://hs.example.org/_matrix/client/v3/rooms/!room%3Aexample.org/send/org.claudeoli.decision/txn%201");
});

test("putState with an empty key ends the path with a slash", async () => {
  const { calls, http } = recorder(() => ({ status: 200, json: { event_id: "$s" } }));
  await new Matrix(http, "https://hs.example.org", "t").putState("!r:x", "org.claudeoli.roles", "", {});
  assert.equal(calls[0].url, "https://hs.example.org/_matrix/client/v3/rooms/!r%3Ax/state/org.claudeoli.roles/");
});

test("sync passes since, timeout and the filter as query parameters", async () => {
  const { calls, http } = recorder(() => ({ status: 200, json: { next_batch: "s2", rooms: {} } }));
  const r = await new Matrix(http, "https://hs.example.org", "t").sync("s1", 30000, { room: { rooms: ["!r:x"] } });
  assert.equal(r.next_batch, "s2");
  const u = new URL(calls[0].url);
  assert.equal(u.pathname, "/_matrix/client/v3/sync");
  assert.equal(u.searchParams.get("since"), "s1");
  assert.equal(u.searchParams.get("timeout"), "30000");
  assert.deepEqual(JSON.parse(u.searchParams.get("filter")!), { room: { rooms: ["!r:x"] } });
});

test("a network failure rejects (not a MatrixError)", async () => {
  const http: Http = async () => {
    throw new Error("net::ERR_CONNECTION_REFUSED");
  };
  await assert.rejects(new Matrix(http, "https://hs.example.org", "t").whoami(), (e: unknown) => !(e instanceof MatrixError));
});

test("findAgentsRoom picks the joined room named ClaudeOli agents", async () => {
  const { http } = recorder((req) => {
    if (req.url.endsWith("/joined_rooms")) return { status: 200, json: { joined_rooms: ["!a:x", "!b:x"] } };
    if (req.url.includes("!a%3Ax")) return { status: 200, json: { name: "Other" } };
    return { status: 200, json: { name: "ClaudeOli agents" } };
  });
  assert.equal(await new Matrix(http, "https://hs.example.org", "t").findAgentsRoom(), "!b:x");
});
