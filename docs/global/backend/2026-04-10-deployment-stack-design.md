# Deployment Stack Design

**Date:** 2026-04-10
**Branch:** feature/deployment-stack
**Brainstorming log:** `2026-04-10-brainstorming-deployment-stack.md`

---

## Goal

Deploy Player 1 Inventory to production for personal daily use and family sharing. Replace MongoDB + Mongoose/Typegoose with PostgreSQL + Prisma, and wire up deployment across Cloudflare Pages + Railway + Neon.

---

## Stack

| Layer | Service | Notes |
|---|---|---|
| Frontend | Cloudflare Pages | Static SPA; needs `_redirects` for SPA routing |
| Backend | Railway | Node.js + Express + Apollo Server; ~$5/month |
| Database | Neon (PostgreSQL) | Always-on free tier; replaces MongoDB Atlas |
| Auth | Clerk | Unchanged |
| ORM | Prisma | Replaces Mongoose + Typegoose |

---

## PostgreSQL Schema (Prisma)

### Design Decisions

| MongoDB pattern | PostgreSQL equivalent |
|---|---|
| Document with embedded array (`Recipe.items`) | Junction table (`RecipeItem`) |
| Array field (`Item.tagIds`, `Item.vendorIds`) | Junction tables (`ItemTag`, `ItemVendor`) |
| String `_id` (ObjectId) | `String @id` (kept as string for import compatibility) |
| Self-referential `Tag.parentId` | Nullable FK `parentId String?` → `Tag.id` |
| `familyId` on all entities | Kept as nullable `String?` |
| `userId` on all entities | Kept as required `String` |
| Enums as string | Prisma `enum` types |

### Enums

```prisma
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
```

### Models

```prisma
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
  id       String  @id @default(cuid())
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
  id                 String         @id @default(cuid())
  name               String
  packageUnit        String?
  measurementUnit    String?
  amountPerPackage   Float?
  targetUnit         TargetUnit
  targetQuantity     Float          @default(0)
  refillThreshold    Float          @default(0)
  packedQuantity     Float          @default(0)
  unpackedQuantity   Float          @default(0)
  consumeAmount      Float          @default(1)
  dueDate            DateTime?
  estimatedDueDays   Int?
  expirationThreshold Int?
  expirationMode     ExpirationMode @default(disabled)
  userId             String
  familyId           String?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

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
  id           String      @id @default(cuid())
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

---

## Resolver Changes

### What stays the same

- Express setup, CORS, Clerk middleware
- Apollo Server initialization and context (`userId`)
- `requireAuth()` pattern
- All GraphQL type definitions (`.graphql` files)
- GraphQL field resolvers (except Date serialization — see below)
- Business logic (cascade deletes, family group code generation, checkout flow)

### What changes

| Area | MongoDB/Mongoose | PostgreSQL/Prisma |
|---|---|---|
| DB client import | `ItemModel.find(...)` | `prisma.item.findMany(...)` |
| Array relationships | `{ tagIds: { $in: [id] } }` | `{ tags: { some: { tagId: id } } }` |
| Embedded arrays | `recipe.items.push(...)` | `prisma.recipeItem.createMany(...)` |
| Cascade deletes | Manual in resolver | `onDelete: Cascade` in schema (auto) |
| Bulk insert | `insertMany({ ordered: false })` | `createMany({ skipDuplicates: true })` |
| Bulk upsert | `bulkWrite([replaceOne upsert])` | `upsert` in loop or raw SQL |
| Date fields | `new Date(val)` → `.toISOString()` | Prisma returns `Date` objects → same |
| ID field | `_id.toString()` field resolver | `id` is already a string |

### Date serialization

MongoDB required custom field resolvers to serialize `Date → String`. With Prisma, dates come back as JavaScript `Date` objects — same behavior. Existing field resolvers on `dueDate`, `occurredAt`, `lastCookedAt` remain unchanged.

### Cascade delete simplification

Several cascades currently implemented manually in resolvers become automatic via Prisma's `onDelete: Cascade`:

| Delete event | Current (manual) | After (automatic) |
|---|---|---|
| Item deleted | Remove from Recipe.items, delete InventoryLogs | `onDelete: Cascade` on RecipeItem, InventoryLog, CartItem |
| Tag deleted | Remove tagId from Item.tagIds | `onDelete: Cascade` on ItemTag |
| TagType deleted | Delete all Tags of type | `onDelete: Restrict` — must delete Tags first (preserves existing logic) |
| Vendor deleted | Remove vendorId from Item.vendorIds | `onDelete: Cascade` on ItemVendor |
| Cart deleted | — | `onDelete: Cascade` on CartItem |

**Note:** TagType → Tag uses `onDelete: Restrict` intentionally. The resolver explicitly deletes tags before deleting the type (preserving the "cascade vs orphan" logic for child tags).

---

## Environment Variables

### Backend (`apps/server/.env`)

```env
# Database
DATABASE_URL="postgresql://user:password@host/player1inventory?sslmode=require"

# Auth
CLERK_SECRET_KEY=sk_live_...

# Server
PORT=4000
CLIENT_ORIGIN=https://player1inventory.pages.dev

# Testing (dev/CI only)
E2E_TEST_MODE=false
```

### Frontend (`apps/web/.env`)

```env
VITE_GRAPHQL_URL=https://your-backend.railway.app/graphql
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
```

---

## Deployment Setup

### 1. Neon (Database)

1. Create a Neon project at neon.tech
2. Select region closest to Railway deployment (e.g. `us-east-1` or `ap-southeast-1`)
3. Copy the connection string → set as `DATABASE_URL` in Railway env vars
4. Run `prisma migrate deploy` on first deploy

### 2. Railway (Backend)

1. Create a new Railway project
2. Connect GitHub repo, set root directory to `apps/server`
3. Build command: `pnpm install && pnpm build && pnpm prisma migrate deploy`
4. Start command: `node dist/index.js`
5. Set environment variables: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLIENT_ORIGIN`, `PORT`
6. Note the Railway service URL → needed for frontend env var

### 3. Cloudflare Pages (Frontend)

1. Connect GitHub repo in Cloudflare Pages dashboard
2. Build settings:
   - Root directory: `apps/web`
   - Build command: `pnpm install && pnpm build`
   - Output directory: `dist`
3. Add `apps/web/public/_redirects`:
   ```
   /* /index.html 200
   ```
4. Set environment variables: `VITE_GRAPHQL_URL`, `VITE_CLERK_PUBLISHABLE_KEY`

### 4. Clerk

1. Create a production instance at clerk.com
2. Add allowed origins: `https://player1inventory.pages.dev` (and custom domain if any)
3. Copy publishable key → frontend env; secret key → backend env

---

## Implementation Plan

### Phase 1 — Prisma setup

- Add Prisma to `apps/server`
- Write `schema.prisma` with all models above
- Replace `db.ts` (Mongoose connect) with Prisma client singleton
- Replace `MONGODB_URI` with `DATABASE_URL` in env

### Phase 2 — Resolver migration (entity by entity)

Migrate one entity at a time, keeping the GraphQL surface identical:

1. Tag + TagType (simpler, no junction tables)
2. Vendor (simplest)
3. Item + ItemTag + ItemVendor (junction tables)
4. Recipe + RecipeItem (junction table, replaces embedded array)
5. Cart + CartItem
6. InventoryLog
7. FamilyGroup
8. Import resolvers (bulk operations)
9. Purge resolver

### Phase 3 — Deployment wiring

- Set up Neon database
- Set up Railway backend service
- Set up Cloudflare Pages frontend
- Wire all environment variables
- Run `prisma migrate deploy` on Railway

### Phase 4 — Testing

- Run E2E tests against production build
- Smoke test all entity CRUD flows
- Test family group join/leave
- Test checkout flow (inventory log creation)
- Test bulk import/export

---

## Testing Strategy

- Replace `mongodb-memory-server` with `@prisma/client` + a test PostgreSQL database (or Neon branch)
- Existing Vitest tests rewritten to use Prisma client
- E2E tests unchanged (they test via UI/API, not ORM)

---

## Risk Notes

- **FamilyGroup.memberUserIds**: Currently a `String[]` (MongoDB array). In PostgreSQL this becomes a native `String[]` array column (Prisma supports this). No junction table needed since it's user IDs managed by application code.
- **Import IDs**: Bulk import preserves original string IDs. Prisma's `@id @default(cuid())` is fine — `upsert` by `id` works the same.
- **graphql-ws**: Subscriptions are defined in the current server setup but no subscriptions exist in the GraphQL schema. The `graphql-ws` dependency can be retained or removed — no behavior change either way.
