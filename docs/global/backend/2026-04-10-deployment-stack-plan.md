# Deployment Stack Implementation Plan

> **For Claude:** Use `superpowers:executing-plans` to implement this plan task-by-task.

**Design doc:** `docs/global/backend/2026-04-10-deployment-stack-design.md`
**Branch:** `feature/deployment-stack`
**Worktree:** `.worktrees/feature-deployment-stack`

## Context

Replace MongoDB + Mongoose/Typegoose with PostgreSQL + Prisma. Deploy frontend to Cloudflare Pages, backend to Railway, database to Neon. Auth via Clerk (unchanged). The GraphQL surface (Apollo Server, all `.graphql` schema files, Apollo Client on frontend) stays identical — only the data layer and hosting change.

**Stack after this plan:**
- Frontend: Cloudflare Pages (static SPA)
- Backend: Railway (Node.js + Express + Apollo Server)
- Database: Neon (PostgreSQL)
- ORM: Prisma (replaces Mongoose + Typegoose)
- Auth: Clerk (unchanged)

---

## Phase 1 — Prisma Setup

### Task 1.1 — Install Prisma, remove Mongoose/Typegoose

**Files to modify:** `apps/server/package.json`

Remove:
- `mongoose`
- `@typegoose/typegoose`
- `mongodb-memory-server` (devDep)

Add:
- `@prisma/client` (prod)
- `prisma` (devDep)

```bash
cd apps/server
pnpm remove mongoose @typegoose/typegoose
pnpm remove -D mongodb-memory-server
pnpm add @prisma/client
pnpm add -D prisma
```

### Task 1.2 — Write `schema.prisma`

**File to create:** `apps/server/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TargetUnit {
  package
  measurement
}

enum ExpirationMode {
  disabled
  date
  days_from_purchase
}

enum CartStatus {
  active
  completed
  abandoned
}

enum TagColor {
  red
  orange
  yellow
  green
  teal
  blue
  indigo
  purple
  pink
  gray
}

model TagType {
  id       String   @id @default(cuid())
  name     String
  color    TagColor
  userId   String
  familyId String?

  tags Tag[]

  @@index([userId, name])
  @@index([familyId, name])
}

model Tag {
  id       String   @id @default(cuid())
  name     String
  typeId   String
  userId   String
  familyId String?
  parentId String?

  type     TagType   @relation(fields: [typeId], references: [id])
  parent   Tag?      @relation("TagHierarchy", fields: [parentId], references: [id])
  children Tag[]     @relation("TagHierarchy")
  items    ItemTag[]

  @@index([userId, typeId])
  @@index([familyId, typeId])
}

model Vendor {
  id       String  @id @default(cuid())
  name     String
  userId   String
  familyId String?

  items ItemVendor[]

  @@index([userId, name])
  @@index([familyId, name])
}

model Item {
  id                  String         @id @default(cuid())
  name                String
  packageUnit         String?
  measurementUnit     String?
  amountPerPackage    Float?
  targetUnit          TargetUnit
  targetQuantity      Float          @default(0)
  refillThreshold     Float          @default(0)
  packedQuantity      Float          @default(0)
  unpackedQuantity    Float          @default(0)
  consumeAmount       Float          @default(1)
  dueDate             DateTime?
  estimatedDueDays    Int?
  expirationThreshold Int?
  expirationMode      ExpirationMode @default(disabled)
  userId              String
  familyId            String?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  tags          ItemTag[]
  vendors       ItemVendor[]
  recipes       RecipeItem[]
  inventoryLogs InventoryLog[]
  cartItems     CartItem[]

  @@index([familyId, updatedAt])
  @@index([familyId, name])
}

model ItemTag {
  itemId String
  tagId  String

  item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([itemId, tagId])
}

model ItemVendor {
  itemId   String
  vendorId String

  item   Item   @relation(fields: [itemId], references: [id], onDelete: Cascade)
  vendor Vendor @relation(fields: [vendorId], references: [id], onDelete: Cascade)

  @@id([itemId, vendorId])
}

model Recipe {
  id           String    @id @default(cuid())
  name         String
  lastCookedAt DateTime?
  userId       String
  familyId     String?

  items RecipeItem[]

  @@index([userId, name])
  @@index([familyId, name])
}

model RecipeItem {
  recipeId      String
  itemId        String
  defaultAmount Float

  recipe Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  item   Item   @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@id([recipeId, itemId])
}

model Cart {
  id          String     @id @default(cuid())
  status      CartStatus
  userId      String
  familyId    String?
  completedAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  items CartItem[]

  @@index([userId, status])
}

model CartItem {
  id       String @id @default(cuid())
  cartId   String
  itemId   String
  quantity Float
  userId   String

  cart Cart @relation(fields: [cartId], references: [id], onDelete: Cascade)
  item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@index([cartId])
  @@index([itemId])
}

model InventoryLog {
  id         String   @id @default(cuid())
  itemId     String
  delta      Float
  quantity   Float
  occurredAt DateTime
  userId     String
  note       String?

  item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@index([itemId, occurredAt(sort: Desc)])
}

model FamilyGroup {
  id            String   @id @default(cuid())
  name          String
  code          String   @unique
  ownerUserId   String
  memberUserIds String[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([code])
}
```

### Task 1.3 — Replace `db.ts` with Prisma client singleton

**File to delete:** `apps/server/src/db.ts` (Mongoose connect)

**File to create:** `apps/server/src/lib/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### Task 1.4 — Update `index.ts` — remove Mongoose, add Prisma

**File to modify:** `apps/server/src/index.ts`

- Remove `import { connectDB } from './db'`
- Remove `await connectDB()` call
- Add `import { prisma } from './lib/prisma'`
- Add graceful shutdown: `process.on('beforeExit', () => prisma.$disconnect())`
- Update env var reference: `MONGODB_URI` → `DATABASE_URL` (used by Prisma implicitly; remove any explicit reference)

### Task 1.5 — Update `.env.example`

**File to modify:** `apps/server/.env.example`

```env
# Database (Neon PostgreSQL connection string)
DATABASE_URL="postgresql://user:password@host/player1inventory?sslmode=require"

# Auth
CLERK_SECRET_KEY=sk_test_...

# Server
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

# Testing (dev/CI only — do not set in production)
E2E_TEST_MODE=false
```

### Task 1.6 — Generate Prisma client and create initial migration

```bash
cd apps/server
pnpm prisma generate
pnpm prisma migrate dev --name init
```

**Verification gate (Phase 1):**
```bash
(cd apps/server && pnpm build) 2>&1 | tee /tmp/p1i-server-build.log
```
Must compile with zero TypeScript errors before proceeding.

---

## Phase 2 — Resolver Migration

Migrate resolvers one entity at a time. The GraphQL schema files (`.graphql`) are untouched throughout. Each task: (1) rewrite the resolver file, (2) delete the old model file, (3) verify build.

Import `prisma` at the top of each resolver:
```typescript
import { prisma } from '../lib/prisma'
```

Remove all Mongoose model imports (`import { ItemModel } from '../models/Item.model'`, etc.).

### Task 2.1 — Migrate TagType + Tag resolvers

**Files to modify:** `apps/server/src/resolvers/tag.resolver.ts`
**Files to delete:** `apps/server/src/models/Tag.model.ts`

Key patterns:

```typescript
// tagTypes query
const tagTypes = await prisma.tagType.findMany({ where: { userId } })

// tags query
const tags = await prisma.tag.findMany({ where: { userId } })

// tagsByType query
const tags = await prisma.tag.findMany({ where: { userId, typeId } })

// tagCountByType query
const count = await prisma.tag.count({ where: { userId, typeId } })

// createTagType mutation
const tagType = await prisma.tagType.create({ data: { name, color, userId } })

// updateTagType mutation
const tagType = await prisma.tagType.update({ where: { id }, data: { name, color } })

// deleteTagType mutation — delete tags first, then type (preserves existing cascade logic)
await prisma.tag.deleteMany({ where: { typeId: id, userId } })
await prisma.tagType.delete({ where: { id } })

// createTag mutation
const tag = await prisma.tag.create({ data: { name, typeId, userId, parentId: parentId ?? null } })

// updateTag mutation
const tag = await prisma.tag.update({ where: { id }, data: { name, typeId, parentId } })

// deleteTag mutation (deleteChildren=true: recursive delete; false: orphan children + remove from items)
if (deleteChildren) {
  // recursively collect descendant IDs, then deleteMany
} else {
  await prisma.tag.updateMany({ where: { parentId: id }, data: { parentId: null } })
}
await prisma.itemTag.deleteMany({ where: { tagId: id } })
await prisma.tag.delete({ where: { id } })
```

Remove `Tag.id` and `TagType.id` field resolvers — Prisma `id` is already a string.

### Task 2.2 — Migrate Vendor resolver

**Files to modify:** `apps/server/src/resolvers/vendor.resolver.ts`
**Files to delete:** `apps/server/src/models/Vendor.model.ts`

```typescript
// vendors query
const vendors = await prisma.vendor.findMany({ where: { userId } })

// createVendor
const vendor = await prisma.vendor.create({ data: { name, userId } })

// updateVendor
const vendor = await prisma.vendor.update({ where: { id }, data: { name } })

// deleteVendor — ItemVendor rows cascade automatically; no manual cleanup needed
await prisma.vendor.delete({ where: { id } })
```

### Task 2.3 — Migrate Item resolver

**Files to modify:** `apps/server/src/resolvers/item.resolver.ts`
**Files to delete:** `apps/server/src/models/Item.model.ts`

Key patterns:

```typescript
// items query — include junction relations for tag/vendor IDs
const items = await prisma.item.findMany({
  where: { userId },
  include: { tags: true, vendors: true },
})

// Map to GraphQL shape: item.tags.map(t => t.tagId), item.vendors.map(v => v.vendorId)

// itemCountByTag
const count = await prisma.itemTag.count({ where: { tagId } })

// itemCountByVendor
const count = await prisma.itemVendor.count({ where: { vendorId } })

// itemCountByRecipe
const count = await prisma.recipeItem.count({ where: { recipeId } })

// createItem — create item then junction rows
const item = await prisma.item.create({ data: { ...fields, userId } })
if (tagIds?.length) {
  await prisma.itemTag.createMany({ data: tagIds.map(tagId => ({ itemId: item.id, tagId })) })
}
if (vendorIds?.length) {
  await prisma.itemVendor.createMany({ data: vendorIds.map(vendorId => ({ itemId: item.id, vendorId })) })
}

// updateItem — replace junctions
await prisma.itemTag.deleteMany({ where: { itemId: id } })
if (input.tagIds?.length) {
  await prisma.itemTag.createMany({ data: input.tagIds.map(tagId => ({ itemId: id, tagId })) })
}
// same for vendorIds

// deleteItem — InventoryLog, RecipeItem, CartItem, ItemTag, ItemVendor all cascade
await prisma.item.delete({ where: { id } })
```

**Field resolvers to remove:** `Item.id` (already string), `Item.createdAt`, `Item.updatedAt` (Prisma returns Date — serialize to ISO string in resolver if GraphQL type is String, or change GraphQL type to use scalar).

**Note on dates:** Check item.graphql — if `createdAt`/`updatedAt`/`dueDate` are typed as `String`, keep `.toISOString()` field resolvers. If typed as a custom scalar, update accordingly.

### Task 2.4 — Migrate Recipe resolver

**Files to modify:** `apps/server/src/resolvers/recipe.resolver.ts`
**Files to delete:** `apps/server/src/models/Recipe.model.ts`

```typescript
// recipes query
const recipes = await prisma.recipe.findMany({
  where: { userId },
  include: { items: true },
})
// Map: recipe.items → [{ itemId, defaultAmount }]

// createRecipe
const recipe = await prisma.recipe.create({ data: { name, userId } })
if (items?.length) {
  await prisma.recipeItem.createMany({
    data: items.map(i => ({ recipeId: recipe.id, itemId: i.itemId, defaultAmount: i.defaultAmount }))
  })
}

// updateRecipe — replace items array
await prisma.recipeItem.deleteMany({ where: { recipeId: id } })
if (input.items?.length) {
  await prisma.recipeItem.createMany({ data: input.items.map(...) })
}

// updateRecipeLastCookedAt
const recipe = await prisma.recipe.update({ where: { id }, data: { lastCookedAt: new Date() } })

// deleteRecipe — RecipeItem cascades automatically
await prisma.recipe.delete({ where: { id } })
```

### Task 2.5 — Migrate Cart resolver

**Files to modify:** `apps/server/src/resolvers/cart.resolver.ts`
**Files to delete:** `apps/server/src/models/Cart.model.ts`

```typescript
// activeCart — find or create
let cart = await prisma.cart.findFirst({ where: { userId, status: 'active' } })
if (!cart) cart = await prisma.cart.create({ data: { userId, status: 'active' } })

// cartItems
const items = await prisma.cartItem.findMany({ where: { cartId } })

// addToCart — upsert
const existing = await prisma.cartItem.findFirst({ where: { cartId, itemId } })
if (existing) {
  return prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } })
}
return prisma.cartItem.create({ data: { cartId, itemId, quantity, userId } })

// checkout — pinned items (qty=0) move to new cart; buying items increment packedQuantity + create logs
// (complex logic — preserve existing business logic verbatim, just swap ORM calls)

// abandonCart — CartItems cascade
await prisma.cart.update({ where: { id: cartId }, data: { status: 'abandoned' } })
```

### Task 2.6 — Migrate InventoryLog resolver

**Files to modify:** `apps/server/src/resolvers/inventoryLog.resolver.ts`
**Files to delete:** `apps/server/src/models/InventoryLog.model.ts`

```typescript
// itemLogs
const logs = await prisma.inventoryLog.findMany({
  where: { itemId, userId },
  orderBy: { occurredAt: 'desc' },
})

// lastPurchaseDates — for each itemId find latest log where delta > 0
const results = await Promise.all(
  itemIds.map(async itemId => {
    const log = await prisma.inventoryLog.findFirst({
      where: { itemId, userId, delta: { gt: 0 } },
      orderBy: { occurredAt: 'desc' },
    })
    return { itemId, date: log?.occurredAt?.toISOString() ?? null }
  })
)

// addInventoryLog
const log = await prisma.inventoryLog.create({
  data: { itemId, delta, quantity, occurredAt: new Date(occurredAt), userId, note }
})
```

### Task 2.7 — Migrate FamilyGroup resolver

**Files to modify:** `apps/server/src/resolvers/familyGroup.resolver.ts`
**Files to delete:** `apps/server/src/models/FamilyGroup.model.ts`

```typescript
// myFamilyGroup
const group = await prisma.familyGroup.findFirst({
  where: { memberUserIds: { has: userId } }
})

// createFamilyGroup — generate unique 6-char code
const code = generateUniqueCode()
const group = await prisma.familyGroup.create({
  data: { name, code, ownerUserId: userId, memberUserIds: [userId] }
})

// joinFamilyGroup
const group = await prisma.familyGroup.findUnique({ where: { code } })
await prisma.familyGroup.update({
  where: { id: group.id },
  data: { memberUserIds: { push: userId } }
})

// leaveFamilyGroup
await prisma.familyGroup.update({
  where: { id: group.id },
  data: { memberUserIds: group.memberUserIds.filter(id => id !== userId) }
})

// disbandFamilyGroup
await prisma.familyGroup.delete({ where: { id: group.id } })
```

### Task 2.8 — Migrate import resolver (bulk operations)

**Files to modify:** `apps/server/src/resolvers/import.resolver.ts`

```typescript
// bulkCreateX — skip duplicates
await prisma.item.createMany({ data: items, skipDuplicates: true })

// bulkUpsertX — upsert by id
for (const item of items) {
  await prisma.item.upsert({
    where: { id: item.id },
    update: { ...item },
    create: { ...item, userId },
  })
}

// clearAllData — delete in dependency order
await prisma.$transaction([
  prisma.inventoryLog.deleteMany({ where: { userId } }),
  prisma.cartItem.deleteMany({ where: { userId } }),
  prisma.cart.deleteMany({ where: { userId } }),
  prisma.recipeItem.deleteMany({ where: { recipe: { userId } } }),
  prisma.recipe.deleteMany({ where: { userId } }),
  prisma.itemTag.deleteMany({ where: { item: { userId } } }),
  prisma.itemVendor.deleteMany({ where: { item: { userId } } }),
  prisma.item.deleteMany({ where: { userId } }),
  prisma.tag.deleteMany({ where: { userId } }),
  prisma.tagType.deleteMany({ where: { userId } }),
  prisma.vendor.deleteMany({ where: { userId } }),
])
```

### Task 2.9 — Migrate purge resolver

**Files to modify:** `apps/server/src/resolvers/purge.resolver.ts`

```typescript
const [items, tags, tagTypes, vendors, recipes, carts, cartItems, inventoryLogs] =
  await prisma.$transaction([
    prisma.item.deleteMany({ where: { userId } }),
    prisma.tag.deleteMany({ where: { userId } }),
    prisma.tagType.deleteMany({ where: { userId } }),
    prisma.vendor.deleteMany({ where: { userId } }),
    prisma.recipe.deleteMany({ where: { userId } }),
    prisma.cart.deleteMany({ where: { userId } }),
    prisma.cartItem.deleteMany({ where: { userId } }),
    prisma.inventoryLog.deleteMany({ where: { userId } }),
  ])

return {
  items: items.count,
  tags: tags.count,
  // ...
}
```

### Task 2.10 — Update E2E cleanup endpoint

**File to modify:** `apps/server/src/index.ts` (E2E cleanup route)

Replace Mongoose `deleteMany` calls with Prisma equivalents:
```typescript
await prisma.$transaction([
  prisma.inventoryLog.deleteMany({ where: { userId: e2eUserId } }),
  // ... all entities
])
```

**Verification gate (Phase 2):**
```bash
(cd apps/server && pnpm build) 2>&1 | tee /tmp/p1i-server-build.log
grep 'error TS' /tmp/p1i-server-build.log && echo "FAIL" || echo "OK"
```

---

## Phase 3 — Frontend Deployment Config

### Task 3.1 — Add `_redirects` for Cloudflare Pages SPA routing

**File to create:** `apps/web/public/_redirects`

```
/* /index.html 200
```

### Task 3.2 — Verify frontend env var references

**Files to check:** `apps/web/src/` for any `VITE_GRAPHQL_URL` or `VITE_CLERK_PUBLISHABLE_KEY` usage.

Confirm existing references match. Add `.env.example` for the web app if it doesn't exist:

**File:** `apps/web/.env.example`
```env
VITE_GRAPHQL_URL=http://localhost:4000/graphql
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### Task 3.3 — Verify production build

```bash
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-web-build.log
grep 'error' /tmp/p1i-web-build.log && echo "FAIL" || echo "OK"
```

---

## Phase 4 — Deployment Wiring (Manual Steps)

> These steps require browser access and cannot be automated by the agent. Follow in order.

### Step 4.1 — Neon database

1. Sign up at [neon.tech](https://neon.tech)
2. Create project: `player1inventory`, region: `Asia Pacific (Singapore)` or closest to Railway region
3. Copy the connection string (pooled) → save as `DATABASE_URL`
4. Run migration from local: `DATABASE_URL="<neon-url>" pnpm prisma migrate deploy`

### Step 4.2 — Railway backend

1. Sign up at [railway.app](https://railway.app)
2. New project → Deploy from GitHub repo
3. Root directory: `apps/server`
4. Build command: `pnpm install && pnpm build`
5. Start command: `node dist/index.js`
6. Add env vars:
   - `DATABASE_URL` (Neon connection string)
   - `CLERK_SECRET_KEY`
   - `CLIENT_ORIGIN` (Cloudflare Pages URL, set after Step 4.3)
   - `PORT=4000`
7. Note the Railway service URL (e.g. `https://player1inventory-production.up.railway.app`)

### Step 4.3 — Cloudflare Pages frontend

1. Sign in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Pages → Create a project → Connect to Git
3. Select repo: `ETBlue/player1inventory`
4. Build settings:
   - Root directory: `apps/web`
   - Build command: `pnpm install && pnpm build`
   - Output directory: `dist`
5. Environment variables:
   - `VITE_GRAPHQL_URL` = Railway service URL + `/graphql`
   - `VITE_CLERK_PUBLISHABLE_KEY` = Clerk publishable key
6. Deploy → note the Pages URL (e.g. `player1inventory.pages.dev`)
7. Go back to Railway → update `CLIENT_ORIGIN` with the Pages URL

### Step 4.4 — Clerk production instance

1. Sign in to [clerk.com](https://clerk.com)
2. Create a production instance
3. Add allowed origins: Cloudflare Pages URL
4. Copy publishable key → Cloudflare Pages env var
5. Copy secret key → Railway env var

---

## Phase 5 — Testing

### Task 5.1 — Run unit tests

```bash
(cd apps/server && pnpm test)
(cd apps/web && pnpm test)
```

Update any broken tests that reference Mongoose models — replace with Prisma client calls or mocks.

### Task 5.2 — Run E2E tests locally against production build

```bash
pnpm test:e2e --grep "items|tags|vendors|recipes|shopping|cooking|settings|a11y"
```

Fix any failures before pushing.

### Task 5.3 — Smoke test production deployment

After Phase 4, manually verify:
- [ ] App loads at Cloudflare Pages URL
- [ ] Local mode: create an item, reload, item persists
- [ ] Cloud mode: sign in with Clerk, create an item, reload, item persists
- [ ] Family sharing: invite a second user, verify shared data visibility
- [ ] Checkout flow: add items to cart, checkout, verify inventory logs created
- [ ] Import/export: export data, clear, re-import, verify data restored

---

## Commit Plan

```
Phase 1: chore(server): replace mongoose with prisma — schema + client setup
Phase 2 (per entity): refactor(server): migrate <entity> resolver to prisma
Phase 3: chore(web): add cloudflare pages _redirects + env example
```

One commit per phase group. Tests travel with their entity commit.
