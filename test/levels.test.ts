// The same test lives in both repos (the bus has src/shared/levels.ts, the dashboard src/core/levels.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { POWER, can, levelOf, parseRoles, projectOf } from "../src/core/levels.ts";

const OWNER = "@owner:example.org";
const roles = parseRoles({
  v: 2,
  collaborators: false,
  projects: { "project-x": { room: "!px:example.org" } },
  users: {
    "@viewer:example.org": { level: "viewer", projects: ["project-x"], pcs: ["pc-d"] },
    "@collab:example.org": { level: "collaborator", projects: ["project-x"], pcs: ["pc-e"] },
    "@odd:example.org": { level: "admin", projects: [], pcs: [] },
  },
});

test("parseRoles keeps known levels and drops the rest", () => {
  assert.ok(roles);
  assert.deepEqual(Object.keys(roles!.users).sort(), ["@collab:example.org", "@viewer:example.org"]);
  assert.equal(roles!.projects["project-x"].room, "!px:example.org");
  assert.equal(parseRoles("nonsense"), null);
  assert.equal(parseRoles(null), null);
});

test("levelOf: the owner is always owner, bot accounts are bots, others from roles", () => {
  assert.equal(levelOf(roles, OWNER, OWNER), "owner");
  assert.equal(levelOf(roles, "@claudeoli-pc-a:example.org", OWNER), "bot");
  assert.equal(levelOf(roles, "@viewer:example.org", OWNER), "viewer");
  assert.equal(levelOf(roles, "@stranger:example.org", OWNER), null);
  assert.equal(levelOf(null, "@viewer:example.org", OWNER), null);
});

test("a viewer can't decide or chat", () => {
  assert.equal(can("viewer", "decide", true), false);
  assert.equal(can("viewer", "chat", true), false);
});

test("a collaborator acts only while collaborators are switched on", () => {
  assert.equal(can("collaborator", "decide", false), false);
  assert.equal(can("collaborator", "decide", true), true);
  assert.equal(can("collaborator", "release-any", true), false);
  assert.equal(can("collaborator", "set-roles", true), false);
});

test("a bot never decides; the owner does everything", () => {
  assert.equal(can("bot", "decide", true), false);
  assert.equal(can("bot", "chat", false), true);
  for (const a of ["decide", "release-any", "release-own", "chat", "set-roles"] as const) assert.equal(can("owner", a, false), true);
  assert.equal(can(null, "chat", true), false);
});

test("power numbers", () => {
  assert.deepEqual(POWER, { owner: 100, collaborator: 30, viewer: 10, bot: 50 });
});

test("projectOf reads the folder of a session or the repo of a claim key", () => {
  assert.equal(projectOf("pc-a/project-x-2"), "project-x");
  assert.equal(projectOf("pc-a/project-x"), "project-x");
  assert.equal(projectOf("project-x:src/a.ts"), "project-x");
  assert.equal(projectOf("pc-a"), "");
});
