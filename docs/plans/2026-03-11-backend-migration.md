# Backend Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from a local IndexedDB frontend to a Node.js + GraphQL + MongoDB backend in a pnpm monorepo, with Clerk auth, Apollo Client, and real-time subscriptions — incrementally, one entity at a time.

**Architecture:** pnpm workspace with `apps/web` (React frontend), `apps/server` (Apollo Server + Express), and `packages/types` (shared TypeScript interfaces). The hooks layer (`src/hooks/`) is the migration seam — components never change, only hook internals swap from Dexie to Apollo one entity at a time.

**Tech Stack:** React 19 + TanStack Router + Apollo Client + Clerk (frontend); Node.js + TypeScript + Express + Apollo Server 4 + Typegoose + Mongoose (backend); MongoDB Atlas (Singapore); Railway (backend hosting); Cloudflare Pages (frontend hosting).

**Design doc:** `docs/plans/2026-03-11-backend-migration-design.md`

---

## Phase 0 — Monorepo Restructure

> **Constraint:** Zero new packages installed. After this phase, `pnpm dev` must work identically.

### Task 1: Create workspace root config

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json` (transform into workspace root)

**Step 1: Create `pnpm-workspace.yaml` at repo root**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Step 2: Replace root `package.json` with a workspace root**

The current `package.json` becomes `apps/web/package.json` later. Create a new minimal root:

```json
{
  "name": "player1inventory-workspace",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter web dev",
    "build": "pnpm --filter web build",
    "test": "pnpm --filter web test",
    "test:watch": "pnpm --filter web test:watch",
    "test:ui": "pnpm --filter web test:ui",
    "test:server": "pnpm --filter server test",
    "test:e2e": "pnpm --filter web test:e2e",
    "test:e2e:ui": "pnpm --filter web test:e2e:ui",
    "test:e2e:debug": "pnpm --filter web test:e2e:debug",
    "test:all": "pnpm -r test",
    "lint": "pnpm --filter web lint",
    "format": "pnpm --filter web format",
    "check": "pnpm --filter web check",
    "storybook": "pnpm --filter web storybook",
    "dev:server": "pnpm --filter server dev",
    "prepare": "husky"
  }
}
```

**Step 3: Commit**

```bash
git add pnpm-workspace.yaml package.json
git commit -m "chore(monorepo): add pnpm workspace root config"
```

---

### Task 2: Move frontend files into apps/web

**Files:**
- Create dir: `apps/web/`
- Move: `src/` → `apps/web/src/`
- Move: `public/` → `apps/web/public/`
- Move: `index.html` → `apps/web/index.html`
- Move: `vite.config.ts` → `apps/web/vite.config.ts`
- Move: `vitest.config.ts` → `apps/web/vitest.config.ts`
- Move: `tsconfig.json` → `apps/web/tsconfig.json`
- Move: `tsconfig.app.json` → `apps/web/tsconfig.app.json`
- Move: `tsconfig.node.json` → `apps/web/tsconfig.node.json`
- Move: `biome.json` → `apps/web/biome.json`
- Move: `components.json` → `apps/web/components.json`
- Move: `.storybook/` → `apps/web/.storybook/`
- Move: `e2e/` → `apps/web/e2e/`

**Step 1: Create directory and move files**

```bash
mkdir -p apps/web apps/server packages/types

# Move source and assets
mv src apps/web/src
mv public apps/web/public
mv index.html apps/web/index.html

# Move config files
mv vite.config.ts apps/web/vite.config.ts
mv vitest.config.ts apps/web/vitest.config.ts
mv tsconfig.json apps/web/tsconfig.json
mv tsconfig.app.json apps/web/tsconfig.app.json
mv tsconfig.node.json apps/web/tsconfig.node.json
mv biome.json apps/web/biome.json
mv components.json apps/web/components.json

# Move tool configs
mv .storybook apps/web/.storybook
mv e2e apps/web/e2e
```

**Step 2: Create `apps/web/package.json`**

Copy the content of the original root `package.json` (before it was replaced in Task 1), and add a `name` field:

```json
{
  "name": "web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "biome lint ./src",
    "format": "biome format ./src --write",
    "check": "biome check ./src",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "node node_modules/@playwright/test/cli.js test --config=e2e/playwright.config.ts",
    "test:e2e:ui": "node node_modules/@playwright/test/cli.js test --config=e2e/playwright.config.ts --ui",
    "test:e2e:debug": "node node_modules/@playwright/test/cli.js test --config=e2e/playwright.config.ts --debug",
    "typecheck": "tsc --noEmit",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "dependencies": { ... },
  "devDependencies": { ... },
  "lint-staged": {
    "src/**/*.{ts,tsx}": ["biome check --write --unsafe"]
  }
}
```

> Copy all `dependencies` and `devDependencies` verbatim from the original root `package.json`.

**Step 3: Update `.gitignore` to add `.worktrees`**

Verify `.worktrees/` is in `.gitignore` (it should already be). Add if missing:

```
# Worktrees
.worktrees/
```

**Step 4: Update `apps/web/e2e/playwright.config.ts`**

The `webServer.command` runs `pnpm dev` — this will run in the context of `apps/web/` when invoked via `pnpm --filter web test:e2e`, so no change is needed. Verify the file looks correct:

```typescript
webServer: {
  command: 'pnpm dev',
  url: 'http://localhost:5173',
  reuseExistingServer: true,
},
```

**Step 5: Reinstall dependencies**

```bash
# From repo root
pnpm install
```

This regenerates `pnpm-lock.yaml` in workspace mode. All dependencies remain in `apps/web/node_modules/`.

**Step 6: Verify dev server starts**

```bash
pnpm dev
```

Expected: Vite dev server starts at `http://localhost:5173`, app loads in browser.

**Step 7: Verify tests pass**

```bash
pnpm test
```

Expected: All existing tests pass.

**Step 8: Commit**

```bash
git add apps/ packages/ .gitignore pnpm-lock.yaml
git commit -m "chore(monorepo): move frontend into apps/web"
```

---

## Phase 1 — Shared Types Package

### Task 3: Extract shared types

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts` (copy from `apps/web/src/types/index.ts`)

**Step 1: Create `packages/types/package.json`**

```json
{
  "name": "@p1i/types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

**Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

**Step 3: Copy types**

```bash
cp apps/web/src/types/index.ts packages/types/src/index.ts
```

**Step 4: Add `@p1i/types` as a workspace dependency in `apps/web/package.json`**

```json
{
  "dependencies": {
    "@p1i/types": "workspace:*",
    ...
  }
}
```

**Step 5: Update import in `apps/web/src/types/index.ts`**

Replace the file content with a re-export:

```typescript
// Re-export from shared package
export * from '@p1i/types'
```

This keeps all existing `@/types` imports in the frontend working without any changes.

**Step 6: Reinstall**

```bash
pnpm install
```

**Step 7: Verify**

```bash
pnpm test
pnpm dev
```

Expected: All tests pass, dev server starts.

**Step 8: Commit**

```bash
git add packages/types apps/web/src/types apps/web/package.json pnpm-lock.yaml
git commit -m "chore(monorepo): extract shared types into packages/types"
```

---

## Phase 2 — Backend Skeleton

### Task 4: Create server package with Express + Apollo Server

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/schema/index.ts`
- Create: `apps/server/src/resolvers/index.ts`
- Create: `apps/server/src/context.ts`

**Step 1: Create `apps/server/package.json`**

```json
{
  "name": "server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@apollo/server": "^4.12.0",
    "@as-integrations/express5": "^0.1.0",
    "express": "^5.1.0",
    "graphql": "^16.10.0",
    "graphql-ws": "^5.16.0",
    "ws": "^8.18.0",
    "mongoose": "^8.15.0",
    "@typegoose/typegoose": "^12.10.0",
    "@clerk/express": "^1.5.0",
    "graphql-subscriptions": "^3.0.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.3",
    "@types/ws": "^8.5.14",
    "@types/cors": "^2.8.17",
    "@types/node": "^24.10.10",
    "typescript": "~5.9.3",
    "tsx": "^4.19.4",
    "vitest": "^4.0.18",
    "mongodb-memory-server": "^10.1.4",
    "@p1i/types": "workspace:*"
  }
}
```

**Step 2: Create `apps/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

> `experimentalDecorators` and `emitDecoratorMetadata` are required by Typegoose.

**Step 3: Create a minimal health-check GraphQL schema**

`apps/server/src/schema/index.ts`:
```typescript
export const typeDefs = `#graphql
  type Query {
    health: String!
  }
`
```

**Step 4: Create resolvers**

`apps/server/src/resolvers/index.ts`:
```typescript
export const resolvers = {
  Query: {
    health: () => 'ok',
  },
}
```

**Step 5: Create context**

`apps/server/src/context.ts`:
```typescript
export interface Context {
  userId: string | null
}
```

**Step 6: Create Express + Apollo Server entry point**

`apps/server/src/index.ts`:
```typescript
import express from 'express'
import cors from 'cors'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import { typeDefs } from './schema/index.js'
import { resolvers } from './resolvers/index.js'
import type { Context } from './context.js'

const app = express()

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())

const server = new ApolloServer<Context>({ typeDefs, resolvers })
await server.start()

app.use(
  '/graphql',
  expressMiddleware(server, {
    context: async () => ({ userId: null }),
  }),
)

const PORT = process.env.PORT ?? 4000
app.listen(PORT, () => {
  console.log(`Server ready at http://localhost:${PORT}/graphql`)
})
```

**Step 7: Install server dependencies**

```bash
pnpm install
```

**Step 8: Verify server starts**

```bash
pnpm dev:server
```

Expected output: `Server ready at http://localhost:4000/graphql`

Open `http://localhost:4000/graphql` in browser — Apollo Sandbox should load. Run:
```graphql
query { health }
```
Expected: `{ "data": { "health": "ok" } }`

**Step 9: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "feat(server): add Express + Apollo Server skeleton"
```

---

### Task 5: Connect to MongoDB Atlas

**Files:**
- Create: `apps/server/src/db.ts`
- Create: `apps/server/.env.example`
- Modify: `apps/server/src/index.ts`

**Step 1: Create MongoDB Atlas cluster**

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free M0 cluster — choose **Singapore (AP_SOUTHEAST_1)** region
3. Create a database user with read/write permissions
4. Whitelist your IP (or use `0.0.0.0/0` for development)
5. Get the connection string: `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/player1inventory`

**Step 2: Create `.env.example`**

`apps/server/.env.example`:
```
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/player1inventory
CLIENT_ORIGIN=http://localhost:5173
PORT=4000
```

Create `apps/server/.env` from the example with real values. Ensure `.env` is in `.gitignore`.

**Step 3: Create `apps/server/src/db.ts`**

```typescript
import mongoose from 'mongoose'

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')
  await mongoose.connect(uri)
  console.log('Connected to MongoDB')
}
```

**Step 4: Update `apps/server/src/index.ts` to connect before starting**

```typescript
import { connectDB } from './db.js'

// Add before server.start():
await connectDB()
```

**Step 5: Verify connection**

```bash
pnpm dev:server
```

Expected: `Connected to MongoDB` then `Server ready at http://localhost:4000/graphql`

**Step 6: Commit**

```bash
git add apps/server/src/db.ts apps/server/.env.example apps/server/src/index.ts
git commit -m "feat(server): connect to MongoDB Atlas"
```

---

## Phase 3 — Authentication (Clerk)

### Task 6: Add Clerk to backend

**Files:**
- Modify: `apps/server/src/context.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/.env.example`

**Step 1: Add Clerk secret key to `.env.example`**

```
CLERK_SECRET_KEY=sk_test_...
```

Add real value to `apps/server/.env`.

**Step 2: Update `apps/server/src/context.ts`**

```typescript
export interface Context {
  userId: string | null
}

export function requireAuth(ctx: Context): string {
  if (!ctx.userId) throw new Error('Unauthorized')
  return ctx.userId
}
```

**Step 3: Update `apps/server/src/index.ts` context factory**

```typescript
import { clerkMiddleware, getAuth } from '@clerk/express'

// Add after cors middleware:
app.use(clerkMiddleware())

// Update expressMiddleware context:
context: async ({ req }) => {
  const auth = getAuth(req)
  return { userId: auth.userId ?? null }
},
```

**Step 4: Verify auth middleware loads**

```bash
pnpm dev:server
```

Expected: Server starts without errors. The `health` query still works unauthenticated (no `requireAuth` guard on it yet).

**Step 5: Commit**

```bash
git add apps/server/src/context.ts apps/server/src/index.ts apps/server/.env.example
git commit -m "feat(server): add Clerk auth middleware"
```

---

### Task 7: Add Clerk to frontend

**Files:**
- Modify: `apps/web/src/main.tsx`
- Create: `apps/web/src/routes/sign-in.tsx`
- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/.env.example` (create if missing)

**Step 1: Install Clerk React SDK in `apps/web`**

```bash
pnpm --filter web add @clerk/react
```

**Step 2: Create `apps/web/.env.example`**

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_GRAPHQL_HTTP_URL=http://localhost:4000/graphql
VITE_GRAPHQL_WS_URL=ws://localhost:4000/graphql
```

Create `apps/web/.env.local` with real values from Clerk dashboard.

**Step 3: Wrap app in `ClerkProvider` in `apps/web/src/main.tsx`**

```typescript
import { ClerkProvider } from '@clerk/react'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!publishableKey) throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set')

// Wrap <RouterProvider> with <ClerkProvider>:
<ClerkProvider publishableKey={publishableKey}>
  <RouterProvider router={router} />
</ClerkProvider>
```

**Step 4: Create sign-in route `apps/web/src/routes/sign-in.tsx`**

```typescript
import { SignIn } from '@clerk/react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn />
    </div>
  )
}
```

**Step 5: Add auth guard in `apps/web/src/routes/__root.tsx`**

```typescript
import { useAuth } from '@clerk/react'
import { Navigate } from '@tanstack/react-router'

// In the root component, redirect unauthenticated users to /sign-in
// (Keep IndexedDB-backed routes working for now — auth guard can be added per-route during migration)
```

> For now, only add the `ClerkProvider` wrapper. Full auth guards come per-route during entity migration.

**Step 6: Verify**

```bash
pnpm dev
```

Expected: App loads. Sign-in page accessible at `/sign-in`. Clerk dashboard shows the app.

**Step 7: Commit**

```bash
git add apps/web/src/main.tsx apps/web/src/routes/sign-in.tsx apps/web/.env.example
git commit -m "feat(web): add Clerk auth provider and sign-in route"
```

---

## Phase 4 — Apollo Client Setup

### Task 8: Add Apollo Client to frontend

**Files:**
- Create: `apps/web/src/apollo/client.ts`
- Modify: `apps/web/src/main.tsx`

**Step 1: Install Apollo Client**

```bash
pnpm --filter web add @apollo/client graphql graphql-ws
```

**Step 2: Create `apps/web/src/apollo/client.ts`**

```typescript
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  split,
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { createClient } from 'graphql-ws'
import { getMainDefinition } from '@apollo/client/utilities'

const httpLink = createHttpLink({
  uri: import.meta.env.VITE_GRAPHQL_HTTP_URL ?? 'http://localhost:4000/graphql',
})

// Attach Clerk JWT to every request
// getToken is injected at runtime — see createApolloClient below
export function createApolloClient(getToken: () => Promise<string | null>) {
  const authLink = setContext(async (_, { headers }) => {
    const token = await getToken()
    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : '',
      },
    }
  })

  const wsLink = new GraphQLWsLink(
    createClient({
      url: import.meta.env.VITE_GRAPHQL_WS_URL ?? 'ws://localhost:4000/graphql',
      connectionParams: async () => {
        const token = await getToken()
        return { authorization: token ? `Bearer ${token}` : '' }
      },
    }),
  )

  const splitLink = split(
    ({ query }) => {
      const def = getMainDefinition(query)
      return def.kind === 'OperationDefinition' && def.operation === 'subscription'
    },
    wsLink,
    authLink.concat(httpLink),
  )

  return new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
  })
}
```

**Step 3: Update `apps/web/src/main.tsx` to provide Apollo Client**

```typescript
import { ApolloProvider } from '@apollo/client'
import { useAuth } from '@clerk/react'
import { createApolloClient } from './apollo/client'

function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth()
  const client = createApolloClient(() => getToken())
  return <ApolloProvider client={client}>{children}</ApolloProvider>
}

// Wrap RouterProvider with ApolloWrapper (inside ClerkProvider):
<ClerkProvider publishableKey={publishableKey}>
  <ApolloWrapper>
    <RouterProvider router={router} />
  </ApolloWrapper>
</ClerkProvider>
```

> Note: `createApolloClient` is called once inside `ApolloWrapper`. For production, memoize it with `useMemo` to avoid recreating on every render.

**Step 4: Verify**

```bash
pnpm dev
```

Expected: App loads. No console errors about Apollo.

**Step 5: Commit**

```bash
git add apps/web/src/apollo pnpm-lock.yaml
git commit -m "feat(web): add Apollo Client with Clerk auth link and WebSocket for subscriptions"
```

---

## Phase 5 — First Entity Migration (Items)

### Task 9: Add Item Typegoose model

**Files:**
- Create: `apps/server/src/models/Item.model.ts`

**Step 1: Write the failing test**

Create `apps/server/src/models/Item.model.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { getModelForClass } from '@typegoose/typegoose'
import { ItemModel } from './Item.model.js'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

describe('ItemModel', () => {
  it('user can create an item', async () => {
    // Given valid item data
    const item = await ItemModel.create({
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_test123',
    })

    // Then item is persisted with id and timestamps
    expect(item.id).toBeDefined()
    expect(item.name).toBe('Milk')
    expect(item.userId).toBe('user_test123')
    expect(item.createdAt).toBeInstanceOf(Date)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test:server
```

Expected: FAIL — `ItemModel` does not exist yet.

**Step 3: Create `apps/server/src/models/Item.model.ts`**

```typescript
import { prop, getModelForClass, modelOptions, index } from '@typegoose/typegoose'
import type { Item } from '@p1i/types'

@modelOptions({ schemaOptions: { timestamps: true, collection: 'items' } })
@index({ familyId: 1, updatedAt: 1 })
@index({ familyId: 1, name: 1 })
class ItemClass implements Omit<Item, 'id'> {
  @prop({ required: true })
  name!: string

  @prop({ type: [String], default: [] })
  tagIds!: string[]

  @prop({ type: [String], default: [] })
  vendorIds?: string[]

  @prop()
  packageUnit?: string

  @prop()
  measurementUnit?: string

  @prop()
  amountPerPackage?: number

  @prop({ required: true, enum: ['package', 'measurement'] })
  targetUnit!: 'package' | 'measurement'

  @prop({ required: true, default: 0 })
  targetQuantity!: number

  @prop({ required: true, default: 0 })
  refillThreshold!: number

  @prop({ required: true, default: 0 })
  packedQuantity!: number

  @prop({ required: true, default: 0 })
  unpackedQuantity!: number

  @prop({ required: true, default: 1 })
  consumeAmount!: number

  @prop()
  dueDate?: Date

  @prop()
  estimatedDueDays?: number

  @prop()
  expirationThreshold?: number

  // Multi-user fields
  @prop({ required: true })
  userId!: string

  @prop()
  familyId?: string

  // Populated by @modelOptions timestamps: true
  createdAt!: Date
  updatedAt!: Date
}

export const ItemModel = getModelForClass(ItemClass)
```

**Step 4: Run test to verify it passes**

```bash
pnpm test:server
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/models/Item.model.ts apps/server/src/models/Item.model.test.ts
git commit -m "feat(server): add Item Typegoose model with multi-user fields"
```

---

### Task 10: Add Item GraphQL schema + resolvers

**Files:**
- Create: `apps/server/src/schema/item.graphql.ts`
- Create: `apps/server/src/resolvers/item.resolver.ts`
- Modify: `apps/server/src/schema/index.ts`
- Modify: `apps/server/src/resolvers/index.ts`

**Step 1: Write the failing integration test**

Create `apps/server/src/resolvers/item.resolver.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

let mongod: MongoMemoryServer
let server: ApolloServer<Context>

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
  await mongoose.disconnect()
  await mongod.stop()
})

describe('Item resolvers', () => {
  it('user can create an item via GraphQL', async () => {
    // Given an authenticated context
    const context: Context = { userId: 'user_test123' }

    // When user creates an item
    const response = await server.executeOperation(
      {
        query: `mutation CreateItem($name: String!) {
          createItem(name: $name) { id name userId }
        }`,
        variables: { name: 'Milk' },
      },
      { contextValue: context },
    )

    // Then item is returned with userId
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const item = response.body.data?.createItem
      expect(item.name).toBe('Milk')
      expect(item.userId).toBe('user_test123')
      expect(item.id).toBeDefined()
    }
  })

  it('user can list their items', async () => {
    const context: Context = { userId: 'user_test123' }

    const response = await server.executeOperation(
      { query: `query { items { id name } }` },
      { contextValue: context },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const items = response.body.data?.items
      expect(Array.isArray(items)).toBe(true)
      expect(items.length).toBeGreaterThan(0)
    }
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test:server
```

Expected: FAIL — resolvers not implemented yet.

**Step 3: Create `apps/server/src/schema/item.graphql.ts`**

```typescript
export const itemTypeDefs = `#graphql
  type Item {
    id: ID!
    name: String!
    tagIds: [String!]!
    vendorIds: [String!]
    packageUnit: String
    measurementUnit: String
    amountPerPackage: Float
    targetUnit: String!
    targetQuantity: Float!
    refillThreshold: Float!
    packedQuantity: Float!
    unpackedQuantity: Float!
    consumeAmount: Float!
    dueDate: String
    estimatedDueDays: Int
    expirationThreshold: Int
    userId: String!
    familyId: String
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    items: [Item!]!
    item(id: ID!): Item
  }

  extend type Mutation {
    createItem(name: String!): Item!
    updateItem(id: ID!, input: UpdateItemInput!): Item!
    deleteItem(id: ID!): Boolean!
  }

  input UpdateItemInput {
    name: String
    tagIds: [String!]
    vendorIds: [String!]
    targetUnit: String
    targetQuantity: Float
    refillThreshold: Float
    packedQuantity: Float
    unpackedQuantity: Float
    consumeAmount: Float
    packageUnit: String
    measurementUnit: String
    amountPerPackage: Float
    dueDate: String
    estimatedDueDays: Int
    expirationThreshold: Int
  }
`
```

**Step 4: Create `apps/server/src/resolvers/item.resolver.ts`**

```typescript
import { ItemModel } from '../models/Item.model.js'
import { requireAuth } from '../context.js'
import type { Context } from '../context.js'

export const itemResolvers = {
  Query: {
    items: async (_: unknown, __: unknown, ctx: Context) => {
      const userId = requireAuth(ctx)
      return ItemModel.find({ userId })
    },
    item: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const userId = requireAuth(ctx)
      return ItemModel.findOne({ _id: id, userId })
    },
  },
  Mutation: {
    createItem: async (_: unknown, { name }: { name: string }, ctx: Context) => {
      const userId = requireAuth(ctx)
      return ItemModel.create({
        name,
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        userId,
      })
    },
    updateItem: async (
      _: unknown,
      { id, input }: { id: string; input: Record<string, unknown> },
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx)
      return ItemModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: input },
        { new: true },
      )
    },
    deleteItem: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const userId = requireAuth(ctx)
      await ItemModel.deleteOne({ _id: id, userId })
      return true
    },
  },
  Item: {
    id: (item: { _id: { toString(): string } }) => item._id.toString(),
    createdAt: (item: { createdAt: Date }) => item.createdAt.toISOString(),
    updatedAt: (item: { updatedAt: Date }) => item.updatedAt.toISOString(),
  },
}
```

**Step 5: Update `apps/server/src/schema/index.ts`**

```typescript
import { itemTypeDefs } from './item.graphql.js'

export const typeDefs = `#graphql
  type Query
  type Mutation

  ${itemTypeDefs}

  extend type Query {
    health: String!
  }
`
```

**Step 6: Update `apps/server/src/resolvers/index.ts`**

```typescript
import { itemResolvers } from './item.resolver.js'

export const resolvers = {
  Query: {
    health: () => 'ok',
    ...itemResolvers.Query,
  },
  Mutation: {
    ...itemResolvers.Mutation,
  },
  Item: itemResolvers.Item,
}
```

**Step 7: Run test to verify it passes**

```bash
pnpm test:server
```

Expected: PASS

**Step 8: Commit**

```bash
git add apps/server/src/schema apps/server/src/resolvers
git commit -m "feat(server): add Item GraphQL schema and resolvers"
```

---

### Task 11: Migrate useItems hook to Apollo Client

**Files:**
- Create: `apps/web/src/apollo/queries/items.ts`
- Modify: `apps/web/src/hooks/useItems.ts`

**Step 1: Write the failing test**

Update `apps/web/src/hooks/useItems.test.ts` (create if missing):
```typescript
import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { MockedProvider } from '@apollo/client/testing'
import { GET_ITEMS } from '../apollo/queries/items'
import { useItems } from './useItems'

const mocks = [
  {
    request: { query: GET_ITEMS },
    result: { data: { items: [{ id: '1', name: 'Milk', tagIds: [] }] } },
  },
]

it('user can fetch items via Apollo', async () => {
  const { result } = renderHook(() => useItems(), {
    wrapper: ({ children }) => (
      <MockedProvider mocks={mocks}>{children}</MockedProvider>
    ),
  })

  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(result.current.data?.items[0].name).toBe('Milk')
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test
```

Expected: FAIL — `GET_ITEMS` query does not exist yet.

**Step 3: Create `apps/web/src/apollo/queries/items.ts`**

```typescript
import { gql } from '@apollo/client'

export const GET_ITEMS = gql`
  query GetItems {
    items {
      id name tagIds vendorIds targetUnit targetQuantity refillThreshold
      packedQuantity unpackedQuantity consumeAmount packageUnit measurementUnit
      amountPerPackage dueDate estimatedDueDays expirationThreshold
      createdAt updatedAt
    }
  }
`

export const CREATE_ITEM = gql`
  mutation CreateItem($name: String!) {
    createItem(name: $name) { id name }
  }
`

export const UPDATE_ITEM = gql`
  mutation UpdateItem($id: ID!, $input: UpdateItemInput!) {
    updateItem(id: $id, input: $input) { id name }
  }
`

export const DELETE_ITEM = gql`
  mutation DeleteItem($id: ID!) {
    deleteItem(id: $id)
  }
`
```

**Step 4: Update `apps/web/src/hooks/useItems.ts`**

Replace Dexie-based hooks with Apollo hooks. Keep the same exported function names so components need no changes:

```typescript
import { useQuery, useMutation } from '@apollo/client'
import {
  GET_ITEMS,
  CREATE_ITEM,
  UPDATE_ITEM,
  DELETE_ITEM,
} from '../apollo/queries/items'

export function useItems() {
  return useQuery(GET_ITEMS)
}

export function useCreateItem() {
  return useMutation(CREATE_ITEM, {
    refetchQueries: [{ query: GET_ITEMS }],
  })
}

export function useUpdateItem() {
  return useMutation(UPDATE_ITEM, {
    refetchQueries: [{ query: GET_ITEMS }],
  })
}

export function useDeleteItem() {
  return useMutation(DELETE_ITEM, {
    refetchQueries: [{ query: GET_ITEMS }],
  })
}
```

> **Note:** Keep the old Dexie-based helpers (`useItem`, `useItemWithQuantity`, etc.) intact until all callers are migrated. Add Apollo versions alongside them.

**Step 5: Run test to verify it passes**

```bash
pnpm test
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/web/src/apollo/queries apps/web/src/hooks/useItems.ts
git commit -m "feat(web): migrate useItems hook from Dexie to Apollo Client"
```

---

## Phase 6 — Data Export & Import

### Task 12: IndexedDB export (backup)

**Files:**
- Create: `apps/web/src/lib/exportData.ts`
- Modify: `apps/web/src/routes/settings/index.tsx`

**Step 1: Write the failing test**

`apps/web/src/lib/exportData.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildExportPayload } from './exportData'

it('export includes all entity types', () => {
  const payload = buildExportPayload({
    items: [{ id: '1', name: 'Milk' }],
    tags: [],
    tagTypes: [],
    vendors: [],
    recipes: [],
    inventoryLogs: [],
    shoppingCarts: [],
    cartItems: [],
  })

  expect(payload.version).toBe(1)
  expect(payload.exportedAt).toBeDefined()
  expect(payload.items).toHaveLength(1)
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test
```

Expected: FAIL

**Step 3: Create `apps/web/src/lib/exportData.ts`**

```typescript
import { db } from '@/db'

export interface ExportPayload {
  version: number
  exportedAt: string
  items: unknown[]
  tags: unknown[]
  tagTypes: unknown[]
  vendors: unknown[]
  recipes: unknown[]
  inventoryLogs: unknown[]
  shoppingCarts: unknown[]
  cartItems: unknown[]
}

export function buildExportPayload(data: Omit<ExportPayload, 'version' | 'exportedAt'>): ExportPayload {
  return { version: 1, exportedAt: new Date().toISOString(), ...data }
}

export async function exportAllData(): Promise<void> {
  const [items, tags, tagTypes, vendors, recipes, inventoryLogs, shoppingCarts, cartItems] =
    await Promise.all([
      db.items.toArray(),
      db.tags.toArray(),
      db.tagTypes.toArray(),
      db.vendors.toArray(),
      db.recipes.toArray(),
      db.inventoryLogs.toArray(),
      db.shoppingCarts.toArray(),
      db.cartItems.toArray(),
    ])

  const payload = buildExportPayload({ items, tags, tagTypes, vendors, recipes, inventoryLogs, shoppingCarts, cartItems })
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `player1inventory-backup-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}
```

**Step 4: Add "Download my data" button to Settings page**

In `apps/web/src/routes/settings/index.tsx`, add a button that calls `exportAllData()`.

**Step 5: Run test to verify it passes**

```bash
pnpm test
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/web/src/lib/exportData.ts apps/web/src/lib/exportData.test.ts
git commit -m "feat(web): add IndexedDB export for backup and migration"
```

---

### Task 13: Backend bulk import mutation

**Files:**
- Create: `apps/server/src/schema/import.graphql.ts`
- Create: `apps/server/src/resolvers/import.resolver.ts`
- Update schema and resolvers index files

**Step 1: Write the failing test**

`apps/server/src/resolvers/import.resolver.test.ts`:
```typescript
it('user can import exported data', async () => {
  const context: Context = { userId: 'user_import_test' }
  const payload = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    items: [{ id: 'old-id', name: 'Milk', tagIds: [], targetUnit: 'package', targetQuantity: 2, refillThreshold: 1, packedQuantity: 1, unpackedQuantity: 0, consumeAmount: 1, createdAt: new Date(), updatedAt: new Date() }],
    tags: [], tagTypes: [], vendors: [], recipes: [], inventoryLogs: [], shoppingCarts: [], cartItems: [],
  })

  const response = await server.executeOperation(
    {
      query: `mutation Import($payload: String!) { importData(payload: $payload) { itemCount } }`,
      variables: { payload },
    },
    { contextValue: context },
  )

  expect(response.body.kind).toBe('single')
  if (response.body.kind === 'single') {
    expect(response.body.data?.importData.itemCount).toBe(1)
  }
})
```

**Step 2: Implement import resolver**

The import resolver:
1. Parses the JSON payload
2. For each entity, strips the old `id` and assigns the authenticated `userId`
3. Bulk-inserts using `insertMany`

**Step 3: Run tests, verify pass, commit**

```bash
pnpm test:server
git add apps/server/src/schema/import.graphql.ts apps/server/src/resolvers/import.resolver.ts
git commit -m "feat(server): add bulk import mutation for data migration"
```

---

## Phase 7 — Remaining Entity Migrations

> Follow the same pattern as Phase 5 (Tasks 9-11) for each entity. Each entity needs:
> 1. Typegoose model in `apps/server/src/models/`
> 2. GraphQL SDL in `apps/server/src/schema/`
> 3. Resolver in `apps/server/src/resolvers/`
> 4. Apollo queries in `apps/web/src/apollo/queries/`
> 5. Updated hook in `apps/web/src/hooks/`

**Migration order** (suggested — least dependent first):

| Order | Entity | Hook file |
|---|---|---|
| 1 | TagType | `useTags.ts` |
| 2 | Tag | `useTags.ts` |
| 3 | Vendor | `useVendors.ts` |
| 4 | Recipe | `useRecipes.ts` |
| 5 | InventoryLog | `useInventoryLogs.ts` |
| 6 | ShoppingCart + CartItem | `useShoppingCart.ts` |

After all entities are migrated, remove Dexie from `apps/web/package.json` and delete `apps/web/src/db/`.

---

## Phase 8 — Real-Time Subscriptions

### Add subscriptions to Item and Cart

After items and cart are fully migrated, add GraphQL subscriptions.

**Files per entity:**
- Add `Subscription` type to SDL
- Add `pubsub.publish()` calls in update/create resolvers
- Add `useSubscription` hook calls in frontend
- Update Apollo cache via `subscribeToMore` in `useItems`

**Subscription events to implement:**
1. `itemUpdated` — published in `updateItem` resolver
2. `cartItemAdded` / `cartItemRemoved` — published in cart resolvers
3. `cartCheckedOut` — published when cart status → `completed`

**PubSub setup in `apps/server/src/index.ts`:**
```typescript
import { PubSub } from 'graphql-subscriptions'
export const pubsub = new PubSub()
```

Pass `pubsub` through context so resolvers can publish events.

---

## Phase 9 — User & Family Sharing

### Add User and Family models

**New entities:**
- `User` — `clerkId`, `email`, `familyId?`
- `Family` — `name`, `memberIds[]`

**Family invite flow:**
1. Owner calls `createFamily` mutation → creates Family, sets own `familyId`
2. Owner calls `generateInviteLink` → returns a short-lived token
3. Member opens invite link → calls `joinFamily(token)` mutation → sets own `familyId`
4. All subsequent queries filter by `familyId` instead of `userId`

**Resolver filter update:**
```typescript
// Instead of: ItemModel.find({ userId })
// Use:
const scope = user.familyId ? { familyId: user.familyId } : { userId }
ItemModel.find(scope)
```

---

## Phase 10 — Deployment

### Task: Deploy to Railway + Cloudflare Pages

**Railway (backend):**
1. Create new Railway project
2. Connect GitHub repo
3. Set build command: `pnpm --filter server build`
4. Set start command: `pnpm --filter server start`
5. Add environment variables (MongoDB URI, Clerk secret, Client origin)
6. Select Singapore region

**Cloudflare Pages (frontend):**
1. Connect GitHub repo to Cloudflare Pages
2. Set build command: `pnpm --filter web build`
3. Set output directory: `apps/web/dist`
4. Add `apps/web/public/_redirects`:
   ```
   /*  /index.html  200
   ```
5. Add environment variables (Clerk publishable key, GraphQL URLs)

**MongoDB Atlas:**
- Cluster must be created in Singapore (AP_SOUTHEAST_1)
- This cannot be changed after creation

---

## Verification Checklist

Before considering the migration complete:

- [ ] `pnpm dev` starts frontend with no console errors
- [ ] `pnpm dev:server` starts backend with MongoDB connected
- [ ] All `pnpm test` pass
- [ ] All `pnpm test:server` pass
- [ ] `pnpm test:e2e` passes
- [ ] Sign in with Clerk works end-to-end
- [ ] Creating an item in the UI appears in MongoDB Atlas
- [ ] Two browser tabs (simulating two users) see real-time updates on item changes
- [ ] Backup download produces valid JSON
- [ ] Restore import populates the database correctly
