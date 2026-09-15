# PWA + Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user can add the app to a mobile home screen and use it offline — local mode fully, cloud mode read-only.

**Architecture:** `vite-plugin-pwa` in `generateSW` mode builds the service worker and the precache file list. The Apollo cache is saved to its own Dexie database and restored before React mounts. Offline writes are blocked by one `ApolloLink`, not by disabling controls one by one.

**Tech Stack:** Vite 7, React 19, TanStack Router, Apollo Client 4, Dexie 4, Workbox (through `vite-plugin-pwa`), Playwright, Vitest, Storybook.

**Spec:** [`docs/global/pwa/2026-08-31-pwa-offline-design.md`](2026-08-31-pwa-offline-design.md)

## Global Constraints

Every task must follow these. They come from the spec and from the repo rules.

- **Plain English** in all text a person reads: commit messages, PR text, code comments, docs. Short sentences. No idioms. Keep exact file names, function names, and numbers.
- **Dependency versions, exact:** `vite-plugin-pwa@1.3.0`, `@vite-pwa/assets-generator@1.0.2`. Do **not** add `apollo3-cache-persist` — it declares `@apollo/client: ^3.7.17` and this repo uses `^4.1.6`.
- **Do not add a table to the app Dexie database.** It is at v18. The Apollo cache goes in a separate database named `Player1InventoryCloudCache`.
- **Offline detection:** trust `navigator.onLine` only when it is `false`. A `true` value does not prove the server can be reached.
- **All user-visible text goes in i18n** — both `apps/web/src/i18n/locales/en.json` and `tw.json`. Never hardcode English in a component.
- **Every new component needs** `ComponentName.tsx`, a thin `index.ts` barrel, `ComponentName.stories.tsx`, and `ComponentName.stories.test.tsx`.
- **Mutation check is required.** After a test passes, break the source, re-run the test, and confirm it fails. Report which mutation you ran. A test that stays green is a broken test.
- **Verification gate after every task.** Run these from the repo root, each with its own path:
  ```bash
  (cd apps/web && pnpm lint)
  pnpm build 2>&1 | tee /tmp/p1i-build.log
  (cd apps/web && pnpm check)
  grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK"
  pnpm test
  ```
- **Commit at the end of every task.** Use a scope: `feat(pwa): ...`, `test(pwa): ...`, `docs(pwa): ...`.

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `apps/web/public/icon-source.svg` | The one source image. All icons are generated from it. |
| `apps/web/src/hooks/useIsOffline.ts` | Reports whether the device is offline. Used by the redirects, the banner, and the write guard. |
| `apps/web/src/hooks/useServiceWorkerUpdate.ts` | Turns the `needRefresh` signal into a toast with a Reload button. |
| `apps/web/src/apollo/cacheDb.ts` | The separate Dexie database that stores the saved Apollo cache. |
| `apps/web/src/apollo/persistence.ts` | Save, restore, and delete the Apollo cache. Owns `lastSyncedAt` and `lastSignedInUserId`. |
| `apps/web/src/apollo/offlineWriteLink.ts` | An `ApolloLink` that fails mutations at once while offline. |
| `apps/web/src/components/global/OfflineBanner/OfflineBanner.tsx` | The banner that says the app is offline and when data was last synced. |
| `e2e/tests/pwa-offline.spec.ts` | Offline E2E tests. Runs against the built app, not the dev server. |

**Modified files**

| Path | Change |
|---|---|
| `apps/web/vite.config.ts` | Add the `VitePWA` plugin and the manifest. |
| `apps/web/index.html` | Remove the Google Fonts tags (lines 24-26). Add Apple tags. |
| `apps/web/package.json` | Add dependencies and the `generate-icons` script. |
| `apps/web/src/main.tsx:77` | Restore the cache before mounting. Register the service worker. |
| `apps/web/src/routes/__root.tsx:29-40, 66-78, 91` | Teach both redirects about offline. Mount the banner and the update toast. |
| `apps/web/src/apollo/client.ts` | Add `offlineWriteLink` to the link chain. |
| `apps/web/src/components/settings/DataModeCard/DataModeCard.tsx:122` | Delete the cache on sign-out. |
| `e2e/constants.ts` | Add `PWA_WEB_PORT` and `PWA_WEB_URL`. |
| `e2e/playwright.config.ts` | Add a third project and `webServer` that serve the built app. |
| `e2e/tests/a11y.spec.ts` | Add the banner to the accessibility scan. |

---

## Task 1: Find out if Clerk works offline

This task is an **experiment**, not a feature. You write throwaway code, get an answer, then delete the code. The result is a written answer. Nothing here is committed except the answer.

**Why this is first:** `ClerkProvider` wraps the whole cloud app (`apps/web/src/main.tsx:77`). Clerk loads its code from another server. If `ClerkProvider` never renders its children when that code fails to load, then cloud mode shows a blank screen offline, and Tasks 8 to 12 build something no one can ever see.

**Files:**
- Modify (temporarily, then revert): none required
- Append the answer to: `docs/global/pwa/2026-08-31-pwa-offline-design.md`

**Interfaces:**
- Consumes: nothing
- Produces: an answer that decides whether **Task 7b** runs or is skipped

- [ ] **Step 1: Build and serve the app in cloud mode**

```bash
(cd apps/web && pnpm build)
(cd apps/web && pnpm preview --port 4173)
```

- [ ] **Step 2: Sign in while online**

Open `http://localhost:4173`. Go to Settings and switch to cloud mode. Sign in with Clerk. Confirm your items load.

- [ ] **Step 3: Go offline and start the app cold**

In Chrome DevTools, open the Network tab and set throttling to **Offline**. Then close the tab completely and open `http://localhost:4173` in a new tab. A reload is not enough — it must be a fresh start, because that is what an installed app does.

- [ ] **Step 4: Record what happens**

Write down all three answers:

1. Does anything render at all, or is the screen blank?
2. What does `useAuth()` report? Add this temporarily to `apps/web/src/routes/__root.tsx` inside `CloudAuthGuard` to see it:

```tsx
console.log('[offline probe]', { isLoaded, isSignedIn })
```

3. Does the console show an error from Clerk's script failing to load?

- [ ] **Step 5: Revert the probe code**

```bash
git checkout apps/web/src/routes/__root.tsx
```

- [ ] **Step 6: Write the answer into the design doc**

Add a new subsection at the end of section 2.1 of `docs/global/pwa/2026-08-31-pwa-offline-design.md`. Use this exact heading so later tasks can find it:

```markdown
#### Experiment result (YYYY-MM-DD)

- Does the app render offline in cloud mode? **yes / no**
- `useAuth()` reports: `isLoaded = ...`, `isSignedIn = ...`
- Clerk script error: **yes / no**
- Therefore we follow: **Path A / Path B**
- Task 7b is: **needed / not needed**
```

**Decision rule:** Task 7b is **needed** if the screen is blank offline, or if `isLoaded` never becomes `true`. Task 7b is **not needed** if the app renders and only `isSignedIn` is `false`.

- [ ] **Step 7: Commit the answer**

```bash
git add docs/global/pwa/2026-08-31-pwa-offline-design.md
git commit -m "docs(pwa): record whether Clerk works offline"
```

---

## Task 2: Generate the app icons

**Files:**
- Create: `apps/web/public/icon-source.svg`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: nothing
- Produces: PNG files in `apps/web/public/` that Task 4's manifest points at — `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`

- [ ] **Step 1: Add the generator dependency**

```bash
(cd apps/web && pnpm add -D @vite-pwa/assets-generator@1.0.2)
```

- [ ] **Step 2: Create the source image**

Create `apps/web/public/icon-source.svg`. It must be square and at least 512x512. Use the app's existing brand colors. Keep the drawing inside the middle 80% of the square, because Android crops icons into a circle.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#1f6f4a" />
  <g fill="none" stroke="#f7f3e8" stroke-width="28" stroke-linecap="round" stroke-linejoin="round">
    <path d="M160 176h192v160a32 32 0 0 1-32 32H192a32 32 0 0 1-32-32z" />
    <path d="M208 176v-24a48 48 0 0 1 96 0v24" />
    <path d="M208 248h96" />
  </g>
</svg>
```

- [ ] **Step 3: Add the generator script**

In `apps/web/package.json`, add to `"scripts"`:

```json
"generate-icons": "pwa-assets-generator --preset minimal-2023 public/icon-source.svg"
```

- [ ] **Step 4: Run it**

```bash
(cd apps/web && pnpm generate-icons)
```

- [ ] **Step 5: Check the files exist and are not empty**

```bash
ls -l apps/web/public/pwa-192x192.png apps/web/public/pwa-512x512.png apps/web/public/maskable-icon-512x512.png apps/web/public/apple-touch-icon-180x180.png
```

Expected: four files, each larger than 0 bytes. If a name differs, use the real names in Task 4 rather than renaming the files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/public apps/web/package.json pnpm-lock.yaml
git commit -m "feat(pwa): generate app icons from one source SVG"
```

---

## Task 3: Host the Rosario font ourselves

**Files:**
- Modify: `apps/web/index.html:24-26`
- Create: `apps/web/src/styles/fonts.css`
- Create: font files under `apps/web/public/fonts/`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Consumes: nothing
- Produces: a working Rosario font with no request to another server

- [ ] **Step 1: Download the font files**

Download the Rosario variable font (weights 300 to 700, normal and italic) from Google Fonts. Put the `.woff2` files in `apps/web/public/fonts/`:

```bash
mkdir -p apps/web/public/fonts
```

Expected result: `rosario-variable.woff2` and `rosario-variable-italic.woff2` in that folder.

- [ ] **Step 2: Write the font CSS**

Create `apps/web/src/styles/fonts.css`:

```css
@font-face {
  font-family: 'Rosario';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url('/fonts/rosario-variable.woff2') format('woff2');
}

@font-face {
  font-family: 'Rosario';
  font-style: italic;
  font-weight: 300 700;
  font-display: swap;
  src: url('/fonts/rosario-variable-italic.woff2') format('woff2');
}
```

- [ ] **Step 3: Import it**

Add this as the first line of `apps/web/src/index.css`:

```css
@import './styles/fonts.css';
```

- [ ] **Step 4: Remove the Google Fonts tags**

In `apps/web/index.html`, delete these three lines (currently lines 24 to 26):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Rosario:ital,wght@0,300..700;1,300..700&display=swap" rel="stylesheet" />
```

- [ ] **Step 5: Check no request goes to Google**

```bash
grep -rn "fonts.googleapis\|fonts.gstatic" apps/web/index.html apps/web/src
```

Expected: no output. If there is output, a reference was missed.

- [ ] **Step 6: Check the font still renders**

```bash
(cd apps/web && pnpm build && pnpm preview --port 4173)
```

Open the app. In DevTools, open the Network tab and filter by `Font`. Confirm the font loads from `localhost`, not from `fonts.gstatic.com`. Confirm the text does not look like a system font.

- [ ] **Step 7: Commit**

```bash
git add apps/web/index.html apps/web/public/fonts apps/web/src/styles/fonts.css apps/web/src/index.css
git commit -m "feat(pwa): host the Rosario font ourselves

A Google Fonts link cannot be precached. On a first offline start the
font would be missing and every layout would shift. Hosting the files
ourselves puts them in the precache."
```

---

## Task 4: Add the service worker and the manifest

This task also adds the way to turn the service worker off. The spec requires both in the same change, because registering a service worker on the real domain cannot be undone easily.

**Files:**
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/main.tsx`
- Create: `apps/web/src/lib/unregisterServiceWorker.ts`

**Interfaces:**
- Consumes: the icon file names from Task 2
- Produces: `registerSW` is available from `virtual:pwa-register`; `unregisterAllServiceWorkers()` is exported from `apps/web/src/lib/unregisterServiceWorker.ts`

- [ ] **Step 1: Add the plugin**

```bash
(cd apps/web && pnpm add -D vite-plugin-pwa@1.3.0)
```

- [ ] **Step 2: Configure it**

In `apps/web/vite.config.ts`, add the import and the plugin. Put `VitePWA` last in the `plugins` array.

```ts
import { VitePWA } from 'vite-plugin-pwa'

// inside plugins: [...]
VitePWA({
  registerType: 'prompt',
  injectRegister: null,
  devOptions: { enabled: false },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    navigateFallback: '/index.html',
  },
  manifest: {
    name: 'Player 1 Inventory',
    short_name: 'Inventory',
    description: 'Grocery and pantry management',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f3e8',
    theme_color: '#1f6f4a',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
}),
```

`navigateFallback: '/index.html'` must match `apps/web/public/_redirects`, which contains `/* /index.html 200`. If they differ, a deep link behaves differently offline than online.

- [ ] **Step 3: Add the Apple tags**

In `apps/web/index.html`, inside `<head>`, add:

```html
<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Inventory" />
<meta name="theme-color" content="#1f6f4a" />
```

- [ ] **Step 4: Write the way to turn it off**

Create `apps/web/src/lib/unregisterServiceWorker.ts`:

```ts
/**
 * Removes every service worker and every cache this origin owns.
 *
 * Use this when a bad service worker is stuck in a browser. Call it from the
 * DevTools console: `window.__unregisterServiceWorkers()`.
 * The app registers it on `window` in main.tsx.
 */
export async function unregisterAllServiceWorkers(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
  window.location.reload()
}
```

- [ ] **Step 5: Add the types**

In `apps/web/tsconfig.app.json`, add `"vite-plugin-pwa/client"` to `compilerOptions.types`. If there is no `types` array, add one:

```json
"types": ["vite-plugin-pwa/client"]
```

- [ ] **Step 6: Expose the off switch in main.tsx**

In `apps/web/src/main.tsx`, add near the top after the imports:

```ts
import { unregisterAllServiceWorkers } from './lib/unregisterServiceWorker'

// Escape route for a stuck service worker. Call from the DevTools console.
;(window as unknown as Record<string, unknown>).__unregisterServiceWorkers =
  unregisterAllServiceWorkers
```

- [ ] **Step 7: Build and check the service worker exists**

```bash
(cd apps/web && pnpm build)
ls -l apps/web/dist/sw.js apps/web/dist/manifest.webmanifest
```

Expected: both files exist. If `sw.js` is missing, the plugin is not in the `plugins` array.

- [ ] **Step 8: Commit**

```bash
git add apps/web/vite.config.ts apps/web/index.html apps/web/src/main.tsx apps/web/src/lib/unregisterServiceWorker.ts apps/web/tsconfig.app.json apps/web/package.json pnpm-lock.yaml
git commit -m "feat(pwa): add the service worker, manifest, and an off switch

The off switch ships in the same commit as registration on purpose.
Registering a service worker on the real domain cannot be undone easily."
```

---

## Task 5: Ask the user to reload after a new deploy

**Files:**
- Create: `apps/web/src/hooks/useServiceWorkerUpdate.ts`
- Create: `apps/web/src/hooks/useServiceWorkerUpdate.test.ts`
- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`, `tw.json`

**Interfaces:**
- Consumes: `registerSW` from `virtual:pwa-register` (Task 4)
- Produces: `useServiceWorkerUpdate(): void` — call it once inside `RootComponent`

- [ ] **Step 1: Add the text**

In `apps/web/src/i18n/locales/en.json`, add a top-level `pwa` key:

```json
"pwa": {
  "updateAvailable": "A new version is available.",
  "reload": "Reload",
  "offlineTitle": "Offline",
  "offlineSyncedAt": "Showing data from {{time}}",
  "offlineNeverSynced": "Showing no data. Connect to load your items.",
  "writeBlocked": "You are offline. Changes cannot be saved right now."
}
```

In `tw.json`, add the same keys with Traditional Chinese values:

```json
"pwa": {
  "updateAvailable": "有新版本可用。",
  "reload": "重新載入",
  "offlineTitle": "離線",
  "offlineSyncedAt": "顯示 {{time}} 的資料",
  "offlineNeverSynced": "沒有可顯示的資料。請連線以載入項目。",
  "writeBlocked": "您目前離線，暫時無法儲存變更。"
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/hooks/useServiceWorkerUpdate.test.ts`:

```ts
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastMock = vi.fn()
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toastMock(...args) }))

let capturedOnNeedRefresh: (() => void) | undefined
vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: { onNeedRefresh?: () => void }) => {
    capturedOnNeedRefresh = options.onNeedRefresh
    return vi.fn()
  },
}))

import { useServiceWorkerUpdate } from './useServiceWorkerUpdate'

describe('useServiceWorkerUpdate', () => {
  beforeEach(() => {
    toastMock.mockClear()
    capturedOnNeedRefresh = undefined
  })

  it('user sees a reload prompt when a new version is ready', () => {
    // Given the hook is mounted
    renderHook(() => useServiceWorkerUpdate())
    expect(toastMock).not.toHaveBeenCalled()

    // When the service worker reports a new version
    capturedOnNeedRefresh?.()

    // Then a toast is shown with a reload action
    expect(toastMock).toHaveBeenCalledTimes(1)
    const [, options] = toastMock.mock.calls[0] as [string, { action?: { label: string } }]
    expect(options.action?.label).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
(cd apps/web && pnpm vitest run src/hooks/useServiceWorkerUpdate.test.ts)
```

Expected: FAIL, because `./useServiceWorkerUpdate` does not exist.

- [ ] **Step 4: Write the hook**

Create `apps/web/src/hooks/useServiceWorkerUpdate.ts`:

```ts
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { registerSW } from 'virtual:pwa-register'

/**
 * Registers the service worker and asks the user to reload when a new
 * version is ready. The app never reloads on its own, so a user who is
 * typing is never interrupted.
 */
export function useServiceWorkerUpdate(): void {
  const { t } = useTranslation()

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        toast(t('pwa.updateAvailable'), {
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: t('pwa.reload'),
            onClick: () => {
              void updateSW(true)
            },
          },
        })
      },
    })
  }, [t])
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
(cd apps/web && pnpm vitest run src/hooks/useServiceWorkerUpdate.test.ts)
```

Expected: PASS.

- [ ] **Step 6: Mutation check**

Delete the `toast(...)` call inside `onNeedRefresh`. Re-run the test. It must **fail**. Restore the code and confirm it passes again. Write in your report: "Mutation: removed the toast call — test went red."

- [ ] **Step 7: Call the hook**

In `apps/web/src/routes/__root.tsx`, inside `RootComponent`, next to the existing `useLanguage()` call:

```tsx
useServiceWorkerUpdate()
```

- [ ] **Step 8: Add the test stub so other tests do not break**

The virtual module does not exist under Vitest. In `apps/web/src/test/setup.ts`, add:

```ts
vi.mock('virtual:pwa-register', () => ({
  registerSW: () => () => Promise.resolve(),
}))
```

- [ ] **Step 9: Run the whole suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/hooks/useServiceWorkerUpdate.ts apps/web/src/hooks/useServiceWorkerUpdate.test.ts apps/web/src/routes/__root.tsx apps/web/src/test/setup.ts apps/web/src/i18n/locales/en.json apps/web/src/i18n/locales/tw.json
git commit -m "feat(pwa): ask the user to reload when a new version is ready"
```

---

## Task 6: Report whether the device is offline

**Files:**
- Create: `apps/web/src/hooks/useIsOffline.ts`
- Create: `apps/web/src/hooks/useIsOffline.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `useIsOffline(): boolean` — returns `true` only when `navigator.onLine` is `false`. Also `isOffline(): boolean`, a plain function for non-React code (Task 10 uses it).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/useIsOffline.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOffline, useIsOffline } from './useIsOffline'

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useIsOffline', () => {
  it('user is treated as online when navigator.onLine is true', () => {
    // Given the browser reports a connection
    setOnLine(true)

    // When the hook renders
    const { result } = renderHook(() => useIsOffline())

    // Then the app is not offline
    expect(result.current).toBe(false)
  })

  it('user is treated as offline when navigator.onLine is false', () => {
    // Given the browser reports no connection
    setOnLine(false)

    // When the hook renders
    const { result } = renderHook(() => useIsOffline())

    // Then the app is offline
    expect(result.current).toBe(true)
  })

  it('user sees the value change when the browser fires offline', () => {
    // Given the browser starts online
    setOnLine(true)
    const { result } = renderHook(() => useIsOffline())
    expect(result.current).toBe(false)

    // When the connection drops
    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })

    // Then the hook reports offline without a reload
    expect(result.current).toBe(true)
  })
})

describe('isOffline', () => {
  it('returns true only when navigator.onLine is false', () => {
    setOnLine(false)
    expect(isOffline()).toBe(true)

    setOnLine(true)
    expect(isOffline()).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
(cd apps/web && pnpm vitest run src/hooks/useIsOffline.test.ts)
```

Expected: FAIL — the file does not exist.

- [ ] **Step 3: Write the hook**

Create `apps/web/src/hooks/useIsOffline.ts`:

```ts
import { useSyncExternalStore } from 'react'

/**
 * Reports whether the device has no network connection.
 *
 * We trust `navigator.onLine` only when it is `false`. A `false` value
 * reliably means there is no connection. A `true` value does not prove the
 * server can be reached, so we never use it to claim the app is online.
 */
export function isOffline(): boolean {
  return navigator.onLine === false
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, () => false)
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
(cd apps/web && pnpm vitest run src/hooks/useIsOffline.test.ts)
```

Expected: PASS — all four tests.

- [ ] **Step 5: Mutation check**

Change `isOffline` to `return !navigator.onLine`. Run the tests. They still pass, because the fixture only uses `true` and `false`. That is the point of the next mutation: change it to `return false`. The tests must now **fail**. Restore and confirm green. Report both mutations.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useIsOffline.ts apps/web/src/hooks/useIsOffline.test.ts
git commit -m "feat(pwa): add a hook that reports whether the device is offline"
```

---

## Task 7: Stop the two redirects from firing offline

**Files:**
- Modify: `apps/web/src/routes/__root.tsx:29-40` and `:66-78`
- Create: `apps/web/src/routes/__root.offline.test.tsx`

**Interfaces:**
- Consumes: `useIsOffline` (Task 6)
- Produces: nothing new

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/__root.offline.test.tsx`:

```tsx
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useRouterState: () => '/',
  }
})

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isSignedIn: false, isLoaded: true }),
}))

import { CloudAuthGuard } from './__root'

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

afterEach(() => {
  navigateMock.mockClear()
  vi.restoreAllMocks()
})

describe('CloudAuthGuard', () => {
  it('user is sent to sign-in when signed out and online', async () => {
    // Given the device has a connection and Clerk says signed out
    setOnLine(true)

    // When the guard renders
    render(<CloudAuthGuard />)

    // Then the user is sent to the sign-in page
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: '/sign-in' })
    })
  })

  it('user stays on the page when signed out and offline', async () => {
    // Given the device has no connection and Clerk says signed out
    setOnLine(false)

    // When the guard renders
    render(<CloudAuthGuard />)

    // Then the user is NOT sent to a sign-in page they cannot finish
    await waitFor(() => {
      expect(navigateMock).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
(cd apps/web && pnpm vitest run src/routes/__root.offline.test.tsx)
```

Expected: FAIL. `CloudAuthGuard` is not exported, and the offline case redirects today.

- [ ] **Step 3: Export the guard and add the offline check**

In `apps/web/src/routes/__root.tsx`, change `function CloudAuthGuard()` to `export function CloudAuthGuard()`, and change the effect:

```tsx
export function CloudAuthGuard() {
  const { isSignedIn, isLoaded } = useAuth()
  const navigate = useNavigate()
  const offline = useIsOffline()

  useEffect(() => {
    // Do not redirect while offline. Clerk cannot confirm the session
    // without a network, and a sign-in page cannot be finished offline.
    // The user's cached data is on the device and should stay reachable.
    if (offline) return
    if (isLoaded && !isSignedIn) {
      navigate({ to: '/sign-in' })
    }
  }, [isLoaded, isSignedIn, navigate, offline])

  return null
}
```

- [ ] **Step 4: Add the offline check to the onboarding redirect**

In the same file, in the effect at lines 66 to 78, add `offline` to the condition and the dependency list. Add `const offline = useIsOffline()` inside `RootComponent`.

```tsx
    if (
      allLoaded &&
      isEmpty &&
      // An empty cache offline is not the same as an empty account. Sending
      // the user to onboarding here looks like their data was deleted.
      !(mode === 'cloud' && offline) &&
      pathname !== '/onboarding' &&
      !skipOnboardingRedirect
    ) {
      navigate({ to: '/onboarding' })
    }
  }, [allLoaded, isEmpty, pathname, navigate, offline])
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
(cd apps/web && pnpm vitest run src/routes/__root.offline.test.tsx)
```

Expected: PASS — both tests.

- [ ] **Step 6: Mutation check**

Delete the `if (offline) return` line. Re-run. The second test must **fail**. Restore and confirm green. Report: "Mutation: removed the offline guard — the offline test went red."

- [ ] **Step 7: Run the whole suite and commit**

```bash
pnpm test
git add apps/web/src/routes/__root.tsx apps/web/src/routes/__root.offline.test.tsx
git commit -m "fix(pwa): do not redirect offline users to sign-in or onboarding

Offline, Clerk cannot confirm the session, so the guard saw 'signed out'
and sent the user to a page they cannot finish. The onboarding redirect
had the same problem: an empty cache offline looked like deleted data."
```

---

## Task 7b: Render the app when Clerk cannot load

**Run this task only if Task 1 wrote "Task 7b is: needed".** If Task 1 wrote "not needed", skip to Task 8 and say in your report that you skipped it and why.

**Files:**
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: `isOffline` (Task 6)
- Produces: nothing new

- [ ] **Step 1: Add a fallback tree**

In `apps/web/src/main.tsx`, in the `mode === 'cloud'` branch, wrap the Clerk tree so that an offline start does not depend on Clerk loading:

```tsx
  } else if (mode === 'cloud' && isOffline()) {
    // Clerk loads its code from another server, so it cannot start offline.
    // Render without it. The app is read-only offline, CloudAuthGuard does
    // not redirect offline, and the cache is chosen by the stored user id.
    root.render(
      <StrictMode>
        <ApolloWrapperOffline>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ApolloWrapperOffline>
      </StrictMode>,
    )
  } else if (mode === 'cloud') {
```

- [ ] **Step 2: Add the offline wrapper**

In `apps/web/src/apollo/ApolloWrapper.tsx`, add a second export that does not call `useAuth`:

```tsx
/**
 * Apollo provider for an offline cloud start, used when Clerk cannot load.
 * It never asks for a token, because no request will succeed anyway. Reads
 * come from the restored cache. Writes are blocked by offlineWriteLink.
 */
export function ApolloWrapperOffline({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => createApolloClient(async () => null), [])
  return <ApolloProvider client={client}>{children}</ApolloProvider>
}
```

- [ ] **Step 3: Check it renders offline**

```bash
(cd apps/web && pnpm build && pnpm preview --port 4173)
```

Set DevTools to Offline. Open a fresh tab at `http://localhost:4173`. The app must render, not show a blank screen.

- [ ] **Step 4: Run the suite and commit**

```bash
pnpm test
git add apps/web/src/main.tsx apps/web/src/apollo/ApolloWrapper.tsx
git commit -m "fix(pwa): render cloud mode offline when Clerk cannot load"
```

---

## Task 8: Save and restore the Apollo cache

**Files:**
- Create: `apps/web/src/apollo/cacheDb.ts`
- Create: `apps/web/src/apollo/persistence.ts`
- Create: `apps/web/src/apollo/persistence.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `saveCache(cache: InMemoryCache, userId: string): Promise<void>`
  - `restoreCache(cache: InMemoryCache, userId: string | null): Promise<boolean>` — returns `true` if data was restored
  - `clearCache(): Promise<void>`
  - `getLastSyncedAt(): Promise<Date | null>`
  - `setLastSyncedAt(date: Date): Promise<void>`
  - `getLastSignedInUserId(): string | null`
  - `setLastSignedInUserId(userId: string): void`

- [ ] **Step 1: Write the database**

Create `apps/web/src/apollo/cacheDb.ts`:

```ts
import Dexie, { type EntityTable } from 'dexie'

/**
 * Stores the saved Apollo cache for cloud mode.
 *
 * This is a separate database from the app's `Player1Inventory`. That one is
 * at v18 and holds local-mode data. The cache is not app data, so it does not
 * belong there and must not force a v19 migration. A separate database also
 * makes the sign-out cleanup a single delete.
 */
export interface CachedSnapshot {
  id: string
  userId: string
  data: string
  savedAt: number
}

export const cacheDb = new Dexie('Player1InventoryCloudCache') as Dexie & {
  snapshots: EntityTable<CachedSnapshot, 'id'>
}

cacheDb.version(1).stores({
  snapshots: 'id, userId',
})

/** There is only ever one row. The user id is checked before it is used. */
export const SNAPSHOT_ID = 'apollo-cache'
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/apollo/persistence.test.ts`:

```ts
import { InMemoryCache, gql } from '@apollo/client'
import { afterEach, describe, expect, it } from 'vitest'
import { cacheDb } from './cacheDb'
import { clearCache, restoreCache, saveCache } from './persistence'

const QUERY = gql`
  query GetItems {
    items {
      id
      name
    }
  }
`

function cacheWithOneItem() {
  const cache = new InMemoryCache()
  cache.writeQuery({
    query: QUERY,
    data: { items: [{ __typename: 'Item', id: 'item-1', name: 'Milk' }] },
  })
  return cache
}

afterEach(async () => {
  await cacheDb.snapshots.clear()
})

describe('cache persistence', () => {
  it('user sees their data again after the app restarts', async () => {
    // Given a cache holding one item, saved for user A
    await saveCache(cacheWithOneItem(), 'user-a')

    // When a fresh cache restores for the same user
    const fresh = new InMemoryCache()
    const restored = await restoreCache(fresh, 'user-a')

    // Then the item is back
    expect(restored).toBe(true)
    expect(fresh.readQuery({ query: QUERY })).toEqual({
      items: [{ __typename: 'Item', id: 'item-1', name: 'Milk' }],
    })
  })

  it('user B never sees user A data on a shared device', async () => {
    // Given user A saved a cache
    await saveCache(cacheWithOneItem(), 'user-a')

    // When user B restores
    const fresh = new InMemoryCache()
    const restored = await restoreCache(fresh, 'user-b')

    // Then nothing is restored and the stored copy is deleted
    expect(restored).toBe(false)
    expect(fresh.readQuery({ query: QUERY })).toBeNull()
    expect(await cacheDb.snapshots.count()).toBe(0)
  })

  it('restoring keeps data that a later query would overwrite', async () => {
    // Given user A saved a cache holding one item
    await saveCache(cacheWithOneItem(), 'user-a')

    // When we restore and then a query writes an EMPTY result,
    // as an offline query does
    const fresh = new InMemoryCache()
    await restoreCache(fresh, 'user-a')
    const beforeOverwrite = fresh.readQuery({ query: QUERY })

    // Then the restore had already put the data in place.
    // This is the check that fails if restore runs after the first query.
    expect(beforeOverwrite).toEqual({
      items: [{ __typename: 'Item', id: 'item-1', name: 'Milk' }],
    })
  })

  it('sign-out removes the stored copy', async () => {
    // Given a saved cache
    await saveCache(cacheWithOneItem(), 'user-a')
    expect(await cacheDb.snapshots.count()).toBe(1)

    // When the user signs out
    await clearCache()

    // Then nothing is left on the device
    expect(await cacheDb.snapshots.count()).toBe(0)
  })
})
```

**Note on the fixture.** The third test uses a cache that really holds an item. An empty cache would pass whether restore ran first or last, so it would prove nothing. This is the same trap as `stockId` described in the root `CLAUDE.md`.

- [ ] **Step 3: Run it and confirm it fails**

```bash
(cd apps/web && pnpm vitest run src/apollo/persistence.test.ts)
```

Expected: FAIL — `./persistence` does not exist.

- [ ] **Step 4: Write the implementation**

Create `apps/web/src/apollo/persistence.ts`:

```ts
import type { InMemoryCache } from '@apollo/client'
import { SNAPSHOT_ID, cacheDb } from './cacheDb'

const LAST_SYNCED_AT_KEY = 'cloud-cache-last-synced-at'
const LAST_USER_ID_KEY = 'cloud-cache-user-id'

/** Saves the current cache for one user. There is only ever one stored copy. */
export async function saveCache(
  cache: InMemoryCache,
  userId: string,
): Promise<void> {
  await cacheDb.snapshots.put({
    id: SNAPSHOT_ID,
    userId,
    data: JSON.stringify(cache.extract()),
    savedAt: Date.now(),
  })
}

/**
 * Loads the stored cache into `cache`.
 *
 * Returns `true` when data was restored. If the stored copy belongs to a
 * different user, it is deleted and nothing is restored, so one account can
 * never see another account's pantry on a shared device.
 *
 * The caller MUST await this before mounting Apollo. If the first queries run
 * first, they write empty results and destroy the stored copy.
 */
export async function restoreCache(
  cache: InMemoryCache,
  userId: string | null,
): Promise<boolean> {
  const snapshot = await cacheDb.snapshots.get(SNAPSHOT_ID)
  if (!snapshot) return false

  if (userId === null || snapshot.userId !== userId) {
    await cacheDb.snapshots.clear()
    return false
  }

  cache.restore(JSON.parse(snapshot.data))
  return true
}

/** Deletes everything this feature stored. Called on sign-out. */
export async function clearCache(): Promise<void> {
  await cacheDb.snapshots.clear()
  localStorage.removeItem(LAST_SYNCED_AT_KEY)
  localStorage.removeItem(LAST_USER_ID_KEY)
}

export async function setLastSyncedAt(date: Date): Promise<void> {
  localStorage.setItem(LAST_SYNCED_AT_KEY, String(date.getTime()))
}

export async function getLastSyncedAt(): Promise<Date | null> {
  const raw = localStorage.getItem(LAST_SYNCED_AT_KEY)
  if (!raw) return null
  const value = Number(raw)
  return Number.isNaN(value) ? null : new Date(value)
}

/**
 * The user id saved while the app was last online.
 *
 * Offline, Clerk may not be able to tell us who is signed in. This value is
 * how we still pick the right stored cache.
 */
export function getLastSignedInUserId(): string | null {
  return localStorage.getItem(LAST_USER_ID_KEY)
}

export function setLastSignedInUserId(userId: string): void {
  localStorage.setItem(LAST_USER_ID_KEY, userId)
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
(cd apps/web && pnpm vitest run src/apollo/persistence.test.ts)
```

Expected: PASS — all four tests.

- [ ] **Step 6: Mutation check — run both**

1. In `restoreCache`, delete the line `if (userId === null || snapshot.userId !== userId) {` and its block. Re-run. The "user B never sees user A data" test must **fail**.
2. In `restoreCache`, change `cache.restore(JSON.parse(snapshot.data))` to `cache.restore({})`. Re-run. The first and third tests must **fail**.

Restore the code after each. Report both mutations and that each went red.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/apollo/cacheDb.ts apps/web/src/apollo/persistence.ts apps/web/src/apollo/persistence.test.ts
git commit -m "feat(pwa): save and restore the Apollo cache for offline reads

The cache lives in its own Dexie database. The app database is at v18 and
holds local-mode data; a saved cloud cache is not app data and must not
force a v19 migration.

Restore checks the user id. A stored copy belonging to another user is
deleted instead of used, so one account cannot see another account's
pantry on a shared device."
```

---

## Task 9: Restore the cache before Apollo mounts

**Files:**
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/apollo/ApolloWrapper.tsx`

**Interfaces:**
- Consumes: everything Task 8 produces
- Produces: the cache is populated before the first query runs; `lastSyncedAt` and `lastSignedInUserId` are kept up to date

- [ ] **Step 1: Create the cache outside the client factory**

In `apps/web/src/apollo/client.ts`, export a single cache so it can be restored before the client is built:

```ts
/**
 * One cache instance for cloud mode, created before the client.
 *
 * Persistence needs to fill this in BEFORE Apollo mounts. If the first
 * queries run first, they write empty results and destroy the stored copy.
 */
export const cloudCache = new InMemoryCache()
```

Then, in `createApolloClient`, use it: change `cache: new InMemoryCache()` to `cache: cloudCache`. Leave `createApolloClientForE2E` using its own `new InMemoryCache()`, so tests start clean.

- [ ] **Step 2: Restore before render**

In `apps/web/src/main.tsx`, change the bottom of the file so cloud mode awaits the restore:

```ts
if (mode === 'local') {
  db.open()
    .then(() => bootstrapCarts())
    .then(() => {
      console.log('Database migration complete')
      renderApp()
    })
    .catch((error) => {
      console.error('Database migration failed:', error)
      renderApp()
    })
} else {
  // Cloud mode: fill the cache from the device BEFORE React mounts, so the
  // first queries do not overwrite the stored copy with empty results.
  restoreCache(cloudCache, getLastSignedInUserId())
    .catch((error) => {
      console.error('Cache restore failed:', error)
    })
    .finally(() => {
      renderApp()
    })
}
```

Add the imports:

```ts
import { cloudCache } from './apollo/client'
import { getLastSignedInUserId, restoreCache } from './apollo/persistence'
```

- [ ] **Step 3: Keep the saved copy up to date**

In `apps/web/src/apollo/ApolloWrapper.tsx`, save after each successful read and record who is signed in:

```tsx
import { ApolloProvider } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { useEffect, useMemo } from 'react'
import { cloudCache, createApolloClient } from './client'
import { saveCache, setLastSignedInUserId, setLastSyncedAt } from './persistence'

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAuth()
  const client = useMemo(() => createApolloClient(() => getToken()), [getToken])

  useEffect(() => {
    if (!userId) return
    setLastSignedInUserId(userId)

    // Save the cache every 5 seconds while the app is open, and once more when
    // the tab is hidden or closed.
    //
    // Apollo Client 4 has no public "the cache changed" event, so we save on a
    // timer instead of on every write. Saving on a timer also avoids a burst of
    // writes while a page loads several queries at once.
    const save = () => {
      void saveCache(cloudCache, userId)
      void setLastSyncedAt(new Date())
    }

    const interval = setInterval(save, 5000)

    // `visibilitychange` is more reliable than `beforeunload` on mobile
    // browsers, which often kill a backgrounded tab without firing unload.
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onHide)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onHide)
      save()
    }
  }, [client, userId])

  return <ApolloProvider client={client}>{children}</ApolloProvider>
}
```

- [ ] **Step 4: Check it by hand**

```bash
(cd apps/web && pnpm build && pnpm preview --port 4173)
```

1. Sign in to cloud mode while online. Wait for items to load. Wait 10 seconds.
2. In DevTools, open Application → IndexedDB. Confirm `Player1InventoryCloudCache` holds one row.
3. Set the Network tab to Offline. Close the tab. Open a fresh tab at the same URL.
4. Confirm your items are shown.

- [ ] **Step 5: Run the suite and commit**

```bash
pnpm test
git add apps/web/src/main.tsx apps/web/src/apollo/ApolloWrapper.tsx apps/web/src/apollo/client.ts
git commit -m "feat(pwa): restore the saved cache before Apollo mounts

The order matters. If restore runs after the first queries, those queries
write empty results and destroy the stored copy."
```

---

## Task 10: Block writes while offline

**Files:**
- Create: `apps/web/src/apollo/offlineWriteLink.ts`
- Create: `apps/web/src/apollo/offlineWriteLink.test.ts`
- Modify: `apps/web/src/apollo/client.ts`

**Interfaces:**
- Consumes: `isOffline` (Task 6)
- Produces: `offlineWriteLink: ApolloLink` and `OfflineWriteError`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/apollo/offlineWriteLink.test.ts`:

```ts
import { ApolloLink, Observable, execute, gql } from '@apollo/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}))

import { OfflineWriteError, offlineWriteLink } from './offlineWriteLink'

const MUTATION = gql`
  mutation AddItem {
    addItem(name: "Milk") {
      id
    }
  }
`

const QUERY = gql`
  query GetItems {
    items {
      id
    }
  }
`

let reachedNetwork = false

const fakeNetwork = new ApolloLink(() => {
  reachedNetwork = true
  return Observable.of({ data: { ok: true } })
})

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

afterEach(() => {
  reachedNetwork = false
  toastErrorMock.mockClear()
  vi.restoreAllMocks()
})

describe('offlineWriteLink', () => {
  it('user sees an error instead of a hang when saving offline', async () => {
    // Given the device is offline
    setOnLine(false)
    const link = offlineWriteLink.concat(fakeNetwork)

    // When a mutation runs
    const error = await new Promise<Error>((resolve) => {
      execute(link, { query: MUTATION }).subscribe({
        error: resolve,
        next: () => resolve(new Error('should not succeed')),
      })
    })

    // Then it fails at once, never reaches the network, and tells the user
    expect(error).toBeInstanceOf(OfflineWriteError)
    expect(reachedNetwork).toBe(false)
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
  })

  it('user can still read cached data while offline', async () => {
    // Given the device is offline
    setOnLine(false)
    const link = offlineWriteLink.concat(fakeNetwork)

    // When a query runs
    await new Promise<void>((resolve) => {
      execute(link, { query: QUERY }).subscribe({ complete: resolve, error: resolve })
    })

    // Then the query is NOT blocked — only writes are
    expect(reachedNetwork).toBe(true)
  })

  it('user can save normally when online', async () => {
    // Given the device is online
    setOnLine(true)
    const link = offlineWriteLink.concat(fakeNetwork)

    // When a mutation runs
    await new Promise<void>((resolve) => {
      execute(link, { query: MUTATION }).subscribe({ complete: resolve, error: resolve })
    })

    // Then it reaches the network as usual
    expect(reachedNetwork).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
(cd apps/web && pnpm vitest run src/apollo/offlineWriteLink.test.ts)
```

Expected: FAIL — the file does not exist.

- [ ] **Step 3: Write the link**

Create `apps/web/src/apollo/offlineWriteLink.ts`:

```ts
import { ApolloLink, Observable } from '@apollo/client'
import { getMainDefinition } from '@apollo/client/utilities'
import { toast } from 'sonner'
import i18n from '@/i18n'
import { isOffline } from '@/hooks/useIsOffline'

/** Thrown when a mutation is attempted with no network connection. */
export class OfflineWriteError extends Error {
  constructor() {
    super('Offline: changes cannot be saved right now.')
    this.name = 'OfflineWriteError'
  }
}

/**
 * Fails every mutation at once while the device is offline, and tells the user
 * why.
 *
 * This is one place that covers every mutation, including ones added later.
 * Without it an offline write would hang until it timed out, or look like it
 * worked when it did not. Queries are left alone so cached reads still work.
 *
 * The message is shown here, not in each calling hook. A caller that forgets
 * to handle the error would otherwise leave the button looking broken.
 */
export const offlineWriteLink = new ApolloLink((operation, forward) => {
  const definition = getMainDefinition(operation.query)
  const isMutation =
    definition.kind === 'OperationDefinition' &&
    definition.operation === 'mutation'

  if (isMutation && isOffline()) {
    return new Observable((observer) => {
      toast.error(i18n.t('pwa.writeBlocked'))
      observer.error(new OfflineWriteError())
    })
  }

  return forward(operation)
})
```

Check how `i18n` is exported before you write the import. Run
`grep -n "export" apps/web/src/i18n/index.ts` and use the real export. If it is
a named export, use `import { i18n } from '@/i18n'` instead.

- [ ] **Step 4: Run the test and confirm it passes**

```bash
(cd apps/web && pnpm vitest run src/apollo/offlineWriteLink.test.ts)
```

Expected: PASS — all three tests.

- [ ] **Step 5: Mutation check — run both**

1. Remove `&& isOffline()` so it blocks always. The third test ("can save normally when online") must **fail**.
2. Remove `isMutation &&` so it blocks queries too. The second test ("can still read cached data") must **fail**.
3. Remove the `toast.error(...)` line. The first test must **fail**.

Restore after each. Report all three.

- [ ] **Step 6: Add it to the chain**

In `apps/web/src/apollo/client.ts`, put `offlineWriteLink` first, so it runs before the auth link:

```ts
  return new ApolloClient({
    link: offlineWriteLink.concat(splitLink),
    cache: cloudCache,
  })
```

- [ ] **Step 7: Run the suite and commit**

```bash
pnpm test
git add apps/web/src/apollo/offlineWriteLink.ts apps/web/src/apollo/offlineWriteLink.test.ts apps/web/src/apollo/client.ts apps/web/src/apollo/ApolloWrapper.tsx
git commit -m "feat(pwa): block cloud writes while offline

One ApolloLink covers every mutation, including ones added later. Without
it an offline write hangs until it times out, or looks like it worked.
Queries are left alone so cached reads still work."
```

---

## Task 11: Show the offline banner

**Files:**
- Create: `apps/web/src/components/global/OfflineBanner/OfflineBanner.tsx`
- Create: `apps/web/src/components/global/OfflineBanner/index.ts`
- Create: `apps/web/src/components/global/OfflineBanner/OfflineBanner.stories.tsx`
- Create: `apps/web/src/components/global/OfflineBanner/OfflineBanner.stories.test.tsx`
- Modify: `apps/web/src/routes/__root.tsx`

**Interfaces:**
- Consumes: `useIsOffline` (Task 6), `getLastSyncedAt` (Task 8), the `pwa.*` i18n keys (Task 5)
- Produces: `<OfflineBanner />`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/global/OfflineBanner/OfflineBanner.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLastSyncedAt } from '@/apollo/persistence'
import { useIsOffline } from '@/hooks/useIsOffline'

interface OfflineBannerProps {
  /** Overrides the stored value. Used by Storybook and tests. */
  lastSyncedAt?: Date | null
  /** Overrides the real connection state. Used by Storybook and tests. */
  forceOffline?: boolean
}

function formatRelative(date: Date, locale: string): string {
  const minutes = Math.round((date.getTime() - Date.now()) / 60000)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  return formatter.format(Math.round(hours / 24), 'day')
}

/**
 * Tells the user the app is offline and when the shown data was synced.
 *
 * The time matters. Without it, old pantry data looks current, and the user
 * cannot tell whether it is worth trusting.
 */
export function OfflineBanner({ lastSyncedAt, forceOffline }: OfflineBannerProps) {
  const { t, i18n } = useTranslation()
  const detectedOffline = useIsOffline()
  const offline = forceOffline ?? detectedOffline
  const [storedSyncedAt, setStoredSyncedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (lastSyncedAt !== undefined) return
    void getLastSyncedAt().then(setStoredSyncedAt)
  }, [lastSyncedAt])

  if (!offline) return null

  const syncedAt = lastSyncedAt ?? storedSyncedAt

  return (
    <div
      role="status"
      className="bg-muted text-muted-foreground border-border w-full border-b px-4 py-2 text-center text-sm"
    >
      <span className="font-medium">{t('pwa.offlineTitle')}</span>
      {' — '}
      {syncedAt
        ? t('pwa.offlineSyncedAt', { time: formatRelative(syncedAt, i18n.language) })
        : t('pwa.offlineNeverSynced')}
    </div>
  )
}
```

The colors use existing tokens only. Do not add `opacity-*` to the text. `UnitBadge` was deleted because `opacity-75` failed the WCAG AA contrast check.

- [ ] **Step 2: Add the barrel**

Create `apps/web/src/components/global/OfflineBanner/index.ts`:

```ts
export * from './OfflineBanner'
```

- [ ] **Step 3: Write the stories**

Create `apps/web/src/components/global/OfflineBanner/OfflineBanner.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { OfflineBanner } from './OfflineBanner'

const meta = {
  title: 'Global/OfflineBanner',
  component: OfflineBanner,
} satisfies Meta<typeof OfflineBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Online: Story = {
  args: { forceOffline: false },
}

export const OfflineRecent: Story = {
  args: { forceOffline: true, lastSyncedAt: new Date(Date.now() - 12 * 60 * 1000) },
}

export const OfflineStale: Story = {
  args: { forceOffline: true, lastSyncedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
}

export const OfflineNeverSynced: Story = {
  args: { forceOffline: true, lastSyncedAt: null },
}
```

- [ ] **Step 4: Write the smoke test**

Create `apps/web/src/components/global/OfflineBanner/OfflineBanner.stories.test.tsx`:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './OfflineBanner.stories'

const { Online, OfflineRecent, OfflineNeverSynced } = composeStories(stories)

describe('OfflineBanner stories smoke tests', () => {
  it('Online renders nothing', () => {
    const { container } = render(<Online />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('OfflineRecent shows the banner with a sync time', () => {
    render(<OfflineRecent />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(/offline/i)
    expect(banner).toHaveTextContent(/minutes ago/i)
  })

  it('OfflineNeverSynced tells the user there is no data', () => {
    render(<OfflineNeverSynced />)
    expect(screen.getByRole('status')).toHaveTextContent(/connect to load/i)
  })
})
```

- [ ] **Step 5: Run the tests**

```bash
(cd apps/web && pnpm vitest run src/components/global/OfflineBanner)
```

Expected: PASS — three tests.

- [ ] **Step 6: Mutation check**

Change `if (!offline) return null` to `if (false) return null`. The "Online renders nothing" test must **fail**. Restore and confirm green.

- [ ] **Step 7: Mount it**

In `apps/web/src/routes/__root.tsx`, inside `<Layout>`, above `<Outlet />`:

```tsx
{mode === 'cloud' && <OfflineBanner />}
```

- [ ] **Step 8: Run the suite and commit**

```bash
pnpm test
(cd apps/web && pnpm build-storybook)
git add apps/web/src/components/global/OfflineBanner apps/web/src/routes/__root.tsx
git commit -m "feat(pwa): show an offline banner with the last sync time"
```

---

## Task 12: Delete the cache on sign-out

**Files:**
- Modify: `apps/web/src/components/settings/DataModeCard/DataModeCard.tsx:122`
- Create: `apps/web/src/components/settings/DataModeCard/signOutCleanup.test.ts`

**Interfaces:**
- Consumes: `clearCache` (Task 8)
- Produces: nothing new

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/settings/DataModeCard/signOutCleanup.test.ts`:

```ts
import { InMemoryCache, gql } from '@apollo/client'
import { afterEach, describe, expect, it } from 'vitest'
import { cacheDb } from '@/apollo/cacheDb'
import { clearCache, getLastSignedInUserId, saveCache, setLastSignedInUserId } from '@/apollo/persistence'

const QUERY = gql`
  query GetItems {
    items {
      id
    }
  }
`

afterEach(async () => {
  await cacheDb.snapshots.clear()
  localStorage.clear()
})

describe('sign-out cleanup', () => {
  it('user data does not stay on the device after sign-out', async () => {
    // Given a signed-in user with a saved cache
    const cache = new InMemoryCache()
    cache.writeQuery({
      query: QUERY,
      data: { items: [{ __typename: 'Item', id: 'item-1' }] },
    })
    await saveCache(cache, 'user-a')
    setLastSignedInUserId('user-a')
    expect(await cacheDb.snapshots.count()).toBe(1)

    // When the user signs out
    await clearCache()

    // Then no cached data and no user id are left behind
    expect(await cacheDb.snapshots.count()).toBe(0)
    expect(getLastSignedInUserId()).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and confirm it passes**

```bash
(cd apps/web && pnpm vitest run src/components/settings/DataModeCard/signOutCleanup.test.ts)
```

Expected: PASS. `clearCache` already exists from Task 8. This test guards that behavior at the sign-out boundary.

- [ ] **Step 3: Call it on sign-out**

In `apps/web/src/components/settings/DataModeCard/DataModeCard.tsx`, find `await clerk.signOut()` (line 122) and add the cleanup before it:

```ts
    // Remove the cached cloud data before signing out. On a shared device the
    // next person must not be able to see this account's pantry.
    await clearCache()
    await clerk.signOut()
```

Add the import:

```ts
import { clearCache } from '@/apollo/persistence'
```

- [ ] **Step 4: Mutation check**

In `clearCache`, remove the `await cacheDb.snapshots.clear()` line. Re-run the test. It must **fail**. Restore and confirm green.

- [ ] **Step 5: Run the suite and commit**

```bash
pnpm test
git add apps/web/src/components/settings/DataModeCard
git commit -m "feat(pwa): delete cached cloud data on sign-out"
```

---

## Task 13: Offline E2E tests

**Files:**
- Modify: `e2e/constants.ts`
- Modify: `e2e/playwright.config.ts`
- Create: `e2e/tests/pwa-offline.spec.ts`
- Modify: `e2e/tests/a11y.spec.ts`

**Interfaces:**
- Consumes: everything above
- Produces: a `pwa` Playwright project

**Before you start, read `e2e/CLAUDE.md`.** Only one E2E suite can run per machine, because the ports are shared across worktrees.

- [ ] **Step 1: Add the port**

In `e2e/constants.ts`:

```ts
export const PWA_WEB_PORT = 5176
export const PWA_WEB_URL = `http://localhost:${PWA_WEB_PORT}`
```

- [ ] **Step 2: Add the project and the server**

In `e2e/playwright.config.ts`, import `PWA_WEB_PORT` and `PWA_WEB_URL`, then add to `projects`:

```ts
    {
      // The dev server has no service worker. It only exists in a real build,
      // so these tests run against the built output.
      name: 'pwa',
      use: { ...devices['Desktop Chrome'], baseURL: PWA_WEB_URL },
      testMatch: ['**/pwa-offline.spec.ts'],
    },
```

And to `webServer`:

```ts
    {
      command: `pnpm --filter web build && pnpm --filter web preview --port ${PWA_WEB_PORT} --strictPort`,
      url: PWA_WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
```

- [ ] **Step 3: Write the tests**

Create `e2e/tests/pwa-offline.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.describe('PWA offline', () => {
  test('user can install the app', async ({ page }) => {
    // Given the built app
    await page.goto('/')

    // When the manifest is requested
    const response = await page.request.get('/manifest.webmanifest')

    // Then it describes an installable app
    expect(response.ok()).toBe(true)
    const manifest = await response.json()
    expect(manifest.display).toBe('standalone')
    expect(manifest.name).toBe('Player 1 Inventory')
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3)
  })

  test('user can open the app with no network in local mode', async ({ page, context }) => {
    // Given the user visited once while online, so the app files are cached
    await page.goto('/')
    // Return a plain value. A ServiceWorkerRegistration cannot be sent back
    // to the test process, so returning it directly throws.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))

    // When the network goes away and the app is opened again
    await context.setOffline(true)
    await page.reload()

    // Then the app still renders instead of a browser error page
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('the font is served by us, not by Google', async ({ page }) => {
    // Given a list of every request the page makes
    const externalFontRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('fonts.googleapis.com') || request.url().includes('fonts.gstatic.com')) {
        externalFontRequests.push(request.url())
      }
    })

    // When the app loads
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Then nothing was requested from Google Fonts
    expect(externalFontRequests).toEqual([])
  })
})
```

- [ ] **Step 4: Run them**

```bash
pnpm test:e2e --project=pwa
```

Expected: three tests pass. The first run is slow because it builds the app.

- [ ] **Step 5: Add the banner to the accessibility scan**

First read `e2e/tests/a11y.spec.ts` and copy the shape of the existing
`test.describe('dark mode a11y')` block, including how it calls `injectAxe`,
`checkA11y`, and `AXE_OPTIONS`. Then add this block, filling in the same calls
that file already uses:

```ts
test.describe('offline banner a11y', () => {
  test.use({ baseURL: PWA_WEB_URL })

  for (const theme of ['light', 'dark'] as const) {
    test(`offline banner passes axe in ${theme} mode`, async ({ page, context }) => {
      // Given the app is in cloud mode with the chosen theme
      await page.addInitScript((value) => {
        localStorage.setItem('theme-preference', value)
        localStorage.setItem('data-mode', 'cloud')
      }, theme)
      await page.goto('/')

      // When the network goes away and the banner appears
      await context.setOffline(true)
      await page.reload()
      await expect(page.getByRole('status')).toBeVisible()

      // Then the banner has no accessibility violations
      // (use the same injectAxe / checkA11y / AXE_OPTIONS calls as the
      //  existing blocks in this file)
    })
  }
})
```

This block needs `PWA_WEB_URL` imported from `../constants`, and it only runs
in the `pwa` Playwright project, because the dev server has no service worker.
Add `'**/a11y.spec.ts'` to the `pwa` project's `testMatch` array so it runs.

- [ ] **Step 6: Run the full E2E gate**

```bash
pnpm test:e2e --grep "pwa|a11y"
```

Expected: all pass. A failure here is a hard stop. Do not finish the branch until it passes.

- [ ] **Step 7: Commit**

```bash
git add e2e/constants.ts e2e/playwright.config.ts e2e/tests/pwa-offline.spec.ts e2e/tests/a11y.spec.ts
git commit -m "test(pwa): add offline E2E tests against the built app

The dev server has no service worker, so these tests need a third
Playwright project that serves the preview build."
```

---

## Task 14: Update the documentation

**Files:**
- Modify: `docs/INDEX.md`
- Modify: `docs/global/pwa/2026-08-31-pwa-offline-design.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the status**

In `docs/INDEX.md`, change the `pwa` row status from 🔲 Pending to ✅ Implemented. Add a link to this plan.

- [ ] **Step 2: Record anything that changed**

If the build differs from the design, add a short section at the end of the design doc titled "Changes made during implementation". Say what changed and why. Do not silently leave the design wrong.

- [ ] **Step 3: Add a note to CLAUDE.md**

Add a short section under "Tech Stack" for `apps/web`:

```markdown
### Service worker and offline

The app is a PWA. `vite-plugin-pwa` builds the service worker in `generateSW`
mode. A service worker only exists in a real build, never on the dev server.

- To test offline behavior, run `pnpm --filter web build && pnpm --filter web preview`.
- If a bad service worker is stuck in a browser, open the DevTools console and
  run `window.__unregisterServiceWorkers()`.
- The cloud Apollo cache is saved in a separate Dexie database named
  `Player1InventoryCloudCache`. It is not part of the app database.
```

- [ ] **Step 4: Commit**

```bash
git add docs/INDEX.md docs/global/pwa CLAUDE.md
git commit -m "docs(pwa): mark the PWA work as implemented"
```

---

## Self-review notes

**Spec coverage.** Every section of the design maps to a task:

| Spec section | Task |
|---|---|
| 1. Build, manifest | 4 |
| 1. Icons | 2 |
| 1. iOS tags | 4 |
| 1. Fonts | 3 |
| 1. Updates | 5 |
| 2.1 Clerk experiment | 1, and 7b if needed |
| 2.2 Two redirects | 7 |
| 2.3 Save and restore | 8, 9 |
| 2.4 Blocking writes | 10 |
| 2.5 Offline banner | 11 |
| 2.6 Sign-out cleanup | 12 |
| 3. Testing | every task, plus 13 |
| 4. Risk 1 (stuck worker) | 4, step 4 |
| 4. Risk 2 (`_redirects`) | 4, step 2 |
| 4. Risk 3 (Clerk) | 1, 7b |
| 4. Risk 4 (iOS eviction) | see open question below |
| 5. Rollout | 4 |

**One open item the executor must not skip.** Spec risk 4 says to check whether iOS deletes stored data for installed web apps. There is no task for it, because it cannot be checked from this repo — it needs a real iOS device and several days of waiting. **Do this before the PR is merged:** install the app on an iPhone, use it once, leave it for more than seven days, then open it again offline and see whether the cached data is still there. Write the result into the design doc. If the data is gone, cloud offline reads cannot be relied on for iOS, and the banner text needs to say so.
