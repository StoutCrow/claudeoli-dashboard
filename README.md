# ClaudeOli dashboard

**Written entirely by AI (Claude).** This is a personal tool: it isn't in Obsidian's community plugin directory, and it's built for one person's own devices. The code is public so it can be read and reused.

An Obsidian plugin that shows one view of a fleet of Claude Code sessions running on several PCs:

- **Vault layer** (always there): it reads known Markdown notes in the vault, such as a session handoff board, a coordination board, setup machines and an open-work queue.
- **Live layer** (when the homeserver answers): it reads the agent bus's Matrix room. That covers bot presence, file claims, bus messages and handoffs. It shows when the homeserver is offline.

From the dashboard, the owner can approve or refuse a handoff, release a claim, reply to a session, and tick off setup work. The actions are sent from the owner's own Matrix account, and the bots check them.

## Install (on your own devices)

1. Run `npm ci`.
2. Run `scripts/install.ps1 -Vault <path to your vault>`. It tests, builds, and copies `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/claudeoli-dashboard/`.
3. In Obsidian, allow community plugins in that vault and switch **ClaudeOli** on.
4. Sign in on each device from the plugin's settings. The access token is kept in that device's local storage only: never in the vault, `data.json` or the repo.

Obsidian Sync carries the plugin to your other devices, but only where **Settings → Sync → Installed community plugins** is switched on.

## Develop

- `npm test`: unit tests (Node's test runner, Node 24 or later).
- `npm run build`: type check and bundle.
- `npm run lint`: Obsidian's review rules (`eslint-plugin-obsidianmd`).
- `npm run harness`: the plugin in a browser, with a mock Obsidian and sample notes.
- `node scripts/check-mobile.mjs`: blocks APIs that break on Obsidian mobile.

## Licence

MIT. See [LICENSE](LICENSE).
