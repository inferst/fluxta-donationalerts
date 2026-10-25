# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — this plugin's own glossary.
- **Fluxta's plugin docs** at [fluxta.app/docs/plugins](https://fluxta.app/docs/plugins). Fluxta owns every word this plugin shares with it and every rule of the Plugin API; start with [Terminology](https://fluxta.app/docs/plugins/getting-started/terminology), then the page for the area you touch (below).
- **The installed SDK** — `apps/plugin/node_modules/@fluxta/sdk/dist/api.d.mts` (sidecar) and `ui.d.mts` (editors) document the Plugin API at the version this repo pins. Where the docs and the typings disagree, the typings describe what this repo actually builds against.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates this repo's own docs lazily when terms or decisions actually get resolved.

### Fluxta pages that shape this plugin

- [Manifest](https://fluxta.app/docs/plugins/reference/manifest) — every field, and the naming rule for kinds and keys
- [Plugin API](https://fluxta.app/docs/plugins/reference/plugin-api) and [Editor API](https://fluxta.app/docs/plugins/reference/editor-api) — the sidecar's and the editor's side of the SDK
- [UI Kit](https://fluxta.app/docs/plugins/reference/ui-kit) — the components the editor is built from
- Guides: [Run Variables](https://fluxta.app/docs/plugins/guides/run-variables), [Connections](https://fluxta.app/docs/plugins/guides/connections), [Messaging](https://fluxta.app/docs/plugins/guides/messaging), [Plugin Editor](https://fluxta.app/docs/plugins/guides/plugin-editor), [Best practices](https://fluxta.app/docs/plugins/guides/best-practices)
- The [DonationAlerts API](https://www.donationalerts.com/apidoc) — OAuth (the implicit grant), `/user/oauth`, `/alerts/donations`, `/centrifuge/subscribe`, the Centrifugo channels and their payloads. Only what it documents reaches an Event; what the live API showed beyond that is recorded in #1
- [centrifuge-js 2.x](https://github.com/centrifugal/centrifuge-js/tree/2.8.5) — the client the Realtime Connection is built on: private channels through `onPrivateSubscribe`, reconnects, history recovery
- [Development](https://fluxta.app/docs/plugins/getting-started/development), [Publishing](https://fluxta.app/docs/plugins/getting-started/publishing), [CLI](https://fluxta.app/docs/plugins/reference/cli), [Versioning](https://fluxta.app/docs/plugins/reference/versioning), [Troubleshooting](https://fluxta.app/docs/plugins/getting-started/troubleshooting)

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/        ← created with this plugin's first decision
└── ...
```

## Where new docs go

- A term this plugin owns → `CONTEXT.md` here.
- A decision about this plugin's own design → `docs/adr/` here.
- Anything about the Plugin API itself — even a need this plugin forces — belongs to Fluxta: record it in an issue here, labelled `ready-for-human` (see `docs/agents/issue-tracker.md`).

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`, or as Fluxta's docs use it for Fluxta's words. Don't drift to synonyms the glossary explicitly avoids.

Key terms from `CONTEXT.md`: **Account**, **Sign-in**, **Sign-in Expiry**, **Reauthorization Required**, **Realtime Connection**, **Catch-up**, **Repeat**, **Donation**, **Test Donation**, **Goal**, **Recent Events**.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag conflicts

If your output contradicts an ADR of this repo, or a rule in Fluxta's plugin docs, surface it explicitly rather than silently overriding:

> _Contradicts the manifest naming rule (keys are camelCase) — but worth keeping because…_
