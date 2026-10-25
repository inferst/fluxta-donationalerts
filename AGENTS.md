# AGENTS.md

This document provides instructions for agentic coding agents working in this repository.

## Project Overview

Fluxta DonationAlerts is a [Fluxta](https://fluxta.app) plugin that connects a streamer's DonationAlerts account to their deck. What DonationAlerts reports — a **Donation**, a **Goal** changing — becomes a Fluxta Event: Donation Received, Goal Updated. It has no Actions and no Value Sources yet. The vocabulary — Account, Sign-in, Sign-in Expiry, Realtime Connection, Catch-up, Donation, Test Donation, Goal, Recent Events — is in `CONTEXT.md`.

It is a pnpm workspace (turbo) of TypeScript packages. The Plugin API it builds against — `@fluxta/sdk` and the `fluxta` CLI from `@fluxta/cli` — is owned by Fluxta, not by this repo (see [Working against Fluxta](#working-against-fluxta)).

**State of the repo**: Sign-in (#2), Donation Received (#3) with Catch-up and once-per-publication delivery (#5), Goal Updated (#4), and Sign-in Expiry with Reauthorization Required (#6). The v1 spec is #1; the issues that carry code are sliced from it. Update this file's [Architecture](#architecture) as the code lands.

## Commands

### Setup

```bash
pnpm install     # Node ≥ 22.18, the pnpm version pinned in package.json
```

### Development & Build

```bash
pnpm build          # wipe dist/ and build the editor and the sidecar into dist/donationalerts/
pnpm dev            # build the editor once, then watch both apps
pnpm typecheck      # tsc --noEmit in every package
pnpm test           # vitest in apps/plugin and packages/protocol
pnpm lint           # eslint over the whole workspace
pnpm format         # prettier --write; `pnpm format:check` only checks
```

`fluxta publish` runs `lint` and `format:check` itself and stops if either fails.

### Target a specific package

```bash
pnpm --filter donationalerts-plugin test
pnpm --filter donationalerts-protocol test
pnpm --filter donationalerts-editor build
```

### Run it in Fluxta

`dist/donationalerts/` is the build folder Fluxta loads (see Fluxta's [Development](https://fluxta.app/docs/plugins/getting-started/development) guide). Every successful sidecar build — `pnpm build` included — ends with `fluxta restart`, which, while Fluxta is running, links this build and restarts the plugin in it.

```bash
pnpm exec fluxta link dist/donationalerts   # a development link to this build
pnpm dev                                    # every successful sidecar build runs `fluxta restart`
pnpm exec fluxta link --status              # what is linked
pnpm exec fluxta unlink                     # back to the installed package
```

Editor-only rebuilds restart nothing — reopen the editor in Fluxta to see them. The sidecar logs to `dist/donationalerts/logs/donationalerts.log`; `pnpm build` wipes `dist/` and the log with it. Signing in talks to the real DonationAlerts; a Donation to try things with costs nothing when added by hand in DonationAlerts' dashboard ("add message"), and the Plugin Editor's Test Donation never leaves the machine.

## Architecture

### Packages

- `apps/plugin` (`donationalerts-plugin`) — the Plugin sidecar: the Node.js process Fluxta starts. tsdown bundles it into `dist/donationalerts/index.mjs` and copies `manifest.json` and `icons/` beside it.
- `apps/editor` (`donationalerts-editor`) — the Plugin Editor (`plugin.html`, in Fluxta's settings), React + Vite + Tailwind, built into `dist/donationalerts/editor/`. The plugin has no Action Editors.
- `packages/protocol` (`donationalerts-protocol`) — what the sidecar and the editor share: the editor ↔ sidecar messages and the state the Plugin Editor renders (`messages.ts`, each message an object with an `event` discriminant, checked with zod) the Account as the editor sees it (`account.ts`), and when to warn of a Sign-in Expiry (`expiry.ts`). Consumed as TypeScript source; it has no build.

### Plugin sidecar (`apps/plugin/src`)

```
index.ts          composition root: store, Account and Realtime Connection, editor messages, publish(), connect()
plugin.ts         the single `Plugin` instance from @fluxta/sdk/api
schedule.ts       the timer the services take, so tests can drive time by hand
open-browser.ts   opens the consent screen from the sidecar — editor iframes are sandboxed
account/
  store.ts          the persisted Account — the only writer of Plugin Settings, the only holder of the token
  service.ts        Sign-in (loopback, timeout, cancel), Sign out, Sign-in Expiry (a timer in steps under 2^31 ms) and Reauthorization Required, and the AccountState the editor renders
donationalerts/   DonationAlerts plumbing
  config.ts         the public client id, the loopback redirect, every scope with the feature it serves
  api.ts            the only code that calls fetch: `/user/oauth`, `/centrifuge/subscribe`; a 401 is `Unauthorized`
  callback.ts       what the browser brought back: token, refusal, or a callback that is not this Sign-in's
  loopback.ts       the redirect target on 127.0.0.1:29361, open only during a Sign-in
realtime/         the Realtime Connection to DonationAlerts' Centrifugo
  client.ts         the narrow slice of centrifuge-js it uses, and the real client on Node's own WebSocket
  connection.ts     follows the signed-in Account: socket token, private channel tokens, the donation and goal channels, retries, state
  retry.ts          the 1 s → 60 s backoff with jitter every retry shares
donations/
  feed.ts           one Donation Received per publication: replays skipped, Repeats fired, Catch-up after a drop
events/           one file per manifest Event: its `type`, its payload type, a to…Payload mapping
```

The Account's state travels `service.ts` (`onChange`) → `index.ts`, which points the Realtime Connection at the stored Account (`follow()`) and `publish()`es: the status to every open editor, the one External Connection to Fluxta. A publication on the donation channel travels `connection.ts` (`onDonation`, with its position) → `donations/feed.ts` → `events/donation-received.ts` → `plugin.emitEvent`, and every subscription of that channel (`onDonationsSubscribed`) lets the feed set its boundary or catch up; one on the goal channel, `onGoal` → `events/goal-updated.ts`. The connection's state follows the donation channel alone — a failing goal channel is retried and logged.

### Editor (`apps/editor`)

- `src/plugin/` is the Plugin Editor: `AccountCard.tsx` renders the Account and its Realtime Connection and sends `sign-in`, `cancel-sign-in`, `sign-out`; `usePluginStatus.ts` holds the last status the sidecar sent.
- Built from Fluxta's [UI Kit](https://fluxta.app/docs/plugins/reference/ui-kit) (`@fluxta/sdk/ui`).

## Key Conventions

- **Manifest and code change together.** `manifest.json` declares every Event with its Event Fields, and the code fires exactly those, by the same `type` / `key`. Adding an Event means: its manifest entry, a mapping from the DonationAlerts payload to its fields with its test, and the subscription that fires it.
- **Naming in the manifest** ([manifest reference](https://fluxta.app/docs/plugins/reference/manifest)): every kind — an Event `type` — is kebab-case (`donation-received`); every key — an Event Field, a settings field — is camelCase (`raisedAmount`).
- **Only documented DonationAlerts fields reach an Event.** DonationAlerts sends more than its [API docs](https://www.donationalerts.com/apidoc) list (`amount_in_user_currency`, `payin_system`, `recipient` …); the plugin reads none of them. A field of the plugin's own (`isTest`) is fine.
- **Scopes are requested up front.** Sign-in asks for every scope the plugin uses or is expected to use, each commented with its feature: DonationAlerts gives no refresh token, so a new scope means every streamer signs in again.
- **No secret, no server.** Sign-in is OAuth's implicit grant through a loopback redirect, and the plugin ships only the public client id. Never add a client secret.
- **Tokens never leave the sidecar.** The access token and the `socket_connection_token` live only in Plugin settings and in memory; an editor sees whether an Account exists, never a token. No log line or error message may contain one. Donor names and messages are not written to the log either — log Donation ids.
- **A dropped Realtime Connection is normal.** Reconnect without end with backoff and jitter; a 401 is the only thing that stops it (Reauthorization Required). Every publication fires once, whether it arrives live, from Centrifugo's history on resubscribe, or by Catch-up — and a Repeat, a new publication of the same Donation, fires again (`donations/feed.ts`).
- **The plugin keeps no DonationAlerts state** beyond the Account and, in memory, what Catch-up and Recent Events need. Progress or flags a scenario wants to keep are the scenario's, in a Global Variable.
- **The sidecar bundle is self-contained.** Fluxta runs it with a bundled Node and no `node_modules`, so tsdown inlines every non-builtin dependency (`noExternal`). Do not externalize one. `centrifuge` stays pinned to `2.8.5`: DonationAlerts runs Centrifugo v2. Its transport is Node's own `WebSocket` (Fluxta bundles Node 22.17), so there is no `ws`; `protobufjs`, which centrifuge 2.x pulls in for a build the plugin does not use, is denied its install script in `pnpm-workspace.yaml`.
- **File naming**: the sidecar and the protocol package use kebab-case (`donation-received.ts`). In the editor, React components are PascalCase (`AccountCard.tsx`), hooks are `useThing.ts`.
- **Tests**: vitest, colocated `*.test.ts`. No test reaches DonationAlerts: fake `fetch` (`api.test.ts`), a fake loopback and a manual clock for the Sign-in (`service.test.ts`), the real loopback server on a port the OS picks (`loopback.test.ts`), a fake centrifuge-js client behind `RealtimeClient` (`connection.test.ts`), a fake donation list and a manual clock for Catch-up (`feed.test.ts`), payloads as DonationAlerts sent them (`donation-received.test.ts`).
- **The manifest declares `actions: []`.** The plugin has no Actions, but `fluxta validate` requires the field.
- **Comments say why** — the DonationAlerts or Fluxta behaviour that forces the code — and use the capitalized terms of `CONTEXT.md` and Fluxta's [Terminology](https://fluxta.app/docs/plugins/getting-started/terminology).

## Working against Fluxta

- **Fluxta owns the Plugin API contract**: `@fluxta/sdk`, the manifest schema and the `fluxta` CLI, documented at [fluxta.app/docs/plugins](https://fluxta.app/docs/plugins). When this plugin needs something they do not offer, do not work around the contract or patch `node_modules`: record the need in an issue here, label it `ready-for-human`, and stop — a person takes it to Fluxta (see `docs/agents/issue-tracker.md`). Once a release of the SDK or CLI provides it, it is adopted here.
- **The SDK and the CLI come from npm**, pinned once in the `catalog:` of `pnpm-workspace.yaml`; every package says `"catalog:"`. The installed typings — `apps/plugin/node_modules/@fluxta/sdk/dist/api.d.mts` (sidecar) and `ui.d.mts` (editor) — are the contract at the version in use; Fluxta's own working tree may be ahead of it.
- **Adopting a new SDK or CLI version**: bump its `catalog:` entry, add the exact version to `minimumReleaseAgeExclude` if pnpm refuses it as too young, `pnpm install`, and commit `pnpm-workspace.yaml` and `pnpm-lock.yaml` together.
- **Versions and publication**: the plugin's version is `version` in `manifest.json`. `pnpm exec fluxta publish` validates the package and opens a pull request to Fluxta's trusted catalog (`fluxta/plugins`). The catalog can hold a newer version than this repo, and `fluxta publish` merges against it rather than overwriting it. See Fluxta's [Publishing](https://fluxta.app/docs/plugins/getting-started/publishing) guide. Pushing a `version` bump to `main` also tags a draft GitHub Release (`.github/workflows/release.yml`).
- **Publishing is the user's call.** Run `fluxta publish` only when the user asks for it in the conversation.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/) without a scope, lowercase and imperative: `feat: fire Donation Received for live donations`, `fix: …`, `chore: bump version`.

## Agent skills

- Issues: GitHub Issues at `inferst/fluxta-donationalerts`. See `docs/agents/issue-tracker.md`.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- Domain: `CONTEXT.md`, plus Fluxta's plugin docs and the DonationAlerts API. See `docs/agents/domain.md`.
