# Design: Sign Out Button, Switch Symmetry & Migration Wiring

**Date:** 2026-04-13  
**Branch:** `feature/sign-out-and-migration`  
**Brainstorming log:** `2026-04-13-brainstorming-sign-out-migration.md`

---

## Overview

Three interconnected improvements to `DataModeCard` in Settings:

1. **Sign Out button** — cloud mode only, inline with email; multi-step dialog to optionally switch offline and/or migrate data
2. **Switch button symmetry** — offline → cloud mirrors cloud → offline; post-login migration via `PostLoginMigrationDialog`
3. **Migration wiring** — fill TODO stubs in `doDisable()` (cloud → local) and `usePostLoginMigration.importData()` (local → cloud)

Also: **DataModeCard refactor** (flatten thin layers) + **i18n key rename** (`disableButton` → `switchButton`).

---

## 1. Sign Out Button

### Placement

Inline with the signed-in email line, inside the `flex-1` content area. `Switch...` button remains at the far right.

```
[Cloud icon]  [Cloud Mode title                          ]  [Switch...]
              [Signed in as user@example.com  [Sign Out] ]
```

### Dialog Flow

```
Click "Sign Out"
  └─ Dialog 1 — "Switch to offline mode before signing out?"
       ├─ Cancel → close dialog, do nothing
       ├─ [Just sign out] → clerk.signOut() → auth guard redirects to /sign-in
       └─ [Switch to offline] → Dialog 2
            └─ "Copy cloud data to this device?"
                 ├─ [Skip] → clerk.signOut() + switch to local + reload
                 └─ [Copy data] → fetchCloudPayload() → importLocalData(payload, 'skip')
                                  → clerk.signOut() + switch to local + reload
```

### State Machine (inside CloudModeSection)

```ts
type SignOutFlow = 'idle' | 'askOffline' | 'askMigrate' | 'migrating'
```

### Implementation Notes

- `clerk.signOut()` from `useClerk()` — already mocked in `src/test/setup.ts`
- Switch to local: `localStorage.setItem('data-mode', 'local')` + `window.location.reload()`
- Just sign out (no mode change): auth guard in `__root.tsx` detects `!isSignedIn` in cloud mode → redirects to `/sign-in`
- Data copy uses `fetchCloudPayload(apolloClient)` (new helper, see §4) + `importLocalData(payload, 'skip')`
- Migration uses `'skip'` strategy (append — don't overwrite existing local data)
- No conflict resolution dialog in sign-out flow (keep it simple)
- During migration (`'migrating'` state): show loading state, disable buttons

---

## 2. Switch Button Symmetry

### Cloud → Offline (existing, wire TODO)

The `Switch...` button in cloud mode keeps Clerk session alive and optionally copies data to IndexedDB. The `copyDialog` and `conflictDialog` flows already exist; `doDisable()` has a TODO stub.

**What changes:** wire the copy step in `doDisable()` (see §4).

### Offline → Cloud (new via PostLoginMigrationDialog)

The `Switch...` button in offline mode currently shows a confirm dialog and reloads into cloud mode. Migration can't happen at this point because auth hasn't occurred yet.

**Solution:** `PostLoginMigrationDialog` already fires automatically after first sign-in when local data exists. Wire its `importData()` TODO (see §4). The enable dialog description is updated to mention this.

**Enable dialog description change:**
> "Once switched, your data will be stored in the cloud. You will be able to collaborate with family members, but signing in will be required. After signing in, you'll be offered to import any local data you have."

No new dialogs needed for the offline → cloud path.

---

## 3. DataModeCard Refactor

### File Structure

**Before:** single `index.tsx` file with everything.  
**After:** follows the component file naming convention:

```
DataModeCard/
  DataModeCard.tsx    ← implementation
  index.ts            ← barrel: export * from './DataModeCard'
```

### Component Layers

**Before (confusing thin layers):**
```
CloudModeCardContent   ← pure UI render
CloudModeCardWithUser  ← adds useUser()
CloudModeCard          ← E2E test shim
CloudDisableFlow       ← switch state + dialog logic
DataModeCard           ← top-level, mode conditional
```

**After (flat):**
```
CloudModeSection       ← all cloud mode UI + state + dialogs (switch + sign-out)
DataModeCard           ← top-level, mode conditional (exported)
```

`CloudModeSection`:
- Calls `useUser()` directly (E2E guard with early return for `VITE_E2E_TEST_USER_ID`)
- Owns both `switchFlow` state (`'idle' | 'familyWarn' | 'copy' | 'conflict'`) and `signOutFlow` state
- Renders: cloud icon, title, email line + Sign Out button, Switch button
- All dialogs for both flows live here

The offline mode content (local icon + title + description + Switch button + enable dialog) stays inline in `DataModeCard` — it's simple enough not to need extraction.

---

## 4. Migration Wiring

### New helper: `fetchCloudPayload(apolloClient)`

Add to `src/lib/exportData.ts`. Same logic as `exportCloudData()` but returns `ExportPayload` instead of triggering a download. `exportCloudData()` is refactored to call this internally.

```ts
export async function fetchCloudPayload(client: ApolloClient<object>): Promise<ExportPayload>
export async function exportCloudData(client: ApolloClient<object>): Promise<void>  // calls fetchCloudPayload + triggerDownload
```

### Cloud → Local (in `doDisable()`)

```ts
async function doDisable(copyChoice: 'copy' | 'skip', conflictRes?: 'append' | 'replace') {
  if (copyChoice === 'copy') {
    const payload = await fetchCloudPayload(apolloClient)
    await importLocalData(payload, conflictRes === 'replace' ? 'replace' : 'skip')
  }
  // Clerk session stays alive — seamless re-enable
  localStorage.setItem('data-mode', 'local')
  window.location.reload()
}
```

Requires `useApolloClient()` inside `CloudModeSection`.

### Local → Cloud (in `usePostLoginMigration`)

```ts
async function importData(conflictResolution: 'append' | 'replace') {
  setState('importing')
  const payload = await fetchLocalPayload()       // reads all 8 IndexedDB tables
  const strategy = conflictResolution === 'replace' ? 'replace' : 'skip'
  await importCloudData(payload, strategy, apolloClient)
  localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
  setState('done')
}
```

New helper `fetchLocalPayload()` in `src/lib/exportData.ts` — reads all 8 Dexie tables and returns `ExportPayload` (same as `exportAllData()` but without triggering download).

Hook gains `useApolloClient()`.

`PostLoginMigrationDialog` is converted from hardcoded English to i18n keys.

---

## 5. i18n Changes

### Key renames (value unchanged)

| Old key | New key |
|---------|---------|
| `settings.dataMode.cloud.disableButton` | `settings.dataMode.cloud.switchButton` |

### New keys

```jsonc
{
  "settings": {
    "dataMode": {
      "cloud": {
        "signOutButton": "Sign Out"
      },
      "enableDialog": {
        "description": "Once switched, your data will be stored in the cloud. You will be able to collaborate with family members, but signing in will be required. After signing in, you'll be offered to import any local data you have."
      },
      "signOutOfflineDialog": {
        "title": "Switch to offline mode?",
        "description": "You can sign back in any time to re-enable cloud sync.",
        "switchToOffline": "Switch to offline",
        "justSignOut": "Just sign out"
      },
      "signOutMigrateDialog": {
        "title": "Copy cloud data to this device?",
        "description": "A copy of your cloud data will be saved on this device for offline use.",
        "copy": "Copy data",
        "skip": "Skip"
      }
    },
    "postLoginMigration": {
      "title": "Import local data to cloud?",
      "description": "You have local data on this device. Would you like to import it to your cloud account?",
      "import": "Import",
      "skip": "Skip"
    }
  }
}
```

Same keys in `tw.json` with Traditional Chinese values.

---

## 6. Files Affected

| File | Change |
|------|--------|
| `apps/web/src/components/settings/DataModeCard/index.tsx` | Split → `DataModeCard.tsx` + `index.ts` |
| `apps/web/src/components/settings/DataModeCard/DataModeCard.tsx` | New — refactored implementation |
| `apps/web/src/components/settings/DataModeCard/index.ts` | New — barrel export |
| `apps/web/src/components/settings/DataModeCard/DataModeCard.stories.tsx` | New — Storybook stories |
| `apps/web/src/components/settings/DataModeCard/DataModeCard.stories.test.tsx` | New — smoke tests |
| `apps/web/src/components/global/PostLoginMigrationDialog/PostLoginMigrationDialog.tsx` | Convert hardcoded text to i18n |
| `apps/web/src/hooks/usePostLoginMigration.ts` | Wire `importCloudData()` into `importData()` |
| `apps/web/src/lib/exportData.ts` | Add `fetchCloudPayload()` + `fetchLocalPayload()` helpers |
| `apps/web/src/i18n/locales/en.json` | Rename `disableButton`, add new keys |
| `apps/web/src/i18n/locales/tw.json` | Same, Traditional Chinese values |
| `apps/web/src/components/CLAUDE.md` | Update DataModeCard description |
| `apps/web/src/hooks/CLAUDE.md` | Update `usePostLoginMigration` description |
| `docs/INDEX.md` | Add entry |

---

## 7. Implementation Plan

**Step 1 — i18n changes**
- Rename `disableButton` → `switchButton` in both locale files
- Add all new keys (sign-out dialogs, postLoginMigration) to both locales
- Update `enableDialog.description` in both locales

**Step 2 — Export helpers**
- Add `fetchCloudPayload()` and `fetchLocalPayload()` to `src/lib/exportData.ts`
- Refactor `exportCloudData()` to call `fetchCloudPayload()` internally
- Refactor `exportAllData()` similarly (calls `fetchLocalPayload()` + `triggerDownload()`)

**Step 3 — DataModeCard refactor + Sign Out button**
- Flatten layers into `CloudModeSection`
- Add Sign Out button inline with email
- Add sign-out dialog state machine + two dialogs
- Rename `disableButton` i18n reference → `switchButton`
- Wire `fetchCloudPayload()` into `doDisable()` copy path
- Adopt `DataModeCard.tsx` + `index.ts` file naming

**Step 4 — Migration wiring + PostLoginMigrationDialog i18n**
- Wire `usePostLoginMigration.importData()` to call `importCloudData()`
- Convert `PostLoginMigrationDialog` hardcoded text to i18n keys

**Step 5 — Storybook + tests**
- `DataModeCard.stories.tsx` — LocalMode, CloudMode, CloudModeLoading, E2EMode stories
- `DataModeCard.stories.test.tsx` — smoke tests
- Update `PostLoginMigrationDialog` stories if needed

**Step 6 — CLAUDE.md + docs/INDEX.md updates**
