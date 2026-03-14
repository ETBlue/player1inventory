# GraphQL Codegen Design

**Date:** 2026-03-12

## Goal

Add `graphql-codegen` to auto-generate TypeScript resolver types (server) and typed Apollo hooks (frontend) from the GraphQL SDL, eliminating manual type duplication and keeping server and client in sync.

## Problem

Currently, three things must stay manually in sync:
1. `@p1i/types` — shared TypeScript interfaces
2. Typegoose model class — Mongoose schema
3. GraphQL SDL — resolver types and frontend hook types

Any field added to the schema must be manually updated in all three places. `graphql-codegen` removes the resolver type and frontend hook burden.

## Architecture

```
apps/server/src/schema/
  schema.graphql        ← base type Query, type Mutation
  item.graphql          ← Item type, queries, mutations, UpdateItemInput

                        codegen.ts (repo root)
                               ↓                         ↓
apps/server/src/generated/       apps/web/src/generated/
  graphql.ts                       graphql.ts
  (resolver types)                 (Apollo hooks)
                                         ↑
                        apps/web/src/apollo/operations/
                          items.graphql   ← GetItems, CreateItem, UpdateItem, DeleteItem
```

- **Schema source of truth:** `apps/server/src/schema/*.graphql` (plain `.graphql` files, replacing current `.ts` template literals)
- **Operations source of truth:** `apps/web/src/apollo/operations/*.graphql` (client-side operation documents)
- **Generated files:** gitignored — produced at dev time (watch) and at build time (CI/CD)
- **Server `schema/index.ts`:** loads `.graphql` files at runtime via `readFileSync`

## Packages

All installed as devDependencies at the **repo root**:

| Package | Purpose |
|---|---|
| `@graphql-codegen/cli` | CLI runner |
| `@graphql-codegen/typescript` | Base TS types from schema (shared by both outputs) |
| `@graphql-codegen/typescript-resolvers` | Typed resolver signatures for server |
| `@graphql-codegen/typescript-operations` | Typed operation documents for web |
| `@graphql-codegen/typescript-react-apollo` | Generates `useXxxQuery()` / `useXxxMutation()` hooks |
| `concurrently` | Runs codegen watch + web dev + server dev in parallel |

## Scripts

```json
// root package.json
{
  "scripts": {
    "dev": "concurrently 'pnpm codegen:watch' 'pnpm --filter web dev' 'pnpm --filter server dev'",
    "build": "pnpm codegen && pnpm --filter web build && pnpm --filter server build",
    "codegen": "graphql-codegen --config codegen.ts",
    "codegen:watch": "graphql-codegen --config codegen.ts --watch"
  }
}
```

## codegen.ts (repo root)

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

## Schema migration

Current `.ts` template literals become actual `.graphql` files:

- `apps/server/src/schema/item.graphql.ts` → deleted
- `apps/server/src/schema/schema.graphql` → created (base `type Query`, `type Mutation`, `health` query)
- `apps/server/src/schema/item.graphql` → created (Item type, queries, mutations, UpdateItemInput)
- `apps/server/src/schema/index.ts` → updated to load files via `readFileSync`

## Generated output usage

**Server** — typed resolver signatures:
```typescript
import type { Resolvers } from '../generated/graphql.js'

const itemResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Item'> = { ... }
```

**Web** — ready-made hooks (used by Task 11):
```typescript
import { useGetItemsQuery, useCreateItemMutation } from '../generated/graphql'
```

## Operations file

```graphql
# apps/web/src/apollo/operations/items.graphql
query GetItems {
  items { id name tagIds vendorIds packageUnit measurementUnit amountPerPackage
          targetUnit targetQuantity refillThreshold packedQuantity unpackedQuantity
          consumeAmount dueDate estimatedDueDays expirationThreshold
          userId familyId createdAt updatedAt }
}

mutation CreateItem($name: String!) {
  createItem(name: $name) { id name tagIds targetUnit targetQuantity
                            refillThreshold packedQuantity unpackedQuantity
                            consumeAmount createdAt updatedAt }
}

mutation UpdateItem($id: ID!, $input: UpdateItemInput!) {
  updateItem(id: $id, input: $input) { id name tagIds vendorIds packageUnit
                                       measurementUnit amountPerPackage targetUnit
                                       targetQuantity refillThreshold packedQuantity
                                       unpackedQuantity consumeAmount dueDate
                                       estimatedDueDays expirationThreshold updatedAt }
}

mutation DeleteItem($id: ID!) {
  deleteItem(id: $id)
}
```

## .gitignore additions

```
apps/server/src/generated/
apps/web/src/generated/
```

## Production

Generated files are produced in CI/CD as part of `pnpm build` (which runs `pnpm codegen` first). Railway and Cloudflare Pages both run the build command, so generated files are always present when TypeScript compilation and Vite bundling need them.
