// User levels, kept in the agents room's org.claudeoli.roles state (power 100 to set), so the server
// and the bots enforce them, not the plugin. The same file is in both repos (bus: src/shared/levels.ts).
// Pure: no imports.

export type Level = "owner" | "collaborator" | "viewer" | "bot";
export type Action = "decide" | "release-any" | "release-own" | "chat" | "set-roles";

export interface RoleEntry {
  level: Level;
  /** Shared projects this person can see. */
  projects: string[];
  /** PCs that are theirs (their sessions are the ones they may decide for). */
  pcs: string[];
}

export interface Roles {
  v: 2;
  /** Off for now: collaborators are coded but can't act until this is true. */
  collaborators: boolean;
  /** Shared projects, each with its own room once it is shared. */
  projects: Record<string, { room?: string }>;
  users: Record<string, RoleEntry>;
}

/** Matrix power per level. Viewers sit at 10, below the project rooms' events_default of 30. */
export const POWER: Record<Level, number> = { owner: 100, collaborator: 30, viewer: 10, bot: 50 };

const PEOPLE_LEVELS: readonly string[] = ["collaborator", "viewer"];
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export function parseRoles(content: unknown): Roles | null {
  if (!isObj(content)) return null;
  const users: Record<string, RoleEntry> = {};
  for (const [id, e] of Object.entries(isObj(content.users) ? content.users : {})) {
    if (!isObj(e) || !PEOPLE_LEVELS.includes(String(e.level))) continue;
    users[id] = { level: e.level as Level, projects: strings(e.projects), pcs: strings(e.pcs) };
  }
  const projects: Record<string, { room?: string }> = {};
  for (const [name, p] of Object.entries(isObj(content.projects) ? content.projects : {})) {
    projects[name] = isObj(p) && typeof p.room === "string" ? { room: p.room } : {};
  }
  return { v: 2, collaborators: content.collaborators === true, projects, users };
}

export function levelOf(roles: Roles | null, userId: string, ownerId: string): Level | null {
  if (userId === ownerId) return "owner";
  if (/^@claudeoli-[a-z0-9-]+:/.test(userId)) return "bot";
  return roles?.users[userId]?.level ?? null;
}

export function can(level: Level | null, action: Action, collaboratorsOn: boolean): boolean {
  switch (level) {
    case "owner":
      return true;
    case "collaborator":
      return collaboratorsOn && (action === "decide" || action === "release-own" || action === "chat");
    case "bot":
      return action === "release-own" || action === "chat";
    default:
      return false;
  }
}

/** The project of a session ("pc/folder", "-2" suffix dropped) or of a claim key ("repo:path"); "" for a bare PC. */
export function projectOf(sessionOrKey: string): string {
  const colon = sessionOrKey.indexOf(":");
  if (colon >= 0) return sessionOrKey.slice(0, colon);
  const slash = sessionOrKey.indexOf("/");
  return slash < 0 ? "" : sessionOrKey.slice(slash + 1).replace(/-\d+$/, "");
}
