# PWA + Offline — brainstorming

**Date:** 2026-08-31 (rewritten in plain English 2026-09-16)
**Branch:** `feature/pwa-offline`
**Design:** [2026-08-31-pwa-offline-design.md](2026-08-31-pwa-offline-design.md)

## The request

> "User wants to be able to add the web app to their mobile home screen, and access it
> offline when necessary. How about making the project a PWA? And how about using a
> service worker?"

Classified as **architectural**. A service worker is a new subsystem. It has its own
lifecycle: install, update, and cache invalidation. It sits under the whole app and affects
both data modes. It is not a small change to code that already exists.

## Questions and answers

### Q1 — When offline, what must work?

Options offered: local mode only · local full + cloud read-only · both modes fully offline ·
install only.

**Answer: local mode works fully. Cloud mode shows the last synced data, read-only.**

Why: local data already lives on the device in Dexie. Only the app files are missing. To
accept cloud *writes* while offline, we would need a queue of pending changes and conflict
resolution. That overlaps the deferred
[seamless offline ↔ online migration](../backend/2026-04-04-seamless-offline-online-migration-design.md).
Read-only is the honest middle option. The user can still check what is in the pantry while
standing in front of it.

### Q2 — What happens when a new version is deployed?

Options: ask the user to reload · update on next launch · reload at once.

**Answer: ask the user to reload.** Never interrupt someone who is typing. The user picks
the moment. This maps directly to `vite-plugin-pwa`'s `registerType: 'prompt'`.

### Q3 — Where does the icon artwork come from?

Options: user supplies it · generate from design tokens · handle it separately later.

**Answer: generate from design tokens.** One source SVG in the repo. It matches the existing
colors. It can be replaced later without changing the generator script.

### Q4 — How do we invite the user to install?

Options: a Settings row for both platforms · browser defaults only · a dismissible banner.

**Answer: browser defaults only, for now.** The user asked if the in-app entry could be
added later if needed. It can. The manifest is required for all three options, so adding a
Settings row or a banner later is extra work only, not rework.

Accepted result: iOS users get no guidance inside the app, because iOS Safari never fires
`beforeinstallprompt`.

### Q5 — What does cloud mode show offline?

Options: cached data + banner · cached data + banner with sync time · an offline screen with
no data.

**Answer: cached data + a banner that says when it was last synced.** The time is what makes
old pantry data trustworthy instead of merely present.

## Approach decision

Three approaches were compared:

- **A — `vite-plugin-pwa` (generateSW) + our own Apollo cache persistence** ← chosen
- **B — a fully hand-written service worker**, no new build dependencies
- **C — `vite-plugin-pwa` in `injectManifest` mode**, where we write the service worker body

**A was chosen.** It is the only option where the chosen update behavior is a config value
instead of code we maintain. It also keeps the one custom piece — cloud cache persistence,
which touches login and privacy — as reviewable code in the repo.

**B was rejected.** Writing the service worker by hand means we build the file list and the
per-build revisions ourselves. That is where hand-written service workers usually break: a
cached `index.html` points at JS files from an older build that no longer exist. The user
sees a white screen, and only clearing browser storage fixes it. The extra control does not
help this project.

**C is the fallback, not a rival.** With cloud read-only offline, there is no custom service
worker logic to write. If we later want offline writes, the queue of pending changes goes in
an `injectManifest` service worker, and the config change from A is small.

## Version facts (checked against the registry, not from memory)

- `vite-plugin-pwa@1.3.0` supports `vite: ^3 || ^4 || ^5 || ^6 || ^7 || ^8`. This repo uses
  `vite@^7.2.4`. Compatible.
- `@vite-pwa/assets-generator@1.0.2` exists and generates the icon set.
- **`apollo3-cache-persist@0.15.0` says it works with `@apollo/client: ^3.7.17`.** This repo
  uses `^4.1.6`. It does not claim to support version 4. This is why we write the cache
  persistence ourselves instead of adding the library.

## Problems found while reading the code

Line numbers below were re-checked on 2026-09-16, after 43 commits landed on `main`.

1. **`ClerkProvider` wraps the whole cloud app** (`main.tsx:77`) and loads its code from
   another server. If it fails offline, cloud mode shows nothing, and cache persistence
   cannot help. Still unknown → this became step 1 of the plan, a short experiment.
2. **`CloudAuthGuard` redirects on `isLoaded && !isSignedIn`** (`__root.tsx:29-40`). Offline,
   this can send the user to a sign-in page they cannot finish, while their cached data sits
   unreachable on the device.
3. **The onboarding redirect fires on `allLoaded && isEmpty`** (`__root.tsx:66-78`). A cloud
   user whose cache did not restore is offered onboarding. To that user it looks like their
   data was deleted.
4. **Rosario loads from Google Fonts** (`index.html:24-26`). A runtime cache only helps after
   one successful online visit. A first offline start would fall back to a system font and
   shift every layout.

## Accepted trade-offs

- **Cached cloud data may appear without checking that the login is still valid**, if the
  experiment shows Clerk cannot answer offline. Accepted because the data is read-only, it
  stays on the device, and sign-out deletes it. Local mode already keeps an unencrypted
  Dexie database on the same device.
- **One `ApolloLink` guard instead of disabling every write control.** Accepted because one
  guard catches every mutation, including future ones. Disabling each control would mean a
  very large change across pantry, shopping, cooking, and item detail, with no way to check
  the list was complete. Disabling individual controls continues later as polish.
