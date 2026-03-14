# Backend Migration Design

**Date:** 2026-03-11

## Goals

1. Share data across desktop and mobile devices
2. Share data across family members' accounts
3. Enable real-time collaboration with family members
4. Practice backend development
5. Support data backup and restore

## Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + TanStack Router |
| Frontend data layer | Apollo Client (replaces TanStack Query) |
| Auth | Clerk |
| Backend server | Node.js + TypeScript + Express + Apollo Server 4 |
| Schema layer | Typegoose (TypeScript-first Mongoose schema definition) |
| Database ORM | Mongoose |
| Database | MongoDB Atlas (Singapore region, M0 free tier) |
| Real-time | GraphQL subscriptions via `graphql-ws` + in-memory PubSub |
| Frontend hosting | Cloudflare Pages (Taiwan PoP) |
| Backend hosting | Railway (Singapore region) |

## Monorepo Structure

pnpm workspaces — no new monorepo tooling required (pnpm already in use).

```
player1inventory/
  apps/
    web/          # existing frontend (src/ moves here)
    server/       # new Node.js + Apollo Server backend
  packages/
    types/        # shared TypeScript interfaces (Item, Tag, Recipe, etc.)
  package.json    # pnpm workspace root
  pnpm-workspace.yaml
```

**`packages/types`** — plain TypeScript interfaces, no dependencies. Single source of truth shared by both `apps/web` and `apps/server`. No backend dependencies leak into the frontend.

## Backend Architecture

```
apps/server/
  src/
    index.ts          # Express app entry point
    schema/           # GraphQL type definitions (SDL)
      item.graphql
      tag.graphql
      recipe.graphql
      ...
    resolvers/        # GraphQL resolvers
      item.resolver.ts
      tag.resolver.ts
      recipe.resolver.ts
      ...
    models/           # Typegoose model classes
      Item.model.ts
      Tag.model.ts
      Recipe.model.ts
      ...
    middleware/
      auth.ts         # Clerk JWT verification
    context.ts        # GraphQL context (userId, db)
```

**Request flow:**
```
Client → Express → Clerk middleware (verify JWT) → Apollo Server → Resolvers → Typegoose/Mongoose → MongoDB Atlas
```

**Schema-first GraphQL** — write `.graphql` SDL files, then implement resolvers. Easier to read and review than code-first for a beginner.

**Context** carries the authenticated `userId` from Clerk into every resolver — no resolver extracts auth itself.

**Typegoose** classes live in `apps/server` (they depend on Mongoose). They implement the shared interfaces from `packages/types`. One source of truth for shape, no backend dependencies in the frontend.

## Frontend Changes

### Auth (Clerk)

- Wrap app in `<ClerkProvider>` in `main.tsx`
- Add sign-in page — Clerk provides pre-built `<SignIn />` component
- TanStack Router `beforeLoad` auth guard on protected routes
- Apollo Client attaches Clerk JWT to every request via an auth link

### Apollo Client

```
apps/web/src/
  apollo/
    client.ts       # Apollo Client setup (auth link + WebSocket link for subscriptions)
    queries/        # gql query documents
      items.gql.ts
      tags.gql.ts
      ...
```

Apollo Client replaces TanStack Query. The normalized cache (`InMemoryCache`) automatically updates all queries that include a modified entity — no manual `invalidateQueries` needed.

### Incremental Migration Strategy

The hooks layer (`src/hooks/`) is the migration seam. Components never change — only hook internals swap from Dexie calls to Apollo calls, one entity at a time.

```
Phase 0 (now):   hooks → Dexie → IndexedDB          (100% local)
Phase 1 (Items): hooks → Apollo Client → GraphQL API  (Items migrated)
                 hooks → Dexie → IndexedDB            (everything else still local)
Phase N (done):  hooks → Apollo Client → GraphQL API  (100% remote)
```

IndexedDB data for un-migrated entities continues working throughout.

## Data Model

### New entities

```
User      id, clerkId, email, familyId?
Family    id, name, memberIds[]
```

### Existing entities — additions only

Every existing document gets `userId` (owner) and optional `familyId` (shared scope):

```
Item, Tag, TagType, Vendor, Recipe, ShoppingCart, CartItem, InventoryLog
  + userId
  + familyId?
```

**Sharing model:**
- Queries filter by `familyId` when present, `userId` otherwise
- Family members share one inventory — one pantry per family
- Family invite: owner creates a `Family`, shares invite link, member joins and gets `familyId`

**MongoDB indexing:**
- All collections: compound index on `{ familyId, updatedAt }` for efficient sync queries
- `Item`: additional index on `{ familyId, name }` for search

## Real-Time Collaboration

GraphQL subscriptions over WebSockets using Apollo's built-in `PubSub`.

**Subscriptions in v1:**
- `itemUpdated` — quantity changes, expiry updates
- `cartItemAdded` / `cartItemRemoved` / `cartCheckedOut` — shopping together in real time
- `recipeUpdated` — someone updates ingredients while another is cooking

**Deferred (tags, vendors):** Low collision likelihood — settings/configuration data changes rarely and almost never simultaneously. Add in a follow-up PR if needed.

**Flow:**
```
User A updates item
  → Resolver saves to MongoDB
  → Resolver publishes: pubsub.publish('ITEM_UPDATED', { item })
  → Apollo Server pushes to all subscribers in the same family
  → User B's Apollo Client receives update → cache auto-updates → UI re-renders
```

**PubSub upgrade path:**
- v1: In-memory PubSub (built into `graphql-subscriptions`) — fine for a single Railway instance
- Later: Redis PubSub — only needed if scaling to multiple server instances

**Transport:** `graphql-ws` for subscriptions. Apollo Client uses a split link — queries/mutations over HTTP, subscriptions over WebSocket.

## Data Migration & Backup

**Export (IndexedDB → JSON):**
- "Download my data" button in Settings
- Reads all Dexie tables, serializes to a single JSON file
- `player1inventory-backup-YYYY-MM-DD.json`

**Import (JSON → MongoDB):**
- On first sign-in, detect no MongoDB data for this user
- Prompt: "Import existing data?" with file picker
- Single GraphQL mutation accepts JSON blob, backend bulk-inserts

**Same format for ongoing backup/restore** — the export/import tool doubles as the backup feature.

## Deployment

```
MongoDB Atlas (Singapore, M0 free)
      ↑
Railway (Singapore region) ← GitHub auto-deploy on push to main
      ↑
Cloudflare Pages (Taiwan PoP) ← GitHub auto-deploy on push to main
```

**Environment variables:**

```
apps/server/.env
  MONGODB_URI=              # Atlas connection string
  CLERK_SECRET_KEY=         # Clerk backend secret
  CLIENT_ORIGIN=            # Frontend URL (for CORS)

apps/web/.env
  VITE_GRAPHQL_HTTP_URL=    # Railway backend HTTP endpoint
  VITE_GRAPHQL_WS_URL=      # Railway backend WebSocket endpoint
  VITE_CLERK_PUBLISHABLE_KEY=
```

**Development:**
```bash
pnpm dev           # starts apps/web (Vite, port 5173)
pnpm dev:server    # starts apps/server (ts-node-dev, port 4000)
```

Apollo Sandbox (`localhost:4000/graphql`) provides an interactive GraphQL explorer during development.

## Testing Strategy

**Backend tests (`apps/server`):**
- Unit tests — resolver logic with mocked Mongoose models (Vitest)
- Integration tests — full GraphQL operations against `mongodb-memory-server` (in-memory MongoDB, no Atlas needed in CI)

**Frontend tests — additions:**
- Mock Apollo Client using `@apollo/client/testing` (`MockedProvider`)
- Un-migrated hooks continue using `fake-indexeddb` during incremental migration

**Auth testing:**
- Clerk test mode with static JWT tokens — no real accounts needed in CI
- E2E tests use Clerk's test helpers to bypass login UI

**pnpm scripts (root):**
```bash
pnpm test          # frontend unit tests (Vitest)
pnpm test:server   # backend unit + integration tests
pnpm test:e2e      # Playwright E2E
pnpm test:all      # all packages
```

## Implementation Constraints

**Step 0 is a pure folder restructure** — no new packages installed. After Step 0, `pnpm dev` runs the existing frontend identically from the new `apps/web/` location. This verifies the monorepo wiring before any backend work begins.
