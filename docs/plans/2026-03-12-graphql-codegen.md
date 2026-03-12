# GraphQL Codegen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add graphql-codegen to auto-generate TypeScript resolver types (server) and typed Apollo hooks (frontend) from `.graphql` schema and operation files, eliminating manual type duplication.

**Architecture:** Schema moves from TypeScript template literals to real `.graphql` files in `apps/server/src/schema/`. A single `codegen.ts` at the repo root reads those files plus client-side operation documents in `apps/web/src/apollo/operations/`, generating `apps/server/src/generated/graphql.ts` (resolver types) and `apps/web/src/generated/graphql.ts` (Apollo hooks). Both generated files are gitignored and produced at dev time (watch) and build time (CI/CD).

**Tech Stack:** `@graphql-codegen/cli`, `@graphql-codegen/typescript`, `@graphql-codegen/typescript-resolvers`, `@graphql-codegen/typescript-operations`, `@graphql-codegen/typescript-react-apollo`, `concurrently`

**Design doc:** `docs/plans/2026-03-12-graphql-codegen-design.md`

---

### Task 1: Install packages

**Files:**
- Modify: `package.json` (root)

**Step 1: Install all codegen packages and concurrently as root devDependencies**

```bash
pnpm add -Dw @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-resolvers @graphql-codegen/typescript-operations @graphql-codegen/typescript-react-apollo concurrently
```

**Step 2: Verify packages are in root `package.json` devDependencies**

```bash
cat package.json | grep -A20 '"devDependencies"'
```

Expected: all six packages listed under `devDependencies`.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install graphql-codegen and concurrently at workspace root"
```

---

### Task 2: Migrate schema to `.graphql` files

**Files:**
- Create: `apps/server/src/schema/schema.graphql`
- Create: `apps/server/src/schema/item.graphql`
- Delete: `apps/server/src/schema/item.graphql.ts`

**Step 1: Create `apps/server/src/schema/schema.graphql`**

This file defines the base root types. The `health` query lives here since it's a general-purpose query, not entity-specific.

```graphql
type Query
type Mutation

extend type Query {
  health: String!
}
```

**Step 2: Create `apps/server/src/schema/item.graphql`**

The SDL content from the old `item.graphql.ts` template literal, without any TypeScript wrapping:

```graphql
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
```

**Step 3: Delete the old TypeScript schema file**

```bash
rm apps/server/src/schema/item.graphql.ts
```

**Step 4: Update `apps/server/src/schema/index.ts` to load `.graphql` files**

Replace the entire file with:

```typescript
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function load(filename: string): string {
  return readFileSync(join(__dirname, filename), 'utf-8')
}

export const typeDefs = [load('schema.graphql'), load('item.graphql')]
```

Note: Apollo Server 4 accepts `typeDefs` as a string array — no change needed in `apps/server/src/index.ts`.

**Step 5: Run server tests to confirm schema still works**

```bash
pnpm test:server
```

Expected: 4 tests pass (same as before).

**Step 6: Commit**

```bash
git add apps/server/src/schema/
git commit -m "refactor(server): migrate GraphQL schema from TS template literals to .graphql files"
```

---

### Task 3: Create `codegen.ts` at repo root

**Files:**
- Create: `codegen.ts` (root)

**Step 1: Create `codegen.ts`**

```typescript
import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'apps/server/src/schema/*.graphql',
  generates: {
    'apps/server/src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../context.js#Context',
        useIndexSignature: true,
      },
    },
    'apps/web/src/generated/graphql.ts': {
      documents: 'apps/web/src/apollo/operations/*.graphql',
      plugins: ['typescript', 'typescript-operations', 'typescript-react-apollo'],
      config: {
        withHooks: true,
      },
    },
  },
}

export default config
```

Notes on the config:
- `schema: 'apps/server/src/schema/*.graphql'` — reads all `.graphql` files in the schema directory
- `contextType: '../context.js#Context'` — path is relative to the generated file (`apps/server/src/generated/graphql.ts`), resolves to `apps/server/src/context.ts`, imports `Context` type from it. The `.js` extension is required for ESM.
- `useIndexSignature: true` — adds index signature to the generated `Resolvers` type, needed for `Pick<Resolvers, ...>`
- `withHooks: true` — generates React hooks (`useGetItemsQuery`, `useCreateItemMutation`, etc.)

**Step 2: Commit**

```bash
git add codegen.ts
git commit -m "feat: add graphql-codegen config at workspace root"
```

---

### Task 4: Create web operations `.graphql` file and update `.gitignore`

**Files:**
- Create: `apps/web/src/apollo/operations/items.graphql`
- Modify: `.gitignore`

**Step 1: Create `apps/web/src/apollo/operations/items.graphql`**

```graphql
query GetItems {
  items {
    id
    name
    tagIds
    vendorIds
    packageUnit
    measurementUnit
    amountPerPackage
    targetUnit
    targetQuantity
    refillThreshold
    packedQuantity
    unpackedQuantity
    consumeAmount
    dueDate
    estimatedDueDays
    expirationThreshold
    userId
    familyId
    createdAt
    updatedAt
  }
}

mutation CreateItem($name: String!) {
  createItem(name: $name) {
    id
    name
    tagIds
    targetUnit
    targetQuantity
    refillThreshold
    packedQuantity
    unpackedQuantity
    consumeAmount
    createdAt
    updatedAt
  }
}

mutation UpdateItem($id: ID!, $input: UpdateItemInput!) {
  updateItem(id: $id, input: $input) {
    id
    name
    tagIds
    vendorIds
    packageUnit
    measurementUnit
    amountPerPackage
    targetUnit
    targetQuantity
    refillThreshold
    packedQuantity
    unpackedQuantity
    consumeAmount
    dueDate
    estimatedDueDays
    expirationThreshold
    updatedAt
  }
}

mutation DeleteItem($id: ID!) {
  deleteItem(id: $id)
}
```

**Step 2: Add generated directories to `.gitignore`**

Append to `.gitignore`:

```
# Generated by graphql-codegen
apps/server/src/generated/
apps/web/src/generated/
```

**Step 3: Commit**

```bash
git add apps/web/src/apollo/operations/items.graphql .gitignore
git commit -m "feat: add GraphQL operation documents and gitignore generated files"
```

---

### Task 5: Update root scripts and run codegen

**Files:**
- Modify: `package.json` (root)

**Step 1: Update scripts in root `package.json`**

Replace the `dev` and `build` scripts and add `codegen` scripts:

```json
"scripts": {
  "dev": "concurrently 'pnpm codegen:watch' 'pnpm --filter web dev' 'pnpm --filter server dev'",
  "build": "pnpm codegen && pnpm --filter web build && pnpm --filter server build",
  "codegen": "graphql-codegen --config codegen.ts",
  "codegen:watch": "graphql-codegen --config codegen.ts --watch",
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
```

**Step 2: Run codegen for the first time**

```bash
pnpm codegen
```

Expected: two files created with no errors:
- `apps/server/src/generated/graphql.ts`
- `apps/web/src/generated/graphql.ts`

If there are errors, read the error message carefully — common issues:
- Schema glob not matching files → verify `.graphql` files exist in `apps/server/src/schema/`
- Operations glob not matching → verify `items.graphql` exists in `apps/web/src/apollo/operations/`

**Step 3: Verify generated files exist and contain expected content**

```bash
grep "useGetItemsQuery\|useCreateItemMutation" apps/web/src/generated/graphql.ts
grep "Resolvers\|ItemResolvers" apps/server/src/generated/graphql.ts
```

Expected: hooks present in web generated file, resolver types present in server generated file.

**Step 4: Verify server tests still pass**

```bash
pnpm test:server
```

Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add package.json
git commit -m "feat: add codegen and dev scripts with concurrently"
```

---

### Task 6: Apply generated types to server resolvers

**Files:**
- Modify: `apps/server/src/resolvers/item.resolver.ts`
- Modify: `apps/server/src/resolvers/index.ts`

**Step 1: Update `apps/server/src/resolvers/item.resolver.ts`**

Replace the manually-defined `UpdateItemInput` interface and untyped resolver arguments with the generated types. Read the file first, then replace with:

```typescript
import { GraphQLError } from 'graphql'
import { ItemModel } from '../models/Item.model.js'
import { requireAuth } from '../context.js'
import type { Context } from '../context.js'
import type { Resolvers, UpdateItemInput } from '../generated/graphql.js'

export const itemResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Item'> = {
  Query: {
    items: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return ItemModel.find({ userId })
    },
    item: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      return ItemModel.findOne({ _id: id, userId })
    },
  },
  Mutation: {
    createItem: async (_, { name }, ctx) => {
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
    updateItem: async (_, { id, input }, ctx) => {
      const userId = requireAuth(ctx)
      const item = await ItemModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: input as UpdateItemInput },
        { new: true },
      )
      if (!item) throw new GraphQLError('Item not found', { extensions: { code: 'NOT_FOUND' } })
      return item
    },
    deleteItem: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      const result = await ItemModel.deleteOne({ _id: id, userId })
      return result.deletedCount > 0
    },
  },
  Item: {
    id: (item) => (item as unknown as { _id: { toString(): string } })._id.toString(),
    createdAt: (item) => (item as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (item) => (item as unknown as { updatedAt: Date }).updatedAt.toISOString(),
    dueDate: (item) => {
      const d = (item as unknown as { dueDate?: Date }).dueDate
      return d ? d.toISOString() : null
    },
  },
}
```

Note: `Item` field resolvers need `as unknown as { ... }` casts because the generated `Item` type uses plain scalar types, while Mongoose returns a document object. This is an inherent mismatch between GraphQL types and Mongoose documents — the casts are intentional.

**Step 2: Update `apps/server/src/resolvers/index.ts`**

Apply the generated `Resolvers` type to the root resolver map:

```typescript
import type { Resolvers } from '../generated/graphql.js'
import { itemResolvers } from './item.resolver.js'

export const resolvers: Resolvers = {
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

**Step 3: Run server tests**

```bash
pnpm test:server
```

Expected: 4 tests pass (all existing tests — no new tests needed, types are compile-time only).

**Step 4: Run server TypeScript build to confirm type safety**

```bash
pnpm --filter server build
```

Expected: `tsc` completes with no errors. If there are TypeScript errors in the resolver, read them carefully — they indicate a type mismatch between the generated types and the implementation.

**Step 5: Commit**

```bash
git add apps/server/src/resolvers/
git commit -m "feat(server): apply generated Resolvers type to item resolver and index"
```

---

### Task 7: Verify full build and web generated output

**Files:** none — verification only

**Step 1: Run the full build**

```bash
pnpm build
```

Expected:
1. `pnpm codegen` runs first — regenerates both files
2. `pnpm --filter web build` — Vite bundles successfully, using generated hooks
3. `pnpm --filter server build` — TypeScript compiles successfully

**Step 2: Verify generated web hooks**

```bash
grep "export function useGetItemsQuery\|export function useCreateItemMutation\|export function useUpdateItemMutation\|export function useDeleteItemMutation" apps/web/src/generated/graphql.ts
```

Expected: all four hooks present.

**Step 3: Run all tests**

```bash
pnpm test:all
```

Expected: all tests pass (frontend + server).

**Step 4: Commit if anything was adjusted during verification**

Only commit if files changed during this task. If no changes, skip.

```bash
git status  # check if clean
```
