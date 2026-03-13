# Dual-Mode Architecture Design

**Date:** 2026-03-12

## Goal

Users can choose between **login-free mode** (local IndexedDB, no auth required) and **sharing-enabled mode** (login required, data from GraphQL backend). App starts in login-free mode by default. Users can switch modes in Settings anytime.

## Mode Storage

- `localStorage` key: `'data-mode'`
- Values: `'local' | 'cloud'`
- Default: `'local'`
- Type and constant in `src/lib/dataMode.ts`

## Provider Tree (`main.tsx`)

Mode is read from `localStorage` **before React mounts**. The provider tree is fixed for the lifetime of the page. Switching modes always triggers a full page reload.

```typescript
const mode = (localStorage.getItem('data-mode') ?? 'local') as DataMode

// Cloud mode: Clerk + Apollo wrap everything
// Local mode: only TanStack Query — no Clerk, no Apollo, no external network calls
```

**Local mode tree:**
```
StrictMode
  QueryClientProvider
    RouterProvider
```

**Cloud mode tree:**
```
StrictMode
  ClerkProvider
    ApolloWrapper
      QueryClientProvider
        RouterProvider
```

## `useDataMode()` Hook

Mirrors the existing `useTheme()` / `useLanguage()` pattern:

```typescript
// src/hooks/useDataMode.ts
export function useDataMode() {
  const [mode, setModeState] = useState<DataMode>(
    () => (localStorage.getItem(DATA_MODE_STORAGE_KEY) as DataMode) ?? 'local'
  )

  const setMode = (next: DataMode) => {
    localStorage.setItem(DATA_MODE_STORAGE_KEY, next)
    setModeState(next)
  }

  return { mode, setMode }
}
```

## Entity Hooks

Each entity hook calls both data sources but disables the inactive one. Components never change — the hook is the seam.

```typescript
// useItems.ts
export function useItems() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['items'],
    queryFn: getAllItems,
    enabled: !isCloud,
  })

  const cloud = useGetItemsQuery({ skip: !isCloud })

  return isCloud ? cloud : local
}
```

This pattern applies to every entity hook incrementally: `useItems`, `useTags`, `useVendors`, `useRecipes`, `useShoppingCart`, `useInventoryLogs`.

## Mode Switching Flows

### Local → Cloud

1. User taps "Enable sharing" in Settings
2. **Confirm dialog**: *"Sharing requires signing in. Once enabled, your data will be stored in the cloud and a login will be required each session."* **[Enable] [Cancel]**
3. `localStorage.setItem('data-mode', 'cloud')` + full page reload
4. App reloads with Clerk + Apollo; root route guard redirects unauthenticated users to `/sign-in`
5. After sign-in: `usePostLoginMigration()` hook checks if IndexedDB has local data
6. If local data exists → *"Import your local data to the cloud?"* **[Import] [Skip]**
7. If [Import] AND cloud already has data → *"Cloud already has items. How should we handle this?"* **[Append — keep both, duplicates may appear] [Replace — overwrite cloud data]**
8. Perform import; app fully in cloud mode

### Cloud → Local

1. User taps "Disable sharing" in Settings
2. If user is in a family group → **Confirm dialog**: *"Other family members may lose access to shared items or see outdated versions in the future. Do you want to continue?"* **[Continue] [Cancel]** — cancelling aborts the entire flow
3. *"Copy your cloud data to local storage?"* **[Copy] [Start Fresh]**
4. If [Copy] AND local already has data → *"Local storage already has items. How should we handle this?"* **[Append — keep both, duplicates may appear] [Replace — overwrite local data]**
5. Perform copy accordingly
6. `signOut()` → `localStorage.setItem('data-mode', 'local')` → full page reload

### Conflict Resolution Strategy

Both directions use an **append or replace** choice:
- **Append**: all items from the source are added as new items to the destination. Existing destination data is kept. Duplicates may appear — user cleans up manually.
- **Replace**: destination data is wiped, then source data is written. No duplicates.

Full merge/dedup is deferred (YAGNI). IDs from Dexie (UUIDs) and MongoDB (ObjectIds) are incompatible systems — matching by ID is not possible.

## Settings UI

### Data Mode Card (always visible in Settings)

**Local mode:**
```
[Database icon] Login-free mode
                Data stored on this device only
                                    [Enable sharing →]
```

**Cloud mode:**
```
[Cloud icon] Sharing enabled
             Signed in as user@example.com
                                    [Disable sharing]
```

### Family Group Card (cloud mode only)

**Not in a group:**
```
[Users icon] Family group
             Share your pantry with family members
                              [Create group]  [Join with code]
```

**In a group (member):**
```
[Users icon] Family group · The Smiths
             Group code: PX7K2M  [Copy]
             Alice (owner) · Bob · You
                                        [Leave group]
```

**In a group (owner):**
```
[Users icon] Family group · The Smiths
             Group code: PX7K2M  [Copy]
             You (owner) · Alice · Bob
                                      [Disband group]
```

- [Create group] prompts for a group name, generates a 6-character alphanumeric code
- [Join with code] shows a text input
- [Leave] and [Disband] both show a confirmation dialog
- No email invites, no member removal — members join via code shared manually (e.g. WhatsApp)

## Backend: Family Group

### Model (`apps/server/src/models/FamilyGroup.model.ts`)

```typescript
class FamilyGroupClass {
  name!: string
  code!: string        // 6-char alphanumeric, unique index
  ownerUserId!: string
  memberUserIds!: string[]
  createdAt!: Date
  updatedAt!: Date
}
```

### GraphQL Schema

```graphql
type FamilyGroup {
  id: ID!
  name: String!
  code: String!
  ownerUserId: String!
  memberUserIds: [String!]!
  createdAt: String!
  updatedAt: String!
}

extend type Query {
  myFamilyGroup: FamilyGroup
}

extend type Mutation {
  createFamilyGroup(name: String!): FamilyGroup!
  joinFamilyGroup(code: String!): FamilyGroup!
  leaveFamilyGroup: Boolean!
  disbandFamilyGroup: Boolean!
}
```

## Route Guard

In cloud mode, unauthenticated users are redirected to `/sign-in`. This guard lives in the root route or a layout route, checking `useAuth()` from Clerk only when mode is `'cloud'`.

## `usePostLoginMigration()` Hook

Runs once after sign-in in cloud mode. Checks if IndexedDB has data and triggers the import dialog flow. Stores a `'migration-prompted'` flag in `localStorage` so the prompt only shows once per login.
