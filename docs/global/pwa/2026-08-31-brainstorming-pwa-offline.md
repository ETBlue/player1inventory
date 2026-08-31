# PWA + Offline — brainstorming

**Date:** 2026-08-31
**Branch:** `feature/pwa-offline`
**Design:** [2026-08-31-pwa-offline-design.md](2026-08-31-pwa-offline-design.md)

## Starting request

> "User wants to be able to add the web app to their mobile home screen, and access it
> offline when necessary. How about making the project a PWA? And how about using a
> service worker?"

Classified **architectural** — a service worker is a new subsystem with its own lifecycle
(install, update, cache invalidation) sitting under the entire app and touching both data
modes. Not a bounded change to an existing flow.

## Questions and answers

### Q1 — When offline, what has to work?

Options offered: local mode only · local full + cloud read-only · both modes fully offline ·
installability only.

**A: Local mode fully usable offline; cloud mode renders last-synced data read-only.**

Rationale: local mode's data is already 100% on-device in Dexie — only the app shell is
missing. Cloud accepting offline *writes* would need an outbox and conflict resolution,
overlapping the already-deferred
[seamless offline ↔ online migration](../backend/2026-04-04-seamless-offline-online-migration-design.md).
Read-only is the honest middle: you can check what is in your pantry while standing in
front of it.

### Q2 — What happens when a new version is deployed?

Options: prompt to reload · auto-update on next launch · auto-reload immediately.

**A: Prompt to reload.** Never yank the page out from under someone mid-edit; the user
chooses when. Maps directly onto `vite-plugin-pwa`'s `registerType: 'prompt'`.

### Q3 — Icon artwork?

Options: user supplies · generate from design tokens · defer as separate task.

**A: Generate from design tokens.** One source SVG committed to the repo, coherent with the
existing palette, swappable later without touching the generator.

### Q4 — How to invite installation?

Options: Settings entry on both platforms · browser defaults only · dismissible banner.

**A: Browser defaults only, for now** — user asked explicitly whether the in-app entry could
be deferred and added later if needed. Yes: the manifest is the prerequisite for all three,
so a Settings row or banner stays purely additive. Accepted consequence: iOS users get no
in-app guidance, since iOS Safari never fires `beforeinstallprompt`.

### Q5 — What does cloud mode show offline?

Options: cached data + banner · cached data + banner with sync timestamp · offline splash.

**A: Cached data + banner naming when it was last synced.** A timestamp is what makes stale
pantry data trustworthy rather than merely present.

## Approach decision

Three approaches were weighed:

- **A — `vite-plugin-pwa` (generateSW) + a hand-rolled Apollo persistor** ← chosen
- **B — fully hand-rolled service worker**, no new build dependencies
- **C — `vite-plugin-pwa` in `injectManifest` mode**, custom SW body

**A chosen.** It is the only option where the selected update behavior is a config value
rather than code we maintain, and it keeps the one genuinely bespoke piece — cloud cache
persistence, which carries auth and privacy implications — as reviewable code in the repo.

B was rejected because hand-rolling means owning precache-manifest generation and cache
revisioning, which is exactly where hand-rolled service workers fail: a cached `index.html`
pinning hashed chunks that no longer exist, producing a white screen only a manual cache
clear fixes. The control it buys is not control this project needs.

C is A's escape hatch, not a rival: with cloud read-only offline there is no custom SW logic
to write. If "both modes fully offline" ever returns, the outbox lives in an `injectManifest`
SW and the config delta from A is small.

## Version findings (checked, not recalled)

- `vite-plugin-pwa@1.3.0` peer-supports `vite: ^3 || ^4 || ^5 || ^6 || ^7 || ^8` — the repo
  is on `vite@^7.2.4`. Compatible.
- `@vite-pwa/assets-generator@1.0.2` exists as its companion for icon generation.
- **`apollo3-cache-persist@0.15.0` peer-depends on `@apollo/client: ^3.7.17`** — the repo is
  on `^4.1.6`. It does **not** declare v4 support. This is why persistence is hand-rolled
  rather than taken as a dependency.

## Hazards found while exploring (all in `apps/web/src`)

1. **`ClerkProvider` wraps the entire cloud tree** (`main.tsx:73`) and loads its script
   cross-origin. If it hard-fails offline, cloud mode never renders and no amount of cache
   persistence helps. Unresolved → becomes the plan's first step, a spike.
2. **`CloudAuthGuard` redirects to `/sign-in` on `isLoaded && !isSignedIn`**
   (`__root.tsx:31-38`). Offline this can bounce the user to a page they cannot complete,
   with their cached data sitting right there.
3. **The onboarding redirect fires on `allLoaded && isEmpty`** (`__root.tsx:66-79`). A cloud
   user whose cache restore comes back empty is offered onboarding — which reads as "my data
   was wiped."
4. **Rosario loads from Google Fonts via `<link>`** (`index.html:24`). A runtime cache only
   helps after a successful online visit, so a cold offline launch would fall back to system
   fonts and shift every layout.

## Accepted trade-offs

- **Rendering cached cloud data without a live session check**, if the Clerk spike lands on
  the branch where Clerk cannot resolve offline. Accepted: read-only, device-local, purged
  on sign-out — the same threat model as local mode's already-unencrypted Dexie database.
- **A link-level write guard instead of exhaustively disabling every mutating control.**
  Accepted: one chokepoint that catches everything including future controls, versus a
  sprawling diff across pantry / shopping / cooking / item detail whose completeness nobody
  could verify. Per-control disabling proceeds incrementally as polish.
