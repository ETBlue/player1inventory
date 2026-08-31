# PWA + Offline — design

**Date:** 2026-08-31
**Status:** 🔲 Designed, not implemented
**Branch:** `feature/pwa-offline`
**Brainstorming:** [2026-08-31-brainstorming-pwa-offline.md](2026-08-31-brainstorming-pwa-offline.md)
**Related:** [seamless offline ↔ online migration](../backend/2026-04-04-seamless-offline-online-migration-design.md) · [design tokens](../design-system/)

## Goal

The app installs to a mobile home screen and launches standalone. Offline:

- **Local mode is fully usable** — browse, edit, check off shopping. Its data is already
  entirely on-device in Dexie; only the app shell is missing today.
- **Cloud mode renders last-synced data, read-only**, behind a banner naming when it was
  last synced. Writes fail fast and visibly rather than hanging or silently no-opping.

## Non-goals

- **Offline writes in cloud mode.** No outbox, no mutation queue, no conflict resolution.
  That work overlaps the deferred
  [seamless offline ↔ online migration](../backend/2026-04-04-seamless-offline-online-migration-design.md)
  and would land as an `injectManifest` service worker (see *Escape hatch*).
- **In-app install UI.** No Settings row, no banner. Browser defaults only. The manifest is
  the prerequisite for adding either later, so both stay purely additive.
- **Push notifications, background sync, periodic sync.**

## Approach

`vite-plugin-pwa` in **`generateSW`** mode with **`registerType: 'prompt'`**, plus a
hand-rolled Apollo cache persistor.

Workbox owns precache-manifest generation and per-build revisioning — the part hand-rolled
service workers get subtly wrong, where a cached `index.html` pins hashed chunks that no
longer exist and the app white-screens until someone manually clears storage.

Persistence is hand-rolled deliberately: `apollo3-cache-persist@0.15.0` peer-depends on
`@apollo/client: ^3.7.17` and the repo is on `^4.1.6`, so it does not declare support for
the major version in use. The needed surface is small (`cache.extract()` /
`cache.restore()` plus a debounce), it uses Dexie which the repo already ships, and it
carries auth and privacy implications that deserve reviewable in-repo code.

### Escape hatch

If offline writes are ever wanted, the outbox lives in an `injectManifest` service worker.
The config delta from `generateSW` is small; nothing in this design forecloses it.

## 1. App shell

### Build

`vite-plugin-pwa@1.3.0` added to `apps/web/vite.config.ts`. Peer range covers `vite ^7`;
the repo is on `^7.2.4`.

The manifest is declared in `vite.config.ts` rather than a loose `public/manifest.json`, so
it is typed and reviewed alongside the rest of the build config. `display: standalone`,
`theme_color` / `background_color` sourced from the existing design tokens.

### Icons

One source SVG committed to the repo, drawn from the design-token palette.
`@vite-pwa/assets-generator@1.0.2` derives 192 / 512 / maskable / apple-touch as a `pnpm`
script. Maskable gets the safe-zone padding Android's circular crop requires.

The artwork is **one file, not eight** — swapping the source SVG and re-running the script
regenerates the set.

### iOS

`index.html` gains `apple-touch-icon` and `apple-mobile-web-app-*` tags. iOS Safari never
fires `beforeinstallprompt`, so there is no install button to offer; these tags are what
make a manual Share → Add to Home Screen produce a correct icon and a standalone window
rather than Safari chrome.

### Fonts

**Self-host Rosario**, replacing the Google Fonts `<link>` at `index.html:24`. A runtime
cache only helps *after* a successful online visit; a cold offline launch would fall back to
system fonts and shift every layout. Self-hosting puts the font files in the precache and
makes offline typography identical to online.

This is the one change reaching outside the PWA surface. It is deliberate, not incidental.

### Update flow

`registerType: 'prompt'` exposes `needRefresh`. A `useServiceWorkerUpdate` hook surfaces it
as a sonner toast with a Reload action, mounted beside the existing `<Toaster />`
(`__root.tsx:88`). Strings go through i18n (`en.json` / `tw.json`) like everything else.

No auto-reload: nothing is yanked out from under a user mid-edit.

## 2. Cloud mode offline (read-only)

### 2.1 The Clerk spike — resolved first

`ClerkProvider` wraps the entire cloud tree (`main.tsx:73`) and loads its script
cross-origin. Whether `useAuth()` resolves a signed-in session with no network, from a cold
installed-PWA launch, decides the shape of everything below. **It is not asserted here** —
the plan's first step is a spike: cold-launch the installed build with DevTools offline and
record what `useAuth()` reports.

**Branch A — Clerk resolves signed-in from cached state.** Key the persisted cache by Clerk
user id; restore once Clerk resolves. Clean.

**Branch B — Clerk cannot resolve offline.** Persist a `lastSignedInUserId` stamp while
online and use it to select and render the cached data without a validated session.

Branch B is a **deliberate loosening, accepted by the designer**: cached cloud data would
render without a live session check. It is read-only, device-local, and purged on sign-out —
the same threat model as local mode's Dexie database, already unencrypted on the device.

Whatever the spike finds, the app must render sensibly when Clerk's cross-origin script
simply does not load. It cannot be precached.

### 2.2 Two redirects must learn about offline

Both currently fire on state that offline produces spuriously:

| Location | Today | Change |
|---|---|---|
| `CloudAuthGuard`, `__root.tsx:31-38` | Redirects to `/sign-in` on `isLoaded && !isSignedIn` | Only redirect when actually online |
| Onboarding redirect, `__root.tsx:66-79` | Redirects to `/onboarding` on `allLoaded && isEmpty` | Suppress in cloud mode while offline |

Without the first, an offline user is bounced to a sign-in page they cannot complete while
their cached data sits unreachable. Without the second, a cloud user whose cache restore
came back empty is offered onboarding — which reads as data loss.

**Online detection leans on `navigator.onLine` in its false direction only.** `false`
reliably means no network interface; `true` notoriously does not guarantee reachability.
Only the trustworthy half is load-bearing here.

### 2.3 Persistence

New: `apps/web/src/apollo/persistence.ts`.

- `cache.extract()` on a debounce → a Dexie store.
- `cache.restore()` **awaited before `ApolloWrapper` mounts.**
- A `lastSyncedAt` stamp written on each successful cloud read, feeding the banner.

**A separate Dexie database, not the app DB.** Two reasons, both concrete:

1. The app DB is at **v17** and the in-flight
   [cloud-locations](../../features/locations/2026-08-30-cloud-locations-design.md) design
   already claims **v18** for its `isDefault` migration. Adding a table here would collide
   with an unmerged branch over a version number, and `src/db/CLAUDE.md`'s versioning rules
   are forward-only — the collision could not simply be edited away later.
2. It keeps a cloud-only concern out of the local-mode database, and makes the sign-out
   purge a whole-database delete rather than a surgical table clear.

**The ordering is the whole trick.** Restore after the first queries fire and they resolve
against an empty cache and overwrite it — the persisted data is destroyed by the very
launch meant to use it.

### 2.4 Blocking writes

Two layers, deliberately asymmetric:

**Correctness backstop (this design):** an `ApolloLink` that fails mutations fast while
offline with a typed error plus a toast. One chokepoint, catches everything — including
controls added later.

**Polish (incremental):** a shared `useCloudWritesDisabled()` hook applied to the most
prominent write affordances, extended over time.

Exhaustively disabling every mutating control up front spans pantry, shopping, cooking and
item detail — a sprawling diff, every file a place to miss a spot, and no way to verify
completeness. The link guard delivers the actual guarantee (nothing silently fails) in one
reviewable place.

### 2.5 The offline banner

`OfflineBanner` in `components/global/`. Renders in cloud mode while offline:
*"Offline — last synced 2 hours ago."*

- `role="status"` — announced without stealing focus.
- Colors from existing tokens, so it cannot reintroduce the contrast failure that killed
  `UnitBadge`.
- Relative time and all strings through i18n.

### 2.6 Sign-out purge

Hooks into the existing `clerk.signOut()` (`DataModeCard.tsx:106`): clear the cache table
and both stamps. Restore additionally self-purges on a user-id mismatch, so a shared device
cannot leak one account's pantry into another's.

## 3. Testing

### E2E constraint

**A service worker does not exist on the Vite dev server** unless `devOptions.enabled` is
set — it only appears in a real build. Offline E2E therefore runs against built output
(`vite preview`), not `pnpm dev`, which needs a preview-serving Playwright project.
`e2e/CLAUDE.md`'s one-suite-per-machine rule still applies.

### Mutation checks

Per the repo's mutation-check rule, each test must be **watched going red**:

| Behavior | Mutation that must turn it red |
|---|---|
| Cache restores before the first query | Move `restore()` after mount |
| Restore purges on user-id mismatch | Drop the id comparison |
| `CloudAuthGuard` does not bounce offline | Delete the online guard |
| Offline mutations fail fast | Remove the link guard |

**The fixture trap** — same shape as the documented `stockId` trap: a restore test with an
*empty* persisted cache passes against restore-before-mount and restore-after-mount alike.
The fixture must hold real cached data **and** run a query that would overwrite it.
Otherwise the test is vacuous and reports as covered.

### Storybook and a11y

`OfflineBanner` gets `.stories.tsx` (online / offline-recent / offline-stale) plus the
matching `.stories.test.tsx` smoke test. The banner is added to `e2e/tests/a11y.spec.ts` for
both themes.

## 4. Risks

1. **Stale service workers in development.** The classic footgun. An explicit
   unregister / hard-reset path is included; `devOptions` stays off by default.
2. **Cloudflare Pages `_redirects` vs. Workbox `navigateFallback`.** Both implement SPA
   fallback (`apps/web/public/_redirects` is `/* /index.html 200`). They must agree, or a
   deep link resolves differently offline than online.
3. **Clerk's script is cross-origin and cannot be precached.** See §2.1.
4. **iOS storage eviction.** Safari caps script-writable storage for sites without recent
   interaction; installed web apps are generally exempt. **To be verified during
   implementation, not asserted** — a wrong answer means a user's cached pantry quietly
   vanishing.

## 5. Rollout

Shipping a service worker to `player1inventory.etblue.tw` is the one genuinely **one-way**
step: once registered, every future deploy is mediated by it.

**The kill-switch (unregister path) therefore lands in the same PR as registration, never
after.**
