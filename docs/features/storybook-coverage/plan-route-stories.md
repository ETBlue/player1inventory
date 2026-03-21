# Plan: Missing Route-Level Stories + Smoke Tests

## Goal

Add Storybook stories and smoke tests for every route page that renders visible UI
and currently lacks coverage. Layout wrappers that render only `<Outlet />` are excluded.

## Context

**Already covered (4 routes):**
| Route | Stories | Smoke Test |
|-------|---------|------------|
| `/cooking` | ✅ | ✅ |
| `/settings` | ✅ | ✅ |
| `/settings/tags` | ✅ (fixed: added ApolloProvider) | ✅ |
| `/settings/tags/$id` (Info tab) | ✅ (fixed: added ApolloProvider) | ✅ |

**Pure Outlet wrappers — skip:**
- `settings/tags.tsx`, `settings/vendors.tsx`, `settings/recipes.tsx` (each renders only `<Outlet />`)

**Pattern for all route stories:**

`ApolloProvider` is required for every route story. Dual-mode hooks (e.g. `useTags`, `useVendors`, `useRecipes`, `useItems`) call Apollo hooks unconditionally with `skip: !isCloud` — React's rules of hooks forbid conditional hook calls, so the provider must always be present even in local mode. Tests pass without it because `setup.ts` stubs all Apollo hooks via `vi.mock`.

```tsx
import { ApolloProvider } from '@apollo/client/react'
import { noopApolloClient } from '@/test/apolloStub'

function PageStory({ setup }: { setup?: () => void | Promise<void> }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await db.delete()
      await db.open()
      await setup?.()
      setReady(true)
    }
    init()
  }, [setup])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/the-route'] }),
    context: { queryClient },
  })

  return (
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>
  )
}
```

**Smoke test pattern:**
```ts
// Use findBy* (async) to wait for a key element once the router has mounted.
// Choose an element specific to the page — a heading, button label, or landmark.
it('Default renders without error', async () => {
  render(<Default />)
  expect(await screen.findByRole('heading', { name: /pantry/i })).toBeInTheDocument()
})
```

**Storybook title convention:**
- Main pages: `Routes/PageName` (e.g. `Routes/Pantry`, `Routes/Shopping`)
- Settings pages: `Routes/Settings/PageName`
- Item pages: `Routes/Items/PageName`
- Tab pages: `Routes/Settings/VendorDetail/InfoTab`

## Steps

### Step 1 — `index.tsx` (Pantry / Home page)

**File:** `src/routes/index.stories.tsx`
**Path:** `/`
**Stories:**
- `Default` — empty pantry (no items)
- `WithItems` — seed 2–3 items with different stock states

**Smoke test:** `getByText('Loading...')`

---

### Step 2 — `shopping.tsx` (Shopping / Cart page)

**File:** `src/routes/shopping.stories.tsx`
**Path:** `/shopping`
**Stories:**
- `Default` — empty cart, no items in pantry
- `WithCartItems` — seed items + active cart with some checked items
- `WithPinnedItem` — cart item with quantity = 0 (pinned)

**Smoke test:** `getByText('Loading...')`

---

### Step 3 — `sign-in.tsx` (Sign-in page)

**File:** `src/routes/sign-in.stories.tsx`
**Path:** `/sign-in`
**Stories:**
- `Default` — the sign-in page (renders Clerk's `<SignIn />` stub in Storybook)

**Note:** Clerk `<SignIn>` is mocked in `.storybook/mocks/clerk.tsx` as a stub div.
**Smoke test:** `getByText('Loading...')`

---

### Step 4 — `items/new.tsx` (New Item form)

**File:** `src/routes/items/new.stories.tsx`
**Path:** `/items/new`
**Stories:**
- `Default` — blank new item form
- `WithTags` — seed some tags so tag picker has options

**Smoke test:** `getByText('Loading...')`

---

### Step 5 — `items/$id` group (Item detail — layout + all tabs)

Item detail is a tab layout (`$id.tsx`) with four tabs, each a separate route.
Cover the layout + all tabs in one story file each, grouped by concern:

**Step 5a — Item detail layout + Info tab**
**File:** `src/routes/items/$id/index.stories.tsx`
**Path:** `/items/<id>` (redirects to `/items/<id>/` — the index tab)
**Stories:**
- `Default` — single item, no tags/vendors/recipes
- `WithTagsAndVendors` — item with tags + vendors assigned

**Step 5b — Item Tags tab**
**File:** `src/routes/items/$id/tags.stories.tsx`
**Path:** `/items/<id>/tags`
**Stories:**
- `Default` — item with no tags, some tags available to assign
- `WithAssignedTags` — item already has tags assigned

**Step 5c — Item Vendors tab**
**File:** `src/routes/items/$id/vendors.stories.tsx`
**Path:** `/items/<id>/vendors`
**Stories:**
- `Default` — item with no vendors
- `WithAssignedVendors` — item with vendors assigned

**Step 5d — Item Recipes tab**
**File:** `src/routes/items/$id/recipes.stories.tsx`
**Path:** `/items/<id>/recipes`
**Stories:**
- `Default` — item not in any recipe
- `WithRecipes` — item assigned to a recipe

**Smoke test for all:** `getByText('Loading...')`

---

### Step 6 — `items/$id.log.tsx` (Item Activity Log)

**File:** `src/routes/items/$id.log.stories.tsx`
**Path:** `/items/<id>/log`
**Stories:**
- `Default` — item with no log entries
- `WithLogEntries` — item with 3–5 log entries

**Smoke test:** `getByText('Loading...')`

---

### Step 7 — `settings/tags/$id/items.tsx` (Tag Items tab)

**File:** `src/routes/settings/tags/$id/items.stories.tsx`
**Path:** `/settings/tags/<id>/items`
**Stories:**
- `Default` — tag with no items assigned
- `WithItems` — tag with items assigned

**Smoke test:** `getByText('Loading...')`

---

### Step 8 — Vendor routes (list + detail + new)

**Step 8a — Vendors list**
**File:** `src/routes/settings/vendors/index.stories.tsx`
**Path:** `/settings/vendors`
**Stories:**
- `Default` — no vendors
- `WithVendors` — 2–3 vendors

**Step 8b — New vendor**
**File:** `src/routes/settings/vendors/new.stories.tsx`
**Path:** `/settings/vendors/new`
**Stories:**
- `Default` — blank new vendor form

**Step 8c — Vendor Info tab**
**File:** `src/routes/settings/vendors/$id/index.stories.tsx`
**Path:** `/settings/vendors/<id>`
**Stories:**
- `Default` — vendor with no items

**Step 8d — Vendor Items tab**
**File:** `src/routes/settings/vendors/$id/items.stories.tsx`
**Path:** `/settings/vendors/<id>/items`
**Stories:**
- `Default` — vendor with no items
- `WithItems` — vendor with items assigned

**Smoke test for all:** `getByText('Loading...')`

---

### Step 9 — Recipe routes (list + detail + new)

**Step 9a — Recipes list**
**File:** `src/routes/settings/recipes/index.stories.tsx`
**Path:** `/settings/recipes`
**Stories:**
- `Default` — no recipes
- `WithRecipes` — 2–3 recipes

**Step 9b — New recipe**
**File:** `src/routes/settings/recipes/new.stories.tsx`
**Path:** `/settings/recipes/new`
**Stories:**
- `Default` — blank new recipe form

**Step 9c — Recipe Info tab**
**File:** `src/routes/settings/recipes/$id/index.stories.tsx`
**Path:** `/settings/recipes/<id>`
**Stories:**
- `Default` — recipe with no items

**Step 9d — Recipe Items tab**
**File:** `src/routes/settings/recipes/$id/items.stories.tsx`
**Path:** `/settings/recipes/<id>/items`
**Stories:**
- `Default` — recipe with no items
- `WithItems` — recipe with items

**Smoke test for all:** `getByText('Loading...')`

---

## Verification (after each step)

```bash
(cd apps/web && pnpm test)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
(cd apps/web && pnpm build-storybook)
```

## Commit strategy

Group by feature area — one commit per step:
- `chore(storybook): add pantry page stories + smoke tests`
- `chore(storybook): add shopping page stories + smoke tests`
- etc.
