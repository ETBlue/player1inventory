# Plan: Missing Component Stories + Smoke Tests

## Goal

Add Storybook stories and matching smoke tests for the 5 `src/components/` entries
that had no coverage. Every other component already has both.

## Context

**Pattern (universal across this codebase):**
- Each `*.stories.tsx` has a matching `*.stories.test.tsx` smoke test
- Smoke tests use `composeStories` + React Testing Library
- Assertion: a key UI element (role, text, heading) — never `container.firstChild` or `'Loading...'`
- Route stories with db-init wrappers: use `findBy*` (async) to wait for actual page content

**Components already covered:** 38 / 43 components had stories + smoke tests.

**Gap identified:**
| Component | Stories | Smoke Test |
|-----------|---------|------------|
| `ui/checkbox` | ❌ | ❌ |
| `ui/switch` | ❌ | ❌ |
| `Navigation` | ❌ | ❌ |
| `Layout` | ❌ | ❌ |
| `PostLoginMigrationDialog` | ❌ | ❌ |
| `ui/sonner` | skipped (infrastructure wrapper, nothing visible) | skipped |

## Steps

### Step 1 — `ui/checkbox` stories + smoke test ✅ DONE

**File:** `src/components/ui/checkbox.stories.tsx`
**Stories:** Unchecked, Checked, Indeterminate, Disabled, DisabledChecked
**Smoke test:** `getByRole('checkbox')` on each story

### Step 2 — `ui/switch` stories + smoke test ✅ DONE

**File:** `src/components/ui/switch.stories.tsx`
**Stories:** Off, On, Disabled, DisabledOn
**Smoke test:** `getByRole('switch')` on each story

### Step 3 — `Navigation` stories + smoke test ✅ DONE

**File:** `src/components/Navigation/Navigation.stories.tsx`
**Stories:** PantryActive, CartActive, CookingActive, SettingsActive, HiddenOnFullscreen
**Pattern:** RouterProvider + routeTree + db init wrapper (same as route stories)
**Smoke test:** `findByRole('navigation')` (async, waits for router to mount)
**Apollo fix:** wrapped RouterProvider in `<ApolloProvider client={noopApolloClient}>` —
  routes at `/` call Apollo hooks with `skip:true` which still need context in Storybook

### Step 4 — `Layout` stories + smoke test ✅ DONE

**File:** `src/components/Layout/Layout.stories.tsx`
**Stories:** Default (path `/`), FullscreenPage (path `/settings/vendors`)
**Pattern:** RouterProvider + routeTree + db init wrapper
**Smoke test:** `findByRole('main')` (async)
**Apollo fix:** same as Navigation — `noopApolloClient` + `ApolloProvider` wrapper

### Step 5 — `PostLoginMigrationDialog` stories + smoke test ✅ DONE

**File:** `src/components/PostLoginMigrationDialog/index.stories.tsx`
**Stories:**
- `Idle` — `migration-prompted` set in localStorage; dialog stays closed
- `Prompting` — db seeded with 1 item; dialog opens after async hook resolves
**Smoke test:**
- `Prompting`: `findByText('Import your local data to the cloud?')` (async, waits for dialog)

## Verification

```bash
(cd apps/web && pnpm test)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
(cd apps/web && pnpm build-storybook)
```

All must pass before committing.
