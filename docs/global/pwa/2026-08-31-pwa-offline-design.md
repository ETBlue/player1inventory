# PWA + Offline — design

**Date:** 2026-08-31 (rewritten in plain English 2026-09-16)
**Status:** ✅ Implemented
**Branch:** `feature/pwa-offline`
**Brainstorming:** [2026-08-31-brainstorming-pwa-offline.md](2026-08-31-brainstorming-pwa-offline.md)
**Related:** [seamless offline ↔ online migration](../backend/2026-04-04-seamless-offline-online-migration-design.md) · [design tokens](../design-system/)

## Goal

The user can add the app to a mobile home screen. It then opens like a normal app, without
browser chrome. When there is no network:

- **Local mode works fully.** The user can browse, edit, and check off shopping. Local data
  already lives on the device in Dexie. Only the app files are missing today.
- **Cloud mode shows the last synced data, read-only.** A banner says when the data was
  last synced. Writes fail at once and show a message. They never hang, and they never look
  like they worked when they did not.

## Non-goals

- **Writing to the cloud while offline.** No queue of pending changes. No conflict
  resolution. That work overlaps the deferred
  [seamless offline ↔ online migration](../backend/2026-04-04-seamless-offline-online-migration-design.md).
  If we build it later, it goes in an `injectManifest` service worker. See *If we need
  offline writes later*.
- **An install button inside the app.** No Settings row. No banner. We use what the browser
  offers by default. We can add our own later.
- **Push notifications, background sync, periodic sync.**

## Approach

Use `vite-plugin-pwa` in **`generateSW`** mode with **`registerType: 'prompt'`**. Write the
Apollo cache persistence ourselves.

Workbox builds the list of files to cache, and gives each build a new revision. Doing that
by hand is where hand-written service workers usually break: a cached `index.html` points
at JS files from an older build. Those files no longer exist. The user gets a white screen,
and only clearing browser storage fixes it.

We write the cache persistence ourselves for one reason. `apollo3-cache-persist@0.15.0`
says it works with `@apollo/client: ^3.7.17`. This repo uses `^4.1.6`. The library does not
claim to support version 4. The code we need is small: `cache.extract()`, `cache.restore()`,
and a debounce. It uses Dexie, which the repo already has. It also touches login and privacy,
so we want that code in the repo where it can be reviewed.

### If we need offline writes later

The queue of pending changes would go in an `injectManifest` service worker. The config
change from `generateSW` is small. Nothing in this design blocks it.

## 1. App files and install

### Build

Add `vite-plugin-pwa@1.3.0` to `apps/web/vite.config.ts`. It supports `vite ^7`, and this
repo uses `^7.2.4`.

Declare the web manifest in `vite.config.ts`, not in a separate `public/manifest.json`. That
way it is typed, and it is reviewed with the rest of the build config. Set
`display: standalone`. Take `theme_color` and `background_color` from the existing design
tokens.

### Icons

Commit one source SVG, drawn with colors from the design tokens. Add a `pnpm` script that
runs `@vite-pwa/assets-generator@1.0.2`. It produces the 192px, 512px, maskable, and
apple-touch icons.

Android crops icons into a circle. The maskable icon needs extra padding so nothing
important is cut off. The generator handles this.

The artwork is one file, not eight. To change it, replace the SVG and run the script again.

### iOS

Add `apple-touch-icon` and `apple-mobile-web-app-*` tags to `index.html`.

iOS Safari never fires `beforeinstallprompt`, so there is no install button we can show. The
user must use Share → Add to Home Screen by hand. These tags are what make that produce a
correct icon and a standalone window.

### Fonts

**Host the Rosario font ourselves.** Remove the Google Fonts tags at `index.html:24-26` (two
`preconnect` tags and the stylesheet `link`).

A runtime cache only helps after one successful online visit. If the user starts the app
offline before that, the font is missing. The app falls back to a system font and every
layout shifts. Hosting the font ourselves puts the files in the precache. Offline text then
looks the same as online text.

This is the only change outside the PWA work. We do it on purpose, not by accident.

### Updates

`registerType: 'prompt'` gives a `needRefresh` signal. A `useServiceWorkerUpdate` hook turns
that into a sonner toast with a Reload button. Mount it next to the existing `<Toaster />`
(`__root.tsx:91`). Put the text in `en.json` and `tw.json`, like all other text.

The app never reloads on its own. A user who is typing is never interrupted.

## 2. Cloud mode offline (read-only)

### 2.1 One question to answer first

**A short experiment comes before any code in this section.** In agile writing this is
called a "spike": you write throwaway code to answer one question, then delete it. The
result is an answer, not a feature.

**The question: does Clerk still know the user is signed in when there is no network?**

This matters because `ClerkProvider` wraps the whole cloud app (`main.tsx:77`). Clerk loads
its code from another server. If Clerk cannot work offline, nothing renders offline. Then
everything else in section 2 is useless — the cached data would exist, but no screen would
ever show it.

**How to run it:** build the app, install it, turn off the network in DevTools, start the
app cold (a fresh start, not a reload), and write down what `useAuth()` reports.

The answer picks one of two paths:

| | What Clerk does | What we build |
|---|---|---|
| **Path A** | Clerk reports "signed in" from its own saved state | Save the cache under the Clerk user id. Restore it after Clerk finishes loading. |
| **Path B** | Clerk cannot answer offline | While online, save a `lastSignedInUserId` value. Offline, use it to pick the cache and show the data without checking the session. |

Path B means **cached cloud data can appear without checking that the login is still
valid**. The designer accepted this. The reasons: the data is read-only, it stays on the
device, and sign-out deletes it. Local mode already stores an unencrypted Dexie database on
the same device, so this is not a new kind of risk.

Either way, the app must still show something sensible when Clerk's code does not load at
all. It comes from another server, so we cannot precache it.

#### Experiment result (2026-09-16)

- Does the app render offline in cloud mode? **yes**
- `useAuth()` reports: `isLoaded = false`, `isSignedIn = undefined`
- Clerk script error: **yes**
- Therefore we follow: **Path B**
- Task 7b is: **needed**

We could not run the real manual test (sign in with Clerk, then go offline), because this
session has no browser and no Clerk login. Instead we built the app, served it, and used a
Playwright script to block every request to Clerk's host
(`fleet-monarch-29.clerk.accounts.dev`) on a fresh page load with `data-mode` set to
`cloud` in `localStorage`. This is a **blocked-script test, not a real signed-in session**
— it shows what happens when Clerk's code cannot be fetched at all, not what happens to an
already-signed-in user who goes offline. The app shell rendered (sidebar and nav were
visible), Clerk logged a `failed_to_load_clerk_js` error, and `useAuth()` stayed at
`isLoaded: false` for at least 15 seconds. We also read the `ClerkProvider` source in
`node_modules/@clerk/react`: it renders its `children` unconditionally, with no gate on
Clerk having loaded, so the app shell renders regardless of Clerk's state — the risk is not
a blank screen, it is that `isLoaded` never becomes `true`.

### 2.2 Two redirects must know about offline

Both redirects react to a state that being offline can create by mistake.

| Where | What it does today | What to change |
|---|---|---|
| `CloudAuthGuard`, `__root.tsx:29-40` | Sends the user to `/sign-in` when `isLoaded && !isSignedIn` | Only redirect when the device is online |
| Onboarding redirect, `__root.tsx:66-78` | Sends the user to `/onboarding` when `allLoaded && isEmpty` | Do not redirect in cloud mode while offline |

Without the first fix, an offline user is sent to a sign-in page they cannot finish. Their
cached data is on the device, but they cannot reach it.

Without the second fix, a cloud user whose cache did not restore is sent to onboarding. To
that user it looks like all their data was deleted.

**How to detect offline:** use `navigator.onLine`, but only trust it when it is `false`. A
`false` value reliably means there is no network connection. A `true` value does not prove
the server can be reached. We only use the half we can trust.

### 2.3 Saving and restoring the cache

New file: `apps/web/src/apollo/persistence.ts`.

- Call `cache.extract()` on a debounce and save the result to Dexie.
- Call `cache.restore()` and **wait for it to finish before `ApolloWrapper` mounts**.
- Save a `lastSyncedAt` value after each successful cloud read. The banner shows it.

**Deviation, recorded 2026-09-16.** The build does not do this. It stamps the time on the
same 5-second timer that saves the cache, and only while the device is online. So the value
records when the app was last open online, not when a cloud read last succeeded. The online
guard is what stops the banner claiming that hours-old data is fresh. Making the stamp
follow a real read is still open.

**The order matters most here.** If restore happens after the first queries run, those
queries return empty results and overwrite the saved cache. The launch that was supposed to
use the saved data destroys it instead.

**Use a separate Dexie database, not the app database.** Two reasons:

1. The app database is now at **v18** (`Location.isDefault`, merged 2026-09-14). Adding a
   table would mean a v19 migration for data that is not app data. The rules in
   `src/db/CLAUDE.md` are forward-only, so that version could never be reused or edited
   later.
2. It keeps cloud-only data out of the local-mode database. It also makes the sign-out
   cleanup a single database delete instead of clearing one table inside a shared database.

### 2.4 Blocking writes

Two layers. They are different on purpose.

**Layer 1 — the guarantee.** Add an `ApolloLink` that fails every mutation at once while
offline. It returns a typed error and shows a toast. This is one place in the code. It
catches every mutation, including ones added in the future.

**Layer 2 — polish, added over time.** A shared `useCloudWritesDisabled()` hook that greys
out the most visible write buttons. Apply it to more buttons later.

We do not try to disable every write control up front. Those controls are spread across
pantry, shopping, cooking, and item detail. That would be a very large change, every file
would be a chance to miss one, and no one could check that the list was complete. Layer 1
gives the real guarantee — no write ever fails silently — in one reviewable place.

### 2.5 The offline banner

New component: `OfflineBanner` in `components/global/`. It shows in cloud mode while
offline: *"Offline — last synced 2 hours ago."*

- Use `role="status"` so screen readers announce it without moving keyboard focus.
- Use existing design tokens for the colors. `UnitBadge` was deleted because its
  `opacity-75` failed the WCAG AA contrast check. This banner must not repeat that.
- Put the relative time and all text in i18n.

### 2.6 Delete the cache on sign-out

Hook into the existing `clerk.signOut()` call (`DataModeCard.tsx:122`). Delete the cache
database and both saved values.

Restore also checks the user id. If the saved id does not match the id it is given, it
deletes the cache instead of using it.

**That check alone is not the cross-account protection, and the first build wrongly said it
was.** At startup the app passes `restoreCache` the value of `getLastSignedInUserId()`, and
that value is written by the same code that writes the id inside the snapshot, so the two
always match. The Clerk user id of the person using the app arrives later.

Three things give the real protection, all added after the 2026-09-16 review:

1. `ApolloWrapper` compares the Clerk user id with the stored one. If a stored id exists and
   differs, it calls `clearCache()` before this account saves anything.
2. `clearCache()` also resets the in-memory `cloudCache`. Signing out does not reload the
   page, so clearing only IndexedDB left the previous account's rows in memory, where the
   default `cache-first` policy served them to the next account.
3. The `ApolloWrapper` effect cleanup does not save. It runs on sign-out with the old user
   id still in its closure, so saving there wrote the cache straight back into IndexedDB
   one tick after `clearCache()` deleted it.

## 3. Testing

### E2E constraint

**The Vite dev server has no service worker** unless `devOptions.enabled` is set. A service
worker only appears in a real build. So offline E2E tests must run against the built output
(`vite preview`), not `pnpm dev`. This needs a Playwright project that serves the preview
build. The rule in `e2e/CLAUDE.md` still applies: only one E2E suite can run per machine.

### Mutation checks

The repo rule says a passing test proves nothing until you watch it fail. For each test
below, break the source code, run the test, and check it turns **red**.

| Behavior | Break this, and the test must fail |
|---|---|
| Cache restores before the first query | Move `restore()` to after mount |
| Restore deletes the cache on a user id mismatch | Remove the id comparison |
| `CloudAuthGuard` does not redirect offline | Remove the online check |
| Offline mutations fail at once | Remove the `ApolloLink` guard |

**Warning about the test fixture.** This is the same trap as `stockId` in this repo. If the
saved cache in the test is empty, the test passes both when restore runs first and when it
runs last. Empty data cannot tell the two cases apart. So the fixture must contain real
saved data **and** run a query that would overwrite it. Without that, the test always passes
and proves nothing, but it still counts as coverage, so nobody checks it again.

### Storybook and a11y

`OfflineBanner` needs `.stories.tsx` with three stories: online, offline with recent data,
offline with old data. It also needs the matching `.stories.test.tsx` smoke test. Add the
banner to `e2e/tests/a11y.spec.ts` for both light and dark mode.

## 4. Risks

1. **An old service worker stays active during development.** This is a common problem. Add
   a clear way to unregister it and reset. Keep `devOptions` off by default.
2. **`_redirects` and Workbox `navigateFallback` can disagree.** Both send unknown URLs to
   `index.html`. `apps/web/public/_redirects` contains `/* /index.html 200`. If the two
   rules differ, a deep link behaves differently offline than online.
3. **Clerk's code comes from another server and cannot be precached.** See section 2.1.
4. **iOS may delete stored data.** Safari limits storage for sites the user has not opened
   recently. Installed web apps are usually exempt. **Check this during implementation. Do
   not assume it.** If we are wrong, a user's cached pantry disappears without warning.

## 5. Rollout

Registering a service worker on `player1inventory.etblue.tw` cannot be undone easily. After
it is registered, it controls every later deploy for that domain.

**So the way to turn it off must ship in the same PR that registers it.** Do not add it
afterwards.

## 6. Changes made during implementation

The build matches this design in almost every part. Five things changed. Each one is
recorded below, with the reason.

Commits, in order: `3e34fe66`, `6ec4e01c`, `556e1176`, `1ff6e19c`, `6d890f74`, `5c4a48c7`,
`fcb0fafd`, `47a8f88d`, `cfb124f7`, `51e38678`, `44268bf7`, `4a3448aa`, `f99b2e3e`,
`e39b6e7d`, `f14881b0`, `f7a583ee`, `0bf8b76d`, `d68f8bf4`.

E2E: 69 tests passed in the `pwa` project. 135 tests passed for `--grep "pwa|a11y"`. Axe
found no accessibility violations on the offline banner, in light mode or dark mode.
`dist/sw.js` has **23** precache entries. This includes all 6 `rosario-*.woff2` font
files. 19 of the 23 are distinct files. Four icons appear twice — `pwa-64x64.png`,
`pwa-192x192.png`, `pwa-512x512.png` and `maskable-icon-512x512.png` — because Workbox
picks them up from `dist/` and the assets generator also injects the manifest icons. The
count was written as 22 before the 2026-09-16 review; it was wrong, and this number was
counted from the built file.

### 1. Task 7b was rebuilt

The design in section 2.1 guessed that `ClerkProvider` might block the app from rendering
offline. The Task 1 experiment proved this guess wrong. `ClerkProvider` renders its children
with no condition. It does not block anything.

The real problem is different. `useAuth()` stays at `isLoaded: false` forever when offline.
`getToken()` never finishes either. `SetContextLink` waits for `getToken()` before every
request. So a cache miss while offline would wait forever and never resolve.

The fix is a new function, `resolveToken`, in `apps/web/src/apollo/client.ts`:

- If the device is offline, it returns `null` right away.
- If the device is online, it waits up to 3 seconds for `getToken()`. After 3 seconds it
  gives up and returns `null`.

Both places that need a token use `resolveToken`. One is the HTTP auth link. The other is
the WebSocket `connectionParams`.

### 2. The onboarding redirect became a pure function

The redirect logic now lives in `apps/web/src/routes/shouldRedirectToOnboarding.ts`. It is a
plain function with no side effects. This makes it easy to test on its own. It has 7 test
cases.

### 3. The cloud startup order became `bootstrap.ts`

The startup order — restore the cache, then render the app — now lives in
`apps/web/src/bootstrap.ts`, in a function called `bootstrapCloudMode(restore, render)`.

This is the most important rule in the whole design. Before this change, no test checked
it. Now a test can prove the cache restore always finishes before React mounts.

### 4. `OfflineBanner` uses `<output>`, not `role="status"` on a `<div>`

The design said to use `role="status"` on a `div`. The built component uses an `<output>`
element instead. An `<output>` element already carries the ARIA role `status`, without
needing the attribute. Biome's `useSemanticElements` lint rule requires the real element
instead of adding the role by hand.

### 5. Testing `virtual:pwa-register` needed an alias, not just a mock

`virtual:pwa-register` is a Vite virtual module. It only exists at build time, through
`vite-plugin-pwa`. Vitest cannot resolve it. A plain `vi.mock` was not enough, because the
import itself fails before any mock can run.

The fix is an alias in `apps/web/vitest.config.ts`. It points `virtual:pwa-register` at a
stub file, `apps/web/src/test/virtualPwaRegisterStub.ts`. This alias only affects tests. The
real `vite.config.ts`, used for production builds, is untouched. It still uses the real
`vite-plugin-pwa` module.

### Still open

Two questions from this design are not answered yet. Neither can be checked from this repo.
Do not treat them as done.

**1. iOS storage eviction (design risk 4).**

Safari limits how long it keeps stored data for sites the user has not opened recently.
Installed web apps are usually exempt from this limit, but nobody has confirmed it for this
app.

How to check it:

1. Install the app on an iPhone.
2. Use it once.
3. Leave it alone for more than seven days.
4. Open it again with no network connection.
5. Check whether the cached data is still there.

If the data is gone, cloud offline reads cannot be relied on for iOS. The banner text would
then need to say so.

**2. A real signed-in Clerk session going offline.**

The Task 1 experiment tested a cold start with Clerk's script blocked. It did not test a
user who is already signed in and then loses the network. That case needs a real device and
a real Clerk login to test.
