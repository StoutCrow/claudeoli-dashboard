# ClaudeOli dashboard implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Obsidian plugin ("ClaudeOli") that shows the owner's Claude Code fleet in one tab: vault notes always, the agent bus's Matrix room when the homeserver answers. Actions are sent from the owner's own Matrix account and verified by the bots.

**Architecture:**
- Pure modules hold every decision and are tested with `node --test`: table parsing, vault model, "Needs you", protocol, live state, levels and the row-edit guard.
- Two thin Obsidian layers sit on top: a view and a settings tab.
- Matrix HTTP goes through one injected `Http` function: `requestUrl` in the plugin, a fake in tests and in the harness.
- Bus changes are made in the private bus repo, in a separate worktree.

**Tech stack:** TypeScript, esbuild, Obsidian API (`minAppVersion` 1.13.0), Node 26 test runner with type stripping, `eslint-plugin-obsidianmd`.

**Spec:** `docs/superpowers/specs/2026-11-23-dashboard-design.md` in the private repo `StoutCrow/claudeoli`. It builds on `2026-11-22-agent-bus-design.md` in the same folder. Read both before any task.

## Global constraints

- Public repo. No PC names, Windows user names or paths, tailnet name, Matrix user IDs, vault or world names, in code, tests, fixtures, docs or this plan. Examples use `pc-a`, `pc-b`, `pc-a/project-x`, `@owner:example.org`, `@claudeoli-pc-a:example.org`.
- UI copy never names the server PC. The offline line is "`<label>` offline since HH:MM. Showing the vault only.", where `<label>` is a local setting (default "Server").
- `manifest.json`: id `claudeoli-dashboard`, name `ClaudeOli`, `minAppVersion` `1.13.0`, `isDesktopOnly: false`, author `Oli_G`, authorUrl `https://github.com/StoutCrow`. The description ends "Written entirely by AI (Claude)."
- Mobile-safe:
  - no Node modules in `src/`;
  - HTTP only through `requestUrl`;
  - random ids from `window.crypto`;
  - no `innerHTML` or `outerHTML`;
  - window, document and workspace listeners through `registerEvent` / `registerDomEvent`, intervals through `registerInterval`;
  - one-shot timers tracked and cleared in `onClose`;
  - no `detachLeavesOfType` in `onunload`.
- Secrets:
  - Keep the access token, homeserver URL, user ID and agents room ID only in `app.saveLocalStorage` (already per vault). Never put them in `data.json`.
  - Throw the password away after login.
  - Never log a token.
- `data.json` (synced) holds only: note paths, `ownerName`, display options.
- JSON files are written without a byte-order mark. `manifest.json` starts with byte 123.
- Pure modules (`src/core/**`) import nothing from `obsidian` and use `.ts` import extensions. The tsconfig sets `allowImportingTsExtensions`, `noEmit` and `erasableSyntaxOnly`, so `node --test` runs them directly.
- Vault paths use forward slashes. Default note paths:
  - `CLAUDE/Setup/Setup Machines.md`
  - `CLAUDE/Setup/Setup Open work.md`
  - `CLAUDE/Setup/Sessions/` (one `<PC>.md` per PC)
  - `Guides/Session handoff.md`
  - `Guides/Coordination board.md`

  Each path is a setting.
- Cost:
  - Nothing runs while the view is closed.
  - While it's open: one `/sync` long-poll (`timeout=30000`), vault re-reads on `vault.on("modify")` for watched paths only, and one 60 s `registerInterval` that repaints age labels.
  - On failure, back off 2 s, doubling to 60 s.
  - Pause while `document.visibilityState === "hidden"`.
- Look:
  - Use `~/.claude/skills/unslop-design/SKILL.md` and UniverseView's `src/render/common.ts` patterns, with the prefix `co-`.
  - Radius tokens `--co-r-sm/md/lg`.
  - Obsidian colour variables only.
  - No `!important`: append `:not(#co-strong)` instead.
  - Targets at least 32 px, body text at Obsidian's size, sentence case.
- Words: states `next` / `claimed` / `in progress` / `review` / `done` / `blocked`; dates YYYY-MM-DD; people `name@pc`.
- Commits:
  - Author `Oli_G <87881301+StoutCrow@users.noreply.github.com>`, set per command through `GIT_AUTHOR_*` / `GIT_COMMITTER_*`.
  - Write the message to a file and use `git commit -F`.
  - End it with `Co-Authored-By: <model that wrote it> <noreply@anthropic.com>`.
- Before every commit, run `node scripts/check-names.mjs`. It reads a names list from the path in `CO_NAMES_FILE`, kept outside the repo, and fails on any hit in tracked files.
- Every push, tag, release and repo-setting change needs the owner's yes at that moment.

## Review focus

1. **Table cells with pipes or markup.** Covers `\|`, `[[note\|alias]]`, `` `a|b` `` and `**bold**`. Also rows with fewer or more cells than the header, and blank lines inside a table. Each parses to the right cells, with unknown columns kept. Tests in Task 2.
2. **A row changed by Sync between render and click.** The edit refuses with "This row changed; reload" and writes nothing. If the note is missing or renamed, the section shows its empty state. Tests in Tasks 3 and 17.
3. **Signed-out versus offline.** A 401 or `M_UNKNOWN_TOKEN` (signed out from Element X or Cinny) shows "Signed out on this device", not offline. A network error shows the offline line with its since-time. Tests in Task 10.
4. **Forged room state.** Presence counts only when `state_key` equals the sender's bot PC. A claim counts only when its holder's PC equals the sender's bot PC, or it is a clear (empty content) sent by the owner. Decisions count only from the owner. These are the bots' own rules, so any room member can't spoof the display. Tests in Task 9.
5. **Double-clicked Approve, and statuses at the same timestamp.**
   - A second click while a decision is in flight sends nothing.
   - The latest status is chosen by `origin_server_ts`, then by `event_id`.
   - Both repos use the same rule.

   Tests in Tasks 9, 13 and 16.

---

## File structure

```
claudeoli-dashboard/
  manifest.json  versions.json  package.json  tsconfig.json  esbuild.config.mjs  eslint.config.mjs  version-bump.mjs
  README.md  LICENSE  .gitignore  .gitattributes  styles.css (built)
  .github/  CODEOWNERS  dependabot.yml  workflows/ci.yml  (workflows/release.yml in Task 21)
  src/
    main.ts                 plugin: view type, command, ribbon, settings load/save, local secrets
    core/                   pure, node-tested
      tables.ts             markdown table parse + row match/replace
      vault.ts              notes text -> VaultModel
      protocol.ts           bus types, kinds, v, content shapes (mirrors the bus repo)
      live.ts               sync responses -> LiveState (sender checks, statuses)
      needs.ts              VaultModel + LiveState -> NeedsItem[]
      levels.ts             org.claudeoli.roles parse + can()
      edits.ts              vault row edits (setup to Done, board answer)
      time.ts               ages ("3 min"), today()
    live/
      matrix.ts             Matrix client over Http
      loop.ts               sync loop, backoff, pause, connection state
    ui/
      common.ts             el, icon, iconButton, toggleChip, dropdown, setPressed, emptyState, helpTip, clickNotice, segmented, hashColor
      view.ts               DashboardView (ItemView): layout, section list, toolbar, banner
      sections/needs.ts  sessions.ts  devices.ts  claims.ts  work.ts  messages.ts  people.ts  settings.ts
      settings-tab.ts       PluginSettingTab: sign-in, note paths
      signin.ts             sign-in modal
    styles.css
  test/*.test.ts            node --test
  dev/harness.ts  dev/obsidian-mock.ts  dev/harness.html  dev/build-harness.mjs  dev/fixtures/*.md  dev/fake-sync.ts
  scripts/install.ps1  scripts/check-names.mjs  scripts/check-mobile.mjs
```

---

## Phase 0: repo

### Task 1: Repo skeleton, local first

**Files:** everything at the top level of the tree above, plus `test/manifest.test.ts`, `scripts/check-names.mjs` and `scripts/check-mobile.mjs`.

- [ ] **Step 1: Write the failing test** `test/manifest.test.ts`:
  - `manifest.json` byte 0 is 123;
  - `manifest.version` is a key in `versions.json`, mapped to `manifest.minAppVersion`;
  - `manifest.id === "claudeoli-dashboard"` and `isDesktopOnly === false`;
  - `package.json` version equals the manifest version.
- [ ] **Step 2: Run** `node --test test/`. Expected: FAIL (no manifest).
- [ ] **Step 3: Add the files.**
  - Copy these from UniverseView, adjusted:
    - `package.json` (scripts `test: node --test test/`, `build`, `lint`, `harness`; devDependencies `esbuild`, `eslint`, `eslint-plugin-obsidianmd`, `typescript-eslint`, `@eslint/js`, `@eslint/json`, `obsidian ^1.14.4`, `typescript ^5.9`, `@types/node`);
    - `version-bump.mjs`;
    - `esbuild.config.mjs` (entry `src/main.ts`; `styles.css` copied from `src/styles.css`);
    - `eslint.config.mjs` (brand "ClaudeOli"; ignore `dev/**`, `scripts/**`, `test/**`);
    - `ci.yml` (Node `26.x`; job name `test`; `npm ci`, `npm test`, `npm run build`, `npm run lint`, `node scripts/check-mobile.mjs`);
    - `dependabot.yml`;
    - `CODEOWNERS` (`* @StoutCrow`).
  - Write a README that opens with the AI disclosure ("Written entirely by AI (Claude).") and says this is a personal tool, not in the community directory.
  - Add an MIT LICENSE.
  - `.gitignore`: `node_modules/`, `main.js`, `dev/out/`, `dev/*.local.*`.
  - `.gitattributes`: `* text=auto eol=lf`.
  - Version `0.1.0`.
- [ ] **Step 4: Write** `scripts/check-mobile.mjs`. It exits 1, listing file:line, on any of these in `src/`:
  - `from "fs"`, `"path"`, `"crypto"`, `"child_process"`, `"node:`;
  - `innerHTML`, `outerHTML`;
  - `fetch(`;
  - `window.addEventListener`, `document.addEventListener`;
  - `setInterval(`;
  - `setTimeout(` outside `src/live/loop.ts` and `src/ui/common.ts`;
  - `detachLeavesOfType`.
- [ ] **Step 5: Write** `scripts/check-names.mjs`. It reads `process.env.CO_NAMES_FILE` (one word per line). If the variable is unset it exits 2 with "set CO_NAMES_FILE". It runs `git ls-files`, searches each tracked file case-insensitively, and exits 1 listing the hits.
  - Then create the names list *outside* the repo, at `..\claudeoli-dashboard.names.txt` (beside the repo folder). It holds the PC names, Windows user names, tailnet suffix, Matrix server name, vault and world names (read them from the vault's Setup Machines note).
- [ ] **Step 6: Run the checks.** `npm ci; node --test test/; node scripts/check-mobile.mjs; node scripts/check-names.mjs`. Expected: all pass.
- [ ] **Step 7: Commit** (local only). Message: `chore: plugin skeleton, CI, checks`.
- [ ] **Step 8: Gated on the owner's yes, in this order.**
  1. `gh repo create StoutCrow/claudeoli-dashboard --public --source . --remote origin` (no push).
  2. `git push -u origin main`.
  3. Read UniverseView's rulesets: `gh api repos/StoutCrow/universe-view/rulesets`, then `gh api repos/StoutCrow/universe-view/rulesets/<id>` for each.
  4. Create the same two rulesets with `gh api -X POST repos/StoutCrow/claudeoli-dashboard/rulesets --input <file>`:
     - **main:** deletion, non_fast_forward, pull_request, and required_status_checks with context `test`.
     - **tags:** `refs/tags/*`, covering creation, update and deletion.
     - Both: bypass for the admin role only.
  5. Check with `gh api repos/StoutCrow/claudeoli-dashboard/rulesets`.

  From here on, every change reaches `main` through a PR.

---

## Phase 1: vault layer and offline banner

### Task 2: Table parser (`src/core/tables.ts`)

**Interfaces, produces:**
- `interface Table { heading: string; header: string[]; rows: Row[]; startLine: number; endLine: number }`
- `interface Row { cells: string[]; line: number; raw: string }`
- `parseTables(text: string): Table[]`: every GFM table, each with the nearest `##` heading above it.
- `tableUnder(text: string, heading: string): Table | undefined`.
- `cell(row: Row, table: Table, column: string): string`: `""` when the column is missing.
- `rowKey(row: Row): string`: the first three cells, trimmed and joined with `\u0001`.
- `splitRow(line: string): string[]`: splits on `|` except an escaped `\|`, a pipe inside `[[…]]` or a pipe inside backticks. Strips the outer pipes and trims each cell.

- [ ] **Step 1: Write the failing tests** `test/tables.test.ts`:
  - `splitRow("| a | b \\| c | [[n\\|alias]] | `x|y` |")` deep-equals `["a", "b \\| c", "[[n\\|alias]]", "`x|y`"]`;
  - a short row is padded to the header length with `""`;
  - an extra cell is kept (`cells.length` 4 under a 3-column header);
  - a blank line ends a table;
  - two tables under `## Queue` and `## Done` give headings `"Queue"` and `"Done"`;
  - `rowKey` of `| 2026-01-01 | pc-a | Task |…` is `"2026-01-01\u0001pc-a\u0001Task"`;
  - `**bold**` is kept as-is in the cell.
- [ ] **Step 2: Run** `node --test test/tables.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `tables.ts`. Scan lines; a header row followed by a `|---|` separator starts a table.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: markdown table parser`.

### Task 3: Vault model (`src/core/vault.ts`)

**Interfaces:**
- Consumes Task 2.
- Produces:
  - `interface NotePaths { machines: string; openWork: string; sessionsDir: string; handoff: string; board: string }`
  - `DEFAULT_PATHS: NotePaths` (the defaults in Global constraints)
  - `interface VaultModel { machines: Table | null; tools: Table | null; hooks: Table | null; queue: Table | null; done: Table | null; now: Table | null; log: Table | null; work: Table | null; messages: Table | null; decisions: string[]; sessionLogs: Record<string, Table>; missing: string[] }`
  - `readVault(files: Record<string, string | undefined>, paths: NotePaths): VaultModel`, where `files` maps path to text.
  - The table headings it looks for: Machines → `"Machines"`, Tools → `"Tools"`, Hooks → heading starting `"Sync hooks"`; open work → `"Queue"`, `"Done"`; handoff → `"Now"`, heading starting `"Log"`; board → `"Work"`, `"Messages"`, plus the `"Decisions"` bullet lines.

- [ ] **Step 1: Write the failing tests** `test/vault.test.ts`, using fixtures in `dev/fixtures/` (copies of the real notes' shapes with `pc-a`/`pc-b` data):
  - every table is found;
  - a missing note path appears in `missing` and its tables are `null`;
  - `sessionLogs` is keyed by file basename (`"pc-a"`);
  - `decisions[0]` is the first `- ` line under `## Decisions`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `readVault`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: vault model from known notes`.

### Task 4: Needs you, vault half (`src/core/needs.ts`, `src/core/time.ts`)

**Interfaces, produces:**
- `type NeedsKind = "handoff" | "ask" | "claim" | "setup" | "board-work" | "board-message"`
- `interface NeedsItem { kind: NeedsKind; source: "vault" | "live"; title: string; detail: string; ts?: number; ref: string; action?: "approve-refuse" | "reply" | "release" | "setup-done" | "board-answer" }`
- `needsFromVault(v: VaultModel, ownerName: string): NeedsItem[]`
- `age(ms: number): string` (`"20 s"`, `"3 min"`, `"2 h"`, `"4 d"`)
- `today(d = new Date()): string`

`needsFromVault` returns:
- setup Queue rows whose Owner contains `ownerName` and whose State isn't `done`, with action `setup-done` and `ref` = `rowKey`;
- board Work rows whose Owner contains `ownerName` and whose State is `review` or `blocked`, with no action;
- board Messages rows whose To contains `ownerName` and whose Answer is empty, with action `board-answer`.

Live kinds are added in Task 11.

- [ ] **Step 1: Write the failing tests:**
  - `ownerName "owner"` with a fixture queue row `| pc-a | Back up | owner (user) | next | |` gives one `setup` item;
  - a row owned by `pc-b agent` gives none;
  - an answered message gives none;
  - `age(20_000) === "20 s"`, `age(180_000) === "3 min"`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: needs-you items from the vault`.

### Task 5: Plugin shell and read-only sections

**Files:** `src/main.ts`, `src/ui/common.ts`, `src/ui/view.ts`, `src/ui/sections/*.ts` (all but people), `src/ui/settings-tab.ts`, `src/styles.css`.

**Interfaces, produces:**
- `class ClaudeOliPlugin extends Plugin`, with:
  - `settings: Settings`, where `Settings = { paths: NotePaths; ownerName: string; serverLabel: string; deviceLabel: string }`. `serverLabel` and `deviceLabel` are read from local storage, not from `data.json`.
  - `local: LocalStore`, where `LocalStore = { get(): LocalSecrets | null; set(s: LocalSecrets | null): void }` and `LocalSecrets = { homeserver: string; userId: string; token: string; deviceId: string; roomId: string }`. Kept under the key `claudeoli-dashboard:signin`.
  - `vaultModel(): Promise<VaultModel>`, read with `vault.cachedRead`.
- View type `claudeoli-dashboard`, command "Open dashboard", ribbon icon `layout-dashboard`.
- `DashboardView` renders:
  - the header line ("live: … · vault: read HH:MM");
  - the section list: Needs you (with a count), Sessions, Devices, Claims, Work, Messages, People, Settings. On widths under 600 px it becomes a `dropdown` picker in the header.
  - the selected section;
  - the banner area.
- `render<Section>(el: HTMLElement, ctx: SectionCtx)`, where `SectionCtx = { vault: VaultModel; live: LiveState | null; conn: ConnState; plugin: ClaudeOliPlugin; act: Actions }`. `LiveState` and `ConnState` are stubbed as `null` and `{ kind: "signed-out" }` until Phase 2; `Actions` is an empty object until Phase 3.

Steps:
- [ ] **Step 1:** Copy `el`, `icon` (with its fallbacks), `iconButton`, `toggleChip`, `dropdown`, `setPressed`, `emptyState`, `helpTip`, `clickNotice` and `hashColor` from UniverseView's `render/common.ts` into `src/ui/common.ts`. Rename `universeview-` to `co-`. Add `segmented(parent, options, value, onChange)`, modelled on `universeview-segmented`.
- [ ] **Step 2:** Write `main.ts`: load and save settings (`data.json` gets `paths` and `ownerName` only). Re-read on `vault.on("modify" | "rename" | "delete")` only for paths under the watched notes, debounced through one `requestAnimationFrame`.
- [ ] **Step 3:** Write each section, reading only the vault:
  - Sessions: the Now table and the last 5 rows of each session log, or "No session log on this PC yet".
  - Devices: the Machines, Tools and Hooks rows per PC.
  - Claims: the empty state "No claims right now", or "Sign in on this device to see live activity".
  - Work: Queue and Work rows with PC, project and owner `toggleChip` filters.
  - Messages: the board Messages rows.
  - Settings: what's read, and the sign-in state.
- [ ] **Step 4:** Mark every row "vault" with its note's mtime age, and give each PC a `hashColor` dot.
- [ ] **Step 5:** When live isn't configured, show the banner "Not signed in on this device. Showing the vault only." with a "Sign in" button.
- [ ] **Step 6:** Run `npm run build; npm run lint; node scripts/check-mobile.mjs`. Expected: clean.
- [ ] **Step 7: Commit.** `feat: dashboard view with vault sections`.

### Task 6: Sign-in (`src/live/matrix.ts`, `src/ui/signin.ts`)

**Interfaces, produces:**
- `type Http = (req: { url: string; method: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; json: any }>`
- `httpObsidian: Http`: `requestUrl` with `throw: false`. A network failure rejects.
- `class MatrixError extends Error { status: number; errcode: string }`
- `class Matrix { constructor(http: Http, homeserver: string, token?: string) }`, with methods:
  - `login(user, password, deviceName): Promise<{ token: string; userId: string; deviceId: string }>`
  - `logout(): Promise<void>`
  - `whoami(): Promise<string>`
  - `joinedRooms(): Promise<string[]>`
  - `roomName(roomId): Promise<string | null>`
  - `sync(since: string | undefined, timeoutMs: number, filter: object): Promise<SyncResponse>`
  - `send(roomId, type, content, txnId): Promise<string>`
  - `putState(roomId, type, stateKey, content): Promise<string>`
  - `invite`, `kick`, `createRoom`, `getState(roomId)` (used in Phase 5)
- The device name is `ClaudeOli dashboard · <deviceLabel>`. The agents room is the joined room named `ClaudeOli agents`; if none is found, the sign-in modal asks for a room id.

Steps:
- [ ] **Step 1: Write the failing tests** `test/matrix.test.ts`, with a recording fake `Http`:
  - `login` posts `{type:"m.login.password", identifier:{type:"m.id.user", user}, password, initial_device_display_name}` to `/_matrix/client/v3/login`;
  - the token goes only in the `Authorization: Bearer` header, never in the URL;
  - a 401 with `M_UNKNOWN_TOKEN` throws a `MatrixError` with that errcode;
  - `send` uses `PUT /rooms/{id}/send/{type}/{txnId}` with ids URL-encoded.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5:** Write the sign-in modal. It asks for the homeserver URL, the user id and the password (a `type=password` input). It calls `login`, finds the room, saves `LocalSecrets` and clears the password field. "Sign out on this device" calls `logout`, then `local.set(null)`, and clears local storage even if `logout` fails.
- [ ] **Step 6: Commit.** `feat: Matrix sign-in kept on the device`.

### Task 7: Browser harness

**Files:** `dev/obsidian-mock.ts`, `dev/harness.ts`, `dev/harness.html`, `dev/build-harness.mjs`, `dev/fake-sync.ts`.

- [ ] **Step 1:** Write a slim mock. Follow UniverseView's `dev/obsidian-mock.ts` approach, but cover only what this plugin imports: `Plugin`, `ItemView`, `WorkspaceLeaf`, `PluginSettingTab`, `Setting`, `Modal`, `Notice`, `Menu`, `setIcon` (Lucide from `node_modules`), `Platform`, `requestUrl`, `TFile`, and a `vault` and `app.saveLocalStorage` kept in memory.
  - `createEl`, `createDiv`, `addClass`, `toggleClass` and `setText` go on `HTMLElement.prototype`.
- [ ] **Step 2:** `build-harness.mjs` bundles `dev/fixtures/` as the vault, aliases `obsidian` to the mock, and serves on port 5179.
  - Query flags:
    - `?theme=dark` (body class `theme-dark`);
    - `?zoom=1.5` (`document.documentElement.style.zoom`);
    - `?live=ok|offline|signedout`, where `fake-sync.ts` answers as a fake `Http`;
    - `?section=<name>`.
  - It loads a minimal Obsidian-like stylesheet that defines the colour variables for light and dark.
- [ ] **Step 3:** Add a `claudeoli-dashboard-harness` entry to `..\.claude\launch.json` (the parent folder's, outside the repo). It runs `node dev/build-harness.mjs --serve` with cwd at the repo.
- [ ] **Step 4:** Open the harness with `preview_start`. Screenshot Needs you at 1400×850, light, zoom 1.5. Fix whatever unslop flags. Expected: no overflow, targets at least 32 px.
- [ ] **Step 5: Commit.** `chore: browser harness with mock Obsidian`.

---

## Phase 2: live layer, read-only

### Task 8: Protocol mirror (`src/core/protocol.ts`)

**Interfaces, produces:**
- Constants:
  - `CONTENT_KEY = "org.claudeoli.v1"`
  - `CLAIM_TYPE = "org.claudeoli.claim"`
  - `PRESENCE_TYPE = "org.claudeoli.presence"`
  - `DECISION_TYPE = "org.claudeoli.decision"`
  - `ROLES_TYPE = "org.claudeoli.roles"`
  - `KINDS = ["chat","ask","answer","handoff","claim","release","status"] as const`
  - `STATES = ["pending","accepted","approved","refused","picked-up","done","dropped","expired"] as const`
  - `PROTOCOL_V = 2`
  - `HANDOFF_WINDOW_MS = 7 * 86400_000`
- Types: `BusMessage` (as in the bus, plus `ref?: string; state?: State`), `MatrixEvent`, `Decision = { v: 2; decision: "approve" | "refuse"; ref: string; target: string }`.
- `botPc(sender, serverName)`, `pcOf`, `baseOf`, `isAddress`, `isSessionName`: the same rules as the bus.
- `PROTOCOL_PIN = { types: [CONTENT_KEY, CLAIM_TYPE, PRESENCE_TYPE, DECISION_TYPE, ROLES_TYPE], kinds: KINDS, states: STATES, v: PROTOCOL_V }`

Steps:
- [ ] **Step 1: Write the failing test** `test/protocol-pin.test.ts`. It asserts `PROTOCOL_PIN` deep-equals a literal object written out in the test. Task 12 adds the same literal to the bus repo, so a change on either side fails that side's test.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: bus protocol mirror v2`.

### Task 9: Live state (`src/core/live.ts`)

**Interfaces:**
- Consumes Task 8.
- Produces:
  - `interface Presence { pc: string; sessions: string[]; seen: number; version: number }`
  - `interface Claim { key: string; holder: string; note: string; expires: number }`
  - `interface LiveState { presence: Record<string, Presence>; claims: Claim[]; messages: BusMessage[]; statuses: Record<string, { state: State; ts: number; id: string }>; decisions: Record<string, { decision: string; ts: number }>; roles: Roles | null; powerLevels: Record<string, any> | null }`
  - `emptyLive(): LiveState`
  - `applySync(s: LiveState, events: MatrixEvent[], ctx: { ownerId: string; serverName: string }): LiveState`
  - `handoffState(s: LiveState, handoffId: string, now: number): State`: the latest status by `(ts, id)`, else `expired` if older than `HANDOFF_WINDOW_MS`, else `pending`.

Rules:
- Bot messages are read from `CONTENT_KEY` with the bus's `from`/PC check.
- Owner messages are read from `CONTENT_KEY` when present, else from the `to: text` body.
- Presence counts only when `state_key === botPc(sender)`; `version` is `content.version ?? 1`.
- A claim with a holder counts only when `pcOf(holder) === botPc(sender)`. An empty-content clear is accepted from that PC's bot or from the owner.
- `status` messages are accepted only from bots.
- Decisions are accepted only from the owner.
- Messages are capped at 500, keeping the newest.

Steps:
- [ ] **Step 1: Write the failing tests:**
  - presence from `@claudeoli-pc-a` with state_key `pc-b` is ignored;
  - a claim by pc-a's bot holding `pc-b/x` is ignored;
  - the owner's clear removes a claim;
  - two statuses with the same `ts` resolve to the one with the larger `event_id`;
  - a handoff 8 days old with no status is `expired`;
  - a `status` from the owner is ignored;
  - presence without `version` reads as 1.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: live state from sync with the bots' sender rules`.

### Task 10: Sync loop (`src/live/loop.ts`)

**Interfaces:**
- Consumes Tasks 6 and 9.
- Produces:
  - `type ConnState = { kind: "signed-out" } | { kind: "connecting" } | { kind: "ok"; at: number } | { kind: "offline"; since: number; retryIn: number } | { kind: "token-rejected" }`
  - `class SyncLoop`, with:
    - `constructor(o: { matrix: Matrix; roomId: string; ownerId: string; onChange: (s: LiveState, c: ConnState) => void; now?: () => number; sleep?: (ms: number) => Promise<void> })`
    - `start(): void`
    - `stop(): void`
    - `pause(hidden: boolean): void`
    - `state: LiveState`
    - `conn: ConnState`
  - `syncFilter(roomId: string)`:

    ```
    { room: { rooms: [roomId],
              timeline: { limit: 100, types: ["m.room.message", DECISION_TYPE] },
              state: { types: [CLAIM_TYPE, PRESENCE_TYPE, ROLES_TYPE, "m.room.power_levels"] },
              ephemeral: { types: [] }, account_data: { types: [] } },
      presence: { types: [] }, account_data: { types: [] } }
    ```

Behaviour:
- `stop()` increments a generation counter. A response from an older generation is dropped, because `requestUrl` can't be aborted.
- Backoff starts at 2 s, doubles, and caps at 60 s.
- 401 or `M_UNKNOWN_TOKEN` gives `token-rejected` and stops.
- `since` is kept in memory only, so each open starts with a full sync. `shortcut:` only the last 100 timeline events per open; upgrade to `/messages` paging if older threads are missed.

Steps:
- [ ] **Step 1: Write the failing tests**, with a fake `Matrix` and an instant `sleep`:
  - three network failures give `offline` with `since` equal to the first failure's time and waits of 2000, 4000 and 8000 ms;
  - after one success the state is `ok`;
  - `M_UNKNOWN_TOKEN` gives `token-rejected` and no further sync calls;
  - after `stop()`, a sync that resolves late doesn't call `onChange`;
  - `pause(true)` makes no new request until `pause(false)`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5:** In `DashboardView`:
  - `onOpen` starts the loop;
  - `onClose` stops it;
  - `registerDomEvent(document, "visibilitychange", …)` calls `pause`.
- [ ] **Step 6: Commit.** `feat: one long-poll while the dashboard is open`.

### Task 11: Live sections and Needs-you live items

**Interfaces:**
- Consumes Tasks 9 and 10.
- Produces `needsFromLive(s: LiveState, now: number, ownerAddr = "oli"): NeedsItem[]`, which returns:
  - handoffs in state `pending` (action `approve-refuse`);
  - `ask` messages to `oli` with no later message from `oli` in the same thread (action `reply`);
  - claims past `expires` (action `release`).

Steps:
- [ ] **Step 1: Write the failing tests:**
  - a pending handoff gives one item; once a status `approved` exists, it gives none;
  - an `ask` to `oli` answered in its thread gives none;
  - a claim with `expires < now` gives a `release` item.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5:** Fill the sections from the live state, marking each row "live" and its age:
  - Sessions: presence per PC with "● bot 20 s ago" or "○ bot 3 h ago (offline)" (more than 15 min).
  - Sessions: sessions that ended without a handoff Log row are flagged. A session log row that isn't marked as logged gets "no handoff row".
  - Devices: bot up and last seen, plus the bot version.
  - Claims: holder `name@pc`, path, note, expiry.
  - Messages: threads that involve `oli`, newest first.
  - An `approved` handoff shows "Waiting for `<target>` to pick this up".
- [ ] **Step 6:** Banners:
  - `offline` collapses the live sections into the one line "`<serverLabel>` offline since HH:MM. Showing the vault only.";
  - `token-rejected` says "Signed out on this device", with a "Sign in" button.
- [ ] **Step 7:** Check in the harness with `?live=ok`, `offline` and `signedout`.
- [ ] **Step 8: Commit.** `feat: live presence, claims and messages`.

---

## Phase 3: bus changes, then dashboard actions

Work in a separate worktree of the bus repo. Don't switch branches in its main checkout.
1. Claim the bus files first: add the claim to the Coordination board's "Agent bus" row notes, since its owner is someone else.
2. Run `git -C ..\..\claudeoli worktree add ..\claudeoli-bus -b feature/dashboard-bus main`.
3. In the new worktree, run `npm ci` with `C:\Program Files\nodejs\node.exe` (Node 26).
4. Run the tests with `npm test`. Expected: 74 pass before any change.

### Task 12: Bus protocol v2

**Files:** `src/shared/protocol.ts`, `test/protocol.test.ts`, `test/protocol-pin.test.ts` (new), in the bus repo.

- Add:
  - the `DECISION_TYPE` and `ROLES_TYPE` constants;
  - the kind `status`, with `ref` and `state`;
  - `STATES`, `PROTOCOL_V = 2` and `PROTOCOL_PIN`, the same literal as Task 8.
- The bot now writes `v: 2` in its content blocks.
- `parseEvent` reads the `CONTENT_KEY` block in the owner's events too: `from` must be `"oli"`, `to` must be an address, and `kind` may be `chat` or `answer`. The body parsing stays as the fallback.
- Add `parseDecision(ev, ctx): Decision | null`. It returns null unless the type is `DECISION_TYPE`, the sender is `ctx.oliUserId` (until Task 19), `v` is 2, `decision` is `approve` or `refuse`, and `ref` and `target` are strings.

- [ ] **Step 1: Write the failing tests:**
  - `PROTOCOL_PIN` equals the literal;
  - the owner's event with a block `{v:2, from:"oli", to:"pc-a/x", kind:"answer", thread:"t-1", text:"yes"}` parses with kind `answer` and thread `t-1`;
  - a block with `from:"pc-a/x"` sent by the owner returns null;
  - `parseDecision` from a bot sender returns null.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: all pass.
- [ ] **Step 5: Commit** (bus repo). `feat: protocol v2 (decision, status, owner blocks)`.

### Task 13: Bot decision check and statuses

**Files:** `src/bot/bot.ts`, `src/bot/store.ts`, `src/mcp/tools.ts`, `src/cli.ts` (peek), `test/bot.test.ts`, `test/tools.test.ts`, in the bus repo.

**Produces:**
- `Store.statusOf(handoffId): { state; ts; id } | undefined` and `Store.setStatus(...)`, with the latest chosen by `(ts, id)`.
- `Bot.statusSet(name, ref, state)`, exposed as the MCP tool `bus_status_set(ref, state)`. It allows only `accepted`, `done` and `dropped`, and only from a session on the PC the handoff targets.
- Presence content gains `version: 2`.

On each `DECISION_TYPE` event, the bot drops it unless all of these hold:
1. the sender is the owner, or later a roles level allowing it (Task 19);
2. `ref` is a stored `handoff` message whose `to` is a session or the PC on this PC;
3. its status is `pending`;
4. `now - handoff.ts <= HANDOFF_WINDOW_MS`.

If all hold, the bot posts a status `approved` or `refused`, as a bus message with kind `status`, `ref`, `state`, `to = handoff.from` and the thread of the handoff. When an approved handoff is handed out by `read` or `wait`, the bot posts `picked-up`. `bus_read`, `bus_wait` and `peek` show approved handoffs as "approved by Oli_G via dashboard". A handoff past the window with no status gets `expired`, posted by the bot of the PC that sent it, checked hourly during the prune.

- [ ] **Step 1: Write the failing tests** against `test/fake-matrix.ts`:
  - the owner's approve of a pending handoff to `pc-a/x` makes pc-a's bot post status `approved`;
  - the same decision a second time posts nothing;
  - a decision from a bot account posts nothing;
  - a decision on an 8-day-old handoff posts nothing;
  - a decision on a handoff for pc-b is ignored by pc-a's bot;
  - `read` returns the handoff with "approved by Oli_G via dashboard", then `picked-up` is posted;
  - `bus_status_set` with `approved` is a 400.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` (Node 26). Expected: all pass.
- [ ] **Step 5: Commit.** `feat: bot verifies dashboard decisions, posts handoff status`.

### Task 14: Telling a holder its claim was released

- When the bot applies a claim clear whose sender isn't this PC's bot, and the claim held before had a holder on this PC, it adds a local message to the store:
  - from `this.pc`, to the holder, kind `release`, thread `"claims"`;
  - text "your claim on `<key>` was released by Oli_G".
- It's delivered at the holder's next `bus_read`. It isn't posted to the room.
- [ ] **Step 1: Write the failing test:** the owner clears `x:src/a.ts` held by `pc-a/x`; the next `read("pc-a/x")` contains that text. A clear by pc-a's own release posts no such message.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: tell a session when someone released its claim`.

### Task 15: Room power levels

**Files:** `src/room.ts`, `src/cli.ts`, `test/cli.test.ts`, in the bus repo.

- `roomCreateBody` sets:
  - `users_default: 0`, with the creator bot kept at **50 explicitly**, since it lowers itself from 100;
  - `events` additions `[DECISION_TYPE]: 100` and `[ROLES_TYPE]: 100`.
- `inviteBot` also sets the bot's user level to 50.
- Add `levelsFor(pl, bots: string[]): object`, a pure helper that returns the updated power-levels content.
- Add the CLI command `room levels`. It reads `m.room.power_levels`, applies `levelsFor` with every `@claudeoli-*` member, and writes it back. It has to be run once, by the owner's account, on the room created earlier. It prints the diff before writing and needs `--yes`.
- [ ] **Step 1: Write the failing tests:**
  - `roomCreateBody(...).power_level_content_override.users_default === 0`;
  - after `createAgentsRoom` the creator bot is 50;
  - `levelsFor` keeps the owner at 100 and sets each bot to 50.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5:** Update the bus repo's `docs/setup.md`: the `room levels` step, and agent rules 3, 5 and 7 worded as in the spec.
- [ ] **Step 6: Commit.** `feat: room levels for people and decisions`.

### Task 16: Dashboard actions

**Interfaces:**
- Consumes Tasks 6, 9 and 10.
- Produces `Actions` (in `src/ui/view.ts`, built over `Matrix`):
  - `approve(h: BusMessage)` and `refuse(h: BusMessage)`: send `DECISION_TYPE {v:2, decision, ref: h.id, target: h.to}`, then a plain `m.room.message` "Oli_G approved: `<first 80 chars>`".
  - `release(c: Claim)`: `putState(CLAIM_TYPE, c.key, {})`.
  - `reply(m: BusMessage, text)`: a message with the block `{v:2, from:"oli", to:m.from, kind: m.kind === "ask" ? "answer" : "chat", thread:m.thread, text}`, `m.relates_to` set to that message, and body `"<to>: <text>"`.
  - `send(to, text)`: the same shape in a new thread `"t-" + 8 hex chars from window.crypto`.
- `decisionsEnabled(s: LiveState, h: BusMessage): boolean` (pure, in `needs.ts`): true only when the presence `version` of `pcOf(h.to)` is at least 2. Otherwise the buttons are disabled with "Bots too old to accept approvals".

Rules:
- Each action button disables itself while its request is in flight.
- After a decision, the row shows "sent" until the status arrives.
- A decision on a handoff that's no longer `pending` isn't offered. It shows "already decided".
- Text over 4096 bytes is refused before sending, with the bus's own message.

Steps:
- [ ] **Step 1: Write the failing tests** `test/actions.test.ts`, with a recording `Http`:
  - `approve` sends exactly one decision event and one message, in that order;
  - two `approve` calls before the first resolves send one decision;
  - `reply` to an `ask` has kind `answer` and the same thread;
  - `decisionsEnabled` is false for presence version 1.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5:** Wire up the buttons in Needs you, Claims and Messages. Reply opens a small modal with a textarea. Messages gets a "New message" button on the toolbar's right, with an address picker built from presence.
- [ ] **Step 6:** Check in the harness with `?live=ok`: approve, then the fake status arrives, then the row leaves Needs you.
- [ ] **Step 7: Commit.** `feat: approve, refuse, release, reply from the dashboard`.

---

## Phase 4: vault actions

### Task 17: Row-edit guard (`src/core/edits.ts`)

**Interfaces, produces:**
- `type EditResult = { ok: true; text: string } | { ok: false; reason: "changed" | "missing" }`
- `setupToDone(text: string, shown: Row, date: string): EditResult`: removes the row from `## Queue` (matched by `rowKey` and checked against `shown.raw`) and inserts `| <date> | <PC> | <Task> | <Owner> |` as the first data row of `## Done`.
- `answerBoardMessage(text: string, shown: Row, answer: string): EditResult`: fills the empty Answer cell. Pipes in the answer are escaped as `\|`, and newlines become spaces.

The UI calls `app.vault.process(file, t => { const r = f(t, …); if (!r.ok) { failed = r.reason; return t } return r.text })`. If it fails, it shows the notice "This row changed; reload". Every other line stays byte-identical.

- [ ] **Step 1: Write the failing tests:**
  - moving a Queue row puts it first in Done with today's date and changes no other line;
  - if the row's State cell changed since it was shown, the result is `{ok:false, reason:"changed"}`;
  - if the row is gone, the result is `missing`;
  - an answer containing `a|b` is written as `a\|b`;
  - answering an already answered row gives `changed`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5:** Wire up the buttons: "Done" on setup items (owner only) and "Answer…" on board messages.
- [ ] **Step 6: Commit.** `feat: vault actions that refuse stale rows`.

---

## Phase 5: rooms and levels

### Task 18: Levels (`src/core/levels.ts`, mirrored in the bus repo's `src/shared/levels.ts`)

**Produces:**
- `type Level = "owner" | "collaborator" | "viewer" | "bot"`
- `interface Roles { v: 2; collaborators: boolean; projects: Record<string, { room?: string }>; users: Record<string, { level: Level; projects: string[]; pcs: string[] }> }`

  The spec's example nests the user map directly. This plan puts it under `users`, next to the `projects` and `collaborators` switches.
- `parseRoles(content: unknown): Roles | null`: drops unknown levels.
- `levelOf(roles, userId, ownerId): Level | null`: the owner is always `owner`; bot accounts are `bot`.
- `POWER = { owner: 100, collaborator: 30, viewer: 10, bot: 50 }`
- `can(level, action: "decide" | "release-any" | "release-own" | "chat" | "set-roles", collaboratorsOn: boolean): boolean`: collaborator actions are false while `collaboratorsOn` is false.
- `projectOf(sessionOrClaimKey: string): string`: the folder part of `pc/folder`, or the repo part of `repo:path`.

Steps:
- [ ] **Step 1: Write the failing tests:**
  - a viewer can't `decide` or `chat`;
  - a collaborator can't `decide` with `collaborators: false` but can with `true`;
  - a bot can never `decide`;
  - `projectOf("pc-a/project-x-2")` is `"project-x"`;
  - `projectOf("project-x:src/a.ts")` is `"project-x"`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** in both repos, with the same test file. **Step 4: Run** in both. Expected: PASS.
- [ ] **Step 5: Commit** in both repos. `feat: user levels from org.claudeoli.roles`.

### Task 19: Bot: roles, project-room copies, collaborator relay (bus repo)

- The bot applies `ROLES_TYPE` state only from senders at power 100. `parseDecision` and the decision check use `levelOf` plus `can("decide", …)`. The sender must also own the handoff's target session (its PC is in `users[sender].pcs`), unless the sender is the owner.
- **Copies:** for each project in `roles.projects` that has a `room`, each bot copies into that room:
  - the bus messages it sent itself whose session folder is that project;
  - its own claims whose key has that repo;
  - status events it posted;
  - owner messages addressed to its PC's sessions in that project.
  - Copies carry `"org.claudeoli.copy": { of: <agents-room event id> }`.
  - Presence is trimmed to that project's sessions.
  - Only the agents room is read for claim conflicts.
- **Relay:** when `collaborators` is true, the bot on a PC listed in the collaborator's `pcs` relays decisions and messages from that collaborator in the project room into the agents room, after `can()`. It marks them `"org.claudeoli.relayed": { for: <userId> }`. When `collaborators` is false, the bot ignores everything posted in project rooms.
- The bot joins project rooms it's invited to by the owner.
- [ ] **Step 1: Write the failing tests** with `fake-matrix.ts`:
  - with project `project-x` and a room, pc-a's message from `pc-a/project-x` is copied once, and from `pc-a/other` not at all;
  - a viewer's message in the project room isn't relayed;
  - with `collaborators: false`, a collaborator's decision isn't relayed;
  - with `true`, a collaborator's decision for his own PC's session is relayed, and one for the owner's session isn't.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** `feat: project rooms and collaborator relay (off by default)`.

### Task 20: People section and sharing (dashboard)

**Interfaces:**
- Consumes Tasks 6 and 18.
- Produces:
  - `rolesAfter(roles: Roles, change: { user: string; level?: Level; share?: string; unshare?: string }): Roles` (pure, tested).
  - `projectRoomBody(project: string, ownerId: string, bots: string[]): object`, which sets:
    - room version 11, `private_chat`, unencrypted;
    - name `ClaudeOli · <project>`;
    - users: owner 100, bots 50;
    - `users_default 0`, `events_default 30`, `state_default 100`, `invite 100`.

    The spec says `events_default` 10 and also says viewers at 10 can't post. 30 makes both true; raise it with the owner before building this task.

The People section lists the `roles` users with name, level, projects and PCs. These actions are owner only:
- change a level (`dropdown`; Collaborator disabled with "Switched off" while `collaborators` is false);
- **share a project:** create the room if `roles.projects[p].room` is unset, invite the bots and the person, then write `roles`;
- **unshare:** write `roles`, then kick.

Each one asks for confirmation in a modal naming the person and the project. No project room is created until the owner shares one.

- [ ] **Step 1: Write the failing tests:**
  - `rolesAfter` with `share: "project-x"` adds it once;
  - `unshare` removes it;
  - `projectRoomBody(...).power_level_content_override.events_default === 30`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5:** Check in the harness with a fake roles state.
- [ ] **Step 6: Commit.** `feat: people, levels and project sharing`.

---

## Phase 6: publishing checks and install

### Task 21: Release workflow, checks, install

- [ ] **Step 1:** Add `.github/workflows/release.yml`, copied from UniverseView: test, build, check that the tag equals `manifest.version`, attest `main.js`, `manifest.json` and `styles.css`, then make a **draft** release. Only after the Task 1 rulesets exist. Commit it on a branch; the PR is opened on the owner's yes.
- [ ] **Step 2:** Write `scripts/install.ps1 -Vault <path>`:
  - it runs `npm test` and `npm run build`;
  - it copies `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/claudeoli-dashboard/`;
  - it never touches `data.json`;
  - it writes nothing with `Set-Content -Encoding utf8`;
  - it checks the copied manifest's first byte is 123.
  - The vault path comes from the parameter or from `dev/vault.local.txt`, which is git-ignored.
- [ ] **Step 3:** Run every check and read each result:
  - `npm test`;
  - `npm run lint`, where errors fail and each warning is either fixed or listed in the PR with its reason;
  - `node scripts/check-mobile.mjs`;
  - `node scripts/check-names.mjs`;
  - the manifest test.
- [ ] **Step 4:** Take harness screenshots of Needs you, Sessions, Claims and Messages, at 1400×850 and at 375 px wide, in light and dark, at `?zoom=1.5`, and with `?live=offline`. Fix overflow, clipped text and targets under 32 px.
- [ ] **Step 5:** Run `scripts/install.ps1` against the owner's project-notes vault on this PC. Check `Get-Process Obsidian`, and start Obsidian if it isn't running, so Sync uploads.
- [ ] **Step 6: Commit.** `chore: release workflow and install script`.

## Out of the code (the session does these)

- Coordination board: a new Work row for the dashboard (owner this session's `user@PC`, state `in progress`), and the bus claim noted on the "Agent bus" row.
- Session handoff: a Now row at the start, then a Log row at the end with commits, what isn't checked live and what's left.
- Not testable here: the live parts against the real server (it's offline), and the iPhone check (sign-in, `requestUrl` over Tailscale, offline banner). That one is the owner's.
