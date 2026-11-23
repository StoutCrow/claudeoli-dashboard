import { test } from "node:test";
import assert from "node:assert/strict";
import { levelChanges, levelsFor, projectRoomBody, rolesAfter } from "../src/core/rooms.ts";
import { parseRoles } from "../src/core/levels.ts";

const OWNER = "@owner:example.org";
const BOT = "@claudeoli-pc-a:example.org";
const base = parseRoles({ v: 2, collaborators: false, projects: {}, users: { "@viewer:example.org": { level: "viewer", projects: [], pcs: ["pc-d"] } } })!;

test("sharing a project adds it once; unsharing removes it", () => {
  const a = rolesAfter(base, { user: "@viewer:example.org", share: "project-x" });
  const b = rolesAfter(a, { user: "@viewer:example.org", share: "project-x" });
  assert.deepEqual(b.users["@viewer:example.org"].projects, ["project-x"]);
  assert.ok("project-x" in b.projects);
  const c = rolesAfter(b, { user: "@viewer:example.org", unshare: "project-x" });
  assert.deepEqual(c.users["@viewer:example.org"].projects, []);
});

test("a new person gets a level; the original roles are not changed", () => {
  const r = rolesAfter(base, { user: "@new:example.org", level: "viewer", pcs: ["pc-f"] });
  assert.deepEqual(r.users["@new:example.org"], { level: "viewer", projects: [], pcs: ["pc-f"] });
  assert.equal("@new:example.org" in base.users, false);
});

test("a project room: unencrypted v11, owner 100, bots 50, viewers can't post (events_default 30)", () => {
  const body = projectRoomBody("project-x", OWNER, [BOT], { "@viewer:example.org": "viewer" }) as Record<string, any>;
  assert.equal(body.room_version, "11");
  assert.equal(body.name, "ClaudeOli · project-x");
  assert.equal(body.initial_state.some((s: { type: string }) => s.type === "m.room.encryption"), false);
  const pl = body.power_level_content_override;
  assert.deepEqual(pl.users, { [OWNER]: 100, [BOT]: 50, "@viewer:example.org": 10 });
  assert.equal(pl.users_default, 0);
  assert.equal(pl.events_default, 30);
  assert.equal(pl.invite, 100);
});

test("room levels: the same rules as the bus repo's room.ts", () => {
  const before = { users: { [OWNER]: 100, [BOT]: 50 }, users_default: 50, events: {} };
  const after = levelsFor(before, OWNER, [BOT, "@claudeoli-pc-b:example.org"]);
  assert.deepEqual(after.users, { [OWNER]: 100, [BOT]: 50, "@claudeoli-pc-b:example.org": 50 });
  assert.equal(after.users_default, 0);
  assert.equal(after.events["org.claudeoli.decision"], 100);
  assert.equal(levelsFor(before, OWNER, [], true).events["org.claudeoli.decision"], 30);
  assert.ok(levelChanges(before, after).includes("users_default 50 → 0"));
  assert.deepEqual(levelChanges(after, after), []);
});
