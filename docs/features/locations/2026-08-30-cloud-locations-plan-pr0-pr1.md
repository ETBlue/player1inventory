# Cloud Locations — PR 0 + PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the cloud backend `Location` and `ItemStock` tables, resolvers and an additive data migration, without changing the web app or removing anything the current app depends on.

**Architecture:** Purely additive on the server. New Prisma models `Location` and `ItemStock`; a hand-written migration that creates them and backfills one default `Location` per user plus one `ItemStock` per `Item`. `Item` **keeps** its five state columns and keeps serving them, so the deployed web app is unaffected — PR 2 switches the client over and PR 5 drops the columns. All new resolvers route authorization through one RBAC-shaped helper.

**Tech Stack:** Prisma 6 + PostgreSQL (Neon), Apollo Server 4, GraphQL, TypeScript (ESM, `.js` import specifiers), Vitest, Playwright.

**Spec:** `docs/features/locations/2026-08-30-cloud-locations-design.md`

## Global Constraints

- **Never write `row.userId === ctx.userId` as an authorization check at a call site.** Route every guard through `requireLocationRole(ctx, locationId, role)`. Root `CLAUDE.md` → *Authorization (cloud)*.
- **`ItemStock` has no `userId` column.** Scope it through its location: `where: { location: { userId } }`. Design §1.
- **`Item` keeps its five state columns in this PR.** Dropping them is PR 5. Any task that removes `targetQuantity`, `refillThreshold`, `packedQuantity`, `unpackedQuantity` or `dueDate` from `Item` is out of scope.
- **Do not touch `apps/web/` in PR 1.** The web switch-over is PR 2.
- **Server imports use `.js` specifiers** even for `.ts` files (ESM). Follow `apps/server/src/resolvers/index.ts`.
- **A migration must be valid on a database built only from committed history.** `apps/server/prisma/CLAUDE.md`.
- **Every location test needs at least two locations**, with a fixture stocked only at the *other* one. With one location, "count items stocked here" and "count all items" agree and the test proves nothing. Root `CLAUDE.md` → *Proving a Test Works*.
- **Test fakes must model the constraint, not the happy path.** A `findFirst` fake must filter only on keys actually present in `where` (`where.userId === undefined || row.userId === where.userId`), and a unique index must actually throw. Follow the fake in `apps/server/src/resolvers/shelf.resolver.test.ts`.
- **Report mutation checks.** For each new behavior: invert it in source, confirm the test goes RED, restore. State which mutations ran.
- **Verification gate after every task** (root `CLAUDE.md` → *Verification Gate*), each command with an explicit path:
  ```bash
  (cd apps/web && pnpm lint)
  pnpm build 2>&1 | tee /tmp/p1i-build.log
  (cd apps/web && pnpm build-storybook)
  (cd apps/web && pnpm check)
  grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK"
  pnpm test
  ```

---

## File Structure

| File | Responsibility |
|---|---|
| `e2e/tests/shopping.spec.ts` | **Modify** — replace two dead `TEST_CLOUD_MODE` guards (PR 0) |
| `apps/server/.env.example` | **Create** — document `TEST_DATABASE_URL` / `TEST_DIRECT_URL` |
| `e2e/playwright.config.ts` | **Modify** — point the cloud backend at the test database |
| `apps/server/prisma/schema.prisma` | **Modify** — add `Location`, `ItemStock`, and `Item.itemStocks` |
| `apps/server/prisma/migrations/20260830000000_add_location_and_item_stock/migration.sql` | **Create** — tables + backfill |
| `apps/server/src/lib/authz.ts` | **Create** — `requireLocationRole`, the single authorization seam |
| `apps/server/src/lib/authz.test.ts` | **Create** — its tests |
| `apps/server/src/schema/location.graphql` | **Create** — `Location` type, queries, mutations |
| `apps/server/src/schema/itemStock.graphql` | **Create** — `ItemStock` type, queries, mutations |
| `apps/server/src/schema/index.ts` | **Modify** — load the two new schema files |
| `apps/server/src/resolvers/location.resolver.ts` | **Create** — location CRUD + `ensureDefaultLocation` |
| `apps/server/src/resolvers/location.resolver.test.ts` | **Create** — its tests |
| `apps/server/src/resolvers/itemStock.resolver.ts` | **Create** — stock reads/writes + add/remove from location |
| `apps/server/src/resolvers/itemStock.resolver.test.ts` | **Create** — its tests |
| `apps/server/src/resolvers/index.ts` | **Modify** — wire both resolver modules |
| `apps/server/src/resolvers/purge.resolver.ts` | **Modify** — delete `ItemStock` and `Location` |
| `apps/server/scripts/verify-migration.ts` | **Create** — real-Postgres migration verification |

**Deviation from the design's PR table, deliberate:** the design assigns purge to PR 4. That is wrong for PR 1 — the moment these tables exist, `purgeUserData` silently leaves orphan `Location` and `ItemStock` rows behind. Purge is therefore included here (Task 10) as a correctness requirement of creating the tables, not as §6 feature work.

---

## Task 1: PR 0 — un-skip the cloud vendor-cart tests

Two tests are gated on `TEST_CLOUD_MODE`, which is set nowhere, so they have never run. Meanwhile the four ordinary vendor-cart tests skip under the cloud project because they seed IndexedDB. Net effect today: **cloud has zero E2E coverage of vendor cart cards and checkout** — the surface PR 3 will rewrite. This task lands the fix on its own so those tests are proven green against *current* code, giving PR 3 a known-good baseline.

**Files:**
- Modify: `e2e/tests/shopping.spec.ts:445`, `e2e/tests/shopping.spec.ts:473`

**Interfaces:**
- Consumes: `CLOUD_WEB_URL` from `e2e/constants`, already imported at `e2e/tests/shopping.spec.ts:2`.
- Produces: nothing consumed by later tasks. This is a standalone PR.

- [ ] **Step 1: Confirm both tests currently skip**

```bash
pnpm test:e2e --grep "cloud mode vendor carts" 2>&1 | tail -20
```

Expected: 2 skipped, 0 passed. If they run, stop — the premise of this task is wrong and #260 is already fixed.

- [ ] **Step 2: Replace the first guard**

In `e2e/tests/shopping.spec.ts`, inside `test.describe('cloud mode vendor carts')`, replace line 445:

```ts
    test.skip(!process.env.TEST_CLOUD_MODE, 'cloud mode only')
```

with:

```ts
    test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
```

This is the exact inverse of the convention already used four times in this file (`:191`, `:255`, `:315`, `:373`). `baseURL` is already destructured in the test signature.

- [ ] **Step 3: Replace the second guard**

Apply the identical change at line 473 (`user can checkout from vendor cart in cloud mode`).

- [ ] **Step 4: Verify the ports are free before running E2E**

Per `e2e/CLAUDE.md`, only one E2E suite may run per machine, and a collision presents as a mass code regression rather than a port error.

```bash
lsof -nP -iTCP:5175 -sTCP:LISTEN
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:4001 -sTCP:LISTEN
```

Expected: no output from all three, sustained for ~90s. If any is occupied, identify the owner with `ps -o command -p <pid>` and wait — **never kill another session's server**.

- [ ] **Step 5: Run the two tests and confirm they now pass**

```bash
pnpm test:e2e --grep "cloud mode vendor carts"
```

Expected: 2 passed in the `cloud` project, 2 skipped in the `local` project.

If they **fail**, that is the valuable outcome of this task: it means cloud vendor carts were already broken and nobody knew. Stop and report the failure rather than fixing it inside this task — a pre-existing cloud cart bug is its own bug-fix branch under the root `CLAUDE.md` *Bug Fixes* SOP.

- [ ] **Step 6: Run the full shopping suite to confirm nothing else moved**

```bash
pnpm test:e2e --grep "shopping|a11y"
```

Expected: all pass; the four IndexedDB-seeding vendor-cart tests still skip in the cloud project.

- [ ] **Step 7: Commit**

```bash
git add e2e/tests/shopping.spec.ts
git commit -m "test(e2e): run the cloud vendor-cart tests that TEST_CLOUD_MODE disabled

Both tests were gated on an environment variable set nowhere in the repo,
so they had never executed. The four ordinary vendor-cart tests skip under
the cloud project because they seed IndexedDB, so cloud had no E2E coverage
of vendor cart cards or checkout at all.

Switches to the baseURL guard this file already uses four times, proving the
tests green against current behaviour before the cloud cart re-key changes it.

Closes #260"
```

- [ ] **Step 8: Open PR 0 and merge before starting Task 2**

```bash
gh pr create --title "test(e2e): run the cloud vendor-cart tests that TEST_CLOUD_MODE disabled" --body "$(cat <<'EOF'
## Summary
- Replaces two `TEST_CLOUD_MODE` guards with the `baseURL !== CLOUD_WEB_URL` convention used four times elsewhere in the file
- Cloud previously had **zero** E2E coverage of vendor cart cards and checkout: the four seeded tests skip in the cloud project, and the two cloud replacements were gated on a variable set nowhere
- Lands standalone so these tests are proven green against current code, giving the upcoming cart re-key (cloud locations PR 3) a known-good baseline

Closes #260

## Test Plan
- [ ] `pnpm test:e2e --grep "cloud mode vendor carts"` → 2 passed (cloud), 2 skipped (local)
- [ ] `pnpm test:e2e --grep "shopping|a11y"` → all pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01AeauZMSZJnR5TQWiS7PKj3
EOF
)"
```

---

## Task 2: A test database separate from dev

Cloud E2E runs against whatever `DATABASE_URL` is in `apps/server/.env` — normally the **dev** database — with isolation by row ownership under one `E2E_USER_ID` (`e2e/CLAUDE.md`). Two things in this project break that: the migration needs a throwaway Postgres, and PR 3's `'no-vendor'` split test is inherently multi-user while `/e2e/cleanup` only deletes one user's rows.

**⚠️ This task needs a human action.** The agent cannot create a Neon branch. Stop and ask the user to perform Step 1, then continue.

**Files:**
- Create: `apps/server/.env.example`
- Modify: `apps/server/src/lib/prisma.ts` (route `E2E_TEST_MODE` at the test database)
- Modify: `e2e/CLAUDE.md` (replace the "Documented, not fixed" note)
- **Not** `e2e/playwright.config.ts` — see Step 3 for why the switch cannot live there

**Interfaces:**
- Produces: environment variables `TEST_DATABASE_URL` and `TEST_DIRECT_URL` in `apps/server/.env`, consumed by Task 5's verification script and by the cloud Playwright backend.

- [ ] **Step 1: Ask the user to create a Neon branch and add two env vars**

Present exactly this to the user and wait:

> I need a throwaway Postgres separate from your dev database. In the Neon console, create a branch of the project (name it `e2e-test`), then add its connection strings to `apps/server/.env`:
>
> ```
> TEST_DATABASE_URL="postgresql://...pooler...neon.tech/neondb?sslmode=require"
> TEST_DIRECT_URL="postgresql://...neon.tech/neondb?sslmode=require"
> ```
>
> `TEST_DIRECT_URL` must be the **non-pooled** endpoint — Prisma migrations need a direct connection.

- [ ] **Step 2: Create `apps/server/.env.example`**

```bash
# Primary database (dev). Prisma reads these.
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
DIRECT_URL="postgresql://user:pass@host/db?sslmode=require"

# Throwaway database used by E2E and by scripts/verify-migration.ts.
# MUST NOT point at the dev database: the migration verification drops and
# recreates the public schema, and multi-user E2E fixtures write rows that
# /e2e/cleanup (scoped to one E2E_USER_ID) will not remove.
TEST_DATABASE_URL="postgresql://user:pass@host/db-e2e?sslmode=require"
TEST_DIRECT_URL="postgresql://user:pass@host/db-e2e?sslmode=require"
```

- [ ] **Step 3: Route the E2E backend at the test database — inside the server, not in Playwright**

`e2e/playwright.config.ts` is **not** the place for this. A `DATABASE_URL=$TEST_DATABASE_URL` entry in the `webServer` command would expand in *Playwright's* shell, where `apps/server/.env` has never been loaded — `dotenv/config` runs inside the server process (`apps/server/src/index.ts:1`). It would expand to the empty string with no error naming the cause.

Put the switch in the server instead. Replace the whole of `apps/server/src/lib/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// E2E runs against a throwaway database, never dev.
//
// Isolation by row ownership under a single E2E_USER_ID is not sufficient for
// the multi-user fixtures cloud locations needs: /e2e/cleanup deletes only that
// one user's rows, so a second synthetic user would persist in dev forever.
//
// This switch lives here rather than in e2e/playwright.config.ts because
// TEST_DATABASE_URL comes from apps/server/.env, which dotenv loads inside THIS
// process — Playwright's shell has never seen it and would expand it to "".
function datasourceUrl(): string | undefined {
  if (process.env.E2E_TEST_MODE !== 'true') return undefined
  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) {
    throw new Error(
      'E2E_TEST_MODE=true but TEST_DATABASE_URL is unset. Refusing to run E2E ' +
        'against the dev database — see apps/server/.env.example.',
    )
  }
  return testUrl
}

function createClient(): PrismaClient {
  const url = datasourceUrl()
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient()
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

Throwing when `E2E_TEST_MODE=true` and `TEST_DATABASE_URL` is missing is deliberate: a silent fallback to dev is exactly the failure this task exists to prevent, and it would be invisible until a stray fixture row turned up in production-shaped data.

Leave `e2e/playwright.config.ts` unchanged — it already sets `E2E_TEST_MODE=true`.

- [ ] **Step 4: Apply the existing migrations to the test database**

```bash
cd apps/server && DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DIRECT_URL" pnpm exec prisma migrate deploy
```

Expected: all seven existing migrations apply cleanly.

- [ ] **Step 5: Confirm E2E still passes against the new database**

```bash
pnpm test:e2e --grep "cloud mode vendor carts|item-management"
```

Expected: pass. The test database starts empty, and every cloud spec seeds its own data.

- [ ] **Step 6: Replace the stale note in `e2e/CLAUDE.md`**

Replace the final paragraph of the "Cloud E2E is not database-isolated" section:

```markdown
**Documented, not fixed.** Real isolation means pointing the cloud `webServer` at a
dedicated Neon branch with its own `DATABASE_URL`/`DIRECT_URL` — infra work, not a config
edit.
```

with:

```markdown
**Fixed (2026-08-30, cloud locations PR 1).** The cloud `webServer` now runs with
`DATABASE_URL=$TEST_DATABASE_URL` / `DIRECT_URL=$TEST_DIRECT_URL` (see
`apps/server/.env.example`), a dedicated Neon branch. Row-ownership scoping under
`E2E_USER_ID` still applies and `/e2e/cleanup` is unchanged — but a spec that needs a
second synthetic user no longer leaves rows in the dev database. If `TEST_DATABASE_URL`
is unset the backend falls back to `DATABASE_URL`, so **check it is set** before trusting
that a multi-user spec cleaned up after itself.
```

- [ ] **Step 7: Commit**

```bash
git add apps/server/.env.example apps/server/src/lib/prisma.ts e2e/CLAUDE.md
git commit -m "test(e2e): run cloud specs against a dedicated test database

Cloud E2E ran against the dev database with isolation only by row ownership
under a single E2E_USER_ID. That does not survive the multi-user fixtures
cloud locations needs: /e2e/cleanup deletes one user's rows, so a second
synthetic user would persist in dev indefinitely.

The switch lives in prisma.ts rather than playwright.config.ts because
TEST_DATABASE_URL comes from apps/server/.env, which dotenv loads inside the
server process — Playwright's shell has never seen it and would have expanded
it to the empty string with no error naming the cause.

Refuses to start when E2E_TEST_MODE is set without TEST_DATABASE_URL: a
silent fallback to dev is the exact failure this prevents."
```

---

## Task 3: Prisma models for `Location` and `ItemStock`

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma client models `prisma.location` and `prisma.itemStock`, and the relation `Item.itemStocks`. Every later task consumes these.

- [ ] **Step 1: Add both models and the `Item` relation**

Append to `apps/server/prisma/schema.prisma`:

```prisma
model Location {
  id        String   @id @default(cuid())
  name      String
  order     Int
  // Exactly one per user. NOT derivable from `order`: dnd-kit's `disabled`
  // stops the default row being dragged but not from being displaced by
  // another row dropped above it, so lowest-order is not stable.
  // A partial unique index enforces the invariant — see the migration.
  isDefault Boolean  @default(false)
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  itemStocks ItemStock[]

  @@index([userId, order])
}

// Per-(item × location) stock STATE. Configuration (units, packaging,
// expiration mode, consume amount) lives on Item and does not vary by location.
//
// Deliberately has NO userId: an ItemStock is scoped through its location
// (`where: { location: { userId } }`), the shape location RBAC needs. A userId
// column would put `stock.userId === ctx.userId` within reach at every call
// site — the guard the RBAC design forbids.
model ItemStock {
  id               String    @id @default(cuid())
  itemId           String
  locationId       String
  targetQuantity   Float     @default(0)
  refillThreshold  Float     @default(0)
  packedQuantity   Float     @default(0)
  unpackedQuantity Float     @default(0)
  dueDate          DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  item     Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@unique([itemId, locationId])
  @@index([locationId])
}
```

- [ ] **Step 2: Add the back-relation on `Item`**

In the existing `model Item`, add one line to the relation block (after `cartItems CartItem[]`):

```prisma
  itemStocks    ItemStock[]
```

**Do not remove any `Item` column.** `targetQuantity`, `refillThreshold`, `packedQuantity`, `unpackedQuantity` and `dueDate` stay until PR 5.

- [ ] **Step 3: Verify the schema is valid and the client generates**

```bash
cd apps/server && pnpm exec prisma validate && pnpm exec prisma generate
```

Expected: `The schema at prisma/schema.prisma is valid` then `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat(server): add Location and ItemStock Prisma models

ItemStock deliberately carries no userId — it is scoped through its location,
which keeps the RBAC-forbidden ownership guard out of reach at call sites.

Item keeps its five state columns: they are dropped in PR 5, after the web
client stops reading them in PR 2."
```

---

## Task 4: The additive migration

**Files:**
- Create: `apps/server/prisma/migrations/20260830000000_add_location_and_item_stock/migration.sql`

**Interfaces:**
- Consumes: the models from Task 3.
- Produces: a migration that Task 5 verifies against a real database.

- [ ] **Step 1: Create the migration directory with `--create-only`**

```bash
cd apps/server && DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DIRECT_URL" pnpm exec prisma migrate dev --create-only --name add_location_and_item_stock
```

This generates the DDL but does not apply it. Rename the generated directory to `20260830000000_add_location_and_item_stock` if the timestamp differs, so it matches this plan.

- [ ] **Step 2: Append the partial unique index and both backfills**

Prisma generates only the `CREATE TABLE` / index / FK statements. Append the rest by hand:

```sql
-- Exactly one default Location per user, enforced by the database rather than
-- by application code. Prisma has no syntax for a partial index, so this is
-- hand-written; it is what makes the lazy ensureDefaultLocation race-safe
-- (a concurrent second insert gets P2002 instead of a duplicate default).
CREATE UNIQUE INDEX "Location_userId_isDefault_key"
  ON "Location" ("userId") WHERE "isDefault";

-- Backfill 1: one default Location per user.
-- Unioned across ALL nine user-scoped tables, not just Item — a user with only
-- tags and no items still needs a location. UNION (not UNION ALL) dedupes.
INSERT INTO "Location" ("id", "name", "order", "isDefault", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'My Home', 0, true, u."userId", NOW(), NOW()
FROM (
      SELECT "userId" FROM "Item"
      UNION SELECT "userId" FROM "TagType"
      UNION SELECT "userId" FROM "Tag"
      UNION SELECT "userId" FROM "Vendor"
      UNION SELECT "userId" FROM "Recipe"
      UNION SELECT "userId" FROM "Cart"
      UNION SELECT "userId" FROM "CartItem"
      UNION SELECT "userId" FROM "InventoryLog"
      UNION SELECT "userId" FROM "Shelf"
) u;

-- Backfill 2: one ItemStock per Item, under its owner's default location,
-- carrying the five state fields across. Item keeps its columns (dropped in
-- PR 5), so this duplicates rather than moves — deliberately, so a browser
-- running an older bundle keeps working.
INSERT INTO "ItemStock" ("id", "itemId", "locationId", "targetQuantity", "refillThreshold", "packedQuantity", "unpackedQuantity", "dueDate", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       i."id",
       l."id",
       i."targetQuantity",
       i."refillThreshold",
       i."packedQuantity",
       i."unpackedQuantity",
       i."dueDate",
       i."createdAt",
       i."updatedAt"
FROM "Item" i
JOIN "Location" l ON l."userId" = i."userId" AND l."isDefault";
```

`gen_random_uuid()` is built into PostgreSQL 13+ (Neon runs 16+); no `pgcrypto` extension is needed.

- [ ] **Step 3: Confirm the migration is not applied to dev yet**

```bash
cd apps/server && pnpm exec prisma migrate status
```

Expected: reports the new migration as pending. **Do not run `migrate deploy` against the dev database in this task** — Task 5 verifies it against the test database first.

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/migrations
git commit -m "feat(server): migrate Location and ItemStock with backfills

Creates both tables, a partial unique index enforcing one default Location
per user, and two backfills: a default location per user (unioned across all
nine user-scoped tables, so a user with only tags still gets one) and one
ItemStock per Item under its owner's default.

Additive by design — Item keeps its state columns so a stale browser bundle
keeps working until PR 5."
```

---

## Task 5: Verify the migration against a real Postgres

Every server test runs against a hand-written Prisma fake; **nothing executes against SQL** (root `CLAUDE.md`). A fake cannot exercise a migration at all, so without this task the migration ships unverified.

**Files:**
- Create: `apps/server/scripts/verify-migration.ts`
- Modify: `apps/server/package.json` (add the `verify:migration` script)

**Interfaces:**
- Consumes: `TEST_DATABASE_URL` / `TEST_DIRECT_URL` from Task 2; the migration from Task 4.
- Produces: `pnpm --filter server verify:migration`, run again in Task 11.

**Known about the test branch, from Task 2.** The Neon `e2e` branch was created as a *schema-only* branch of dev, so it arrived carrying dev's DDL but no `_prisma_migrations` rows. A bare `prisma migrate deploy` therefore failed with **P3018** ("type already exists"), and Task 2 baselined the 8 existing migrations with `prisma migrate resolve --applied`. `prisma migrate status` now reports all 8 applied.

This does **not** affect the script below: it opens with `migrate reset`, which drops the schema and reapplies every migration from scratch, rebuilding `_prisma_migrations` properly — so the baselined state is irrelevant to it. Noted because the symptom is confusing if you meet it cold. If `migrate reset` itself ever fails on Neon, drop and recreate the public schema explicitly rather than reaching for `migrate resolve`, which would mark the migration applied *without running it* — silently defeating the entire purpose of this task.

- [ ] **Step 1: Write the verification script**

Create `apps/server/scripts/verify-migration.ts`:

```ts
// Verifies the Location/ItemStock migration against a REAL Postgres, because
// the resolver test suite runs entirely against a hand-written Prisma fake and
// cannot exercise SQL at all.
//
// Destructive: drops and recreates the public schema of TEST_DATABASE_URL.
// Refuses to run against DATABASE_URL.
import { execSync } from 'node:child_process'
import { renameSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const TEST_URL = process.env.TEST_DATABASE_URL
const TEST_DIRECT = process.env.TEST_DIRECT_URL

if (!TEST_URL || !TEST_DIRECT) {
  throw new Error('TEST_DATABASE_URL and TEST_DIRECT_URL must be set (see .env.example)')
}
if (TEST_URL === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL — this script drops the schema')
}

const env = { ...process.env, DATABASE_URL: TEST_URL, DIRECT_URL: TEST_DIRECT }
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } })

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  ok — ${message}`)
}

// A fixture shaped like production BEFORE the migration: Item still carries its
// five state fields inline, and there is no Location table yet.
//
// Deliberately THREE users. With one, "stocked under its owner's location" and
// "stocked under any location" are the same assertion, and a migration that
// ignored userId entirely would pass. user-c owns no Item at all — only a
// TagType — which is what proves the nine-table union rather than a bare
// SELECT DISTINCT over Item.
async function seedFixture(): Promise<void> {
  console.log('Seeding three-user pre-migration fixture...')
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Item" ("id","name","targetUnit","targetQuantity","refillThreshold","packedQuantity","unpackedQuantity","consumeAmount","expirationMode","userId","createdAt","updatedAt")
    VALUES
      ('item-a1','Milk','package',3,1,2,0,1,'disabled','user-a',NOW(),NOW()),
      ('item-a2','Eggs','package',6,2,4,0,1,'disabled','user-a',NOW(),NOW()),
      ('item-b1','Rice','package',1,1,1,0,1,'disabled','user-b',NOW(),NOW())
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "TagType" ("id","name","color","userId") VALUES ('tt-c','Storage','blue','user-c')
  `)
}

const SERVER_DIR = new URL('..', import.meta.url).pathname
const MIGRATION = '20260830000000_add_location_and_item_stock'
const MIGRATION_DIR = join(SERVER_DIR, 'prisma/migrations', MIGRATION)
const PARKED_DIR = join(SERVER_DIR, '.migration-under-test')

async function main(): Promise<void> {
  // `prisma migrate reset` applies EVERY committed migration — including the one
  // under test. Seeding after that would run the backfill against an empty
  // database and make `migrate deploy` a no-op, so the assertions below would
  // verify nothing. Park the migration, reset to the state before it, seed a
  // production-shaped fixture, then restore and apply it.
  //
  // This is also the property apps/server/prisma/CLAUDE.md demands — "a
  // migration must be valid on a DB built only from committed history" — so the
  // harness now tests that directly rather than assuming it.
  console.log(`Parking ${MIGRATION}...`)
  renameSync(MIGRATION_DIR, PARKED_DIR)

  try {
    console.log('Resetting test database to pre-migration history...')
    execSync('pnpm exec prisma migrate reset --force --skip-seed --skip-generate', {
      cwd: SERVER_DIR,
      env,
      stdio: 'inherit',
    })
    await seedFixture()
  } finally {
    console.log(`Restoring ${MIGRATION}...`)
    renameSync(PARKED_DIR, MIGRATION_DIR)
  }

  console.log('Applying the migration under test...')
  execSync('pnpm exec prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'inherit' })

  console.log('Asserting...')

  const locations = await prisma.location.findMany({ orderBy: { userId: 'asc' } })
  assert(locations.length === 3, 'one Location per user across all three users')
  assert(
    locations.every((l) => l.isDefault && l.order === 0 && l.name === 'My Home'),
    'every seeded Location is the default, order 0, named My Home',
  )
  assert(
    new Set(locations.map((l) => l.userId)).size === 3,
    'locations belong to three distinct users',
  )
  assert(
    locations.some((l) => l.userId === 'user-c'),
    'user-c got a location despite owning no items (union across nine tables)',
  )

  const stocks = await prisma.itemStock.findMany({ include: { location: true } })
  assert(stocks.length === 3, 'one ItemStock per Item')
  assert(
    stocks.every((s) => s.location.isDefault),
    'every ItemStock sits under its default location',
  )
  // The scoping assertion that a single-user fixture could not make.
  const rice = stocks.find((s) => s.itemId === 'item-b1')
  assert(rice?.location.userId === 'user-b', "user-b's item is stocked under user-b's location")
  const milk = stocks.find((s) => s.itemId === 'item-a1')
  assert(milk?.location.userId === 'user-a', "user-a's item is stocked under user-a's location")
  assert(milk?.targetQuantity === 3 && milk?.packedQuantity === 2, 'state fields copied verbatim')

  // Item keeps its columns in this PR — a stale browser bundle still reads them.
  const items = await prisma.$queryRawUnsafe<{ targetQuantity: number }[]>(
    `SELECT "targetQuantity" FROM "Item" WHERE "id" = 'item-a1'`,
  )
  assert(items[0]?.targetQuantity === 3, 'Item.targetQuantity survives (dropped in PR 5, not here)')

  // The partial unique index must actually reject a second default.
  let rejected = false
  try {
    await prisma.location.create({
      data: { name: 'Second Default', order: 1, isDefault: true, userId: 'user-a' },
    })
  } catch {
    rejected = true
  }
  assert(rejected, 'a second isDefault location for one user is rejected by the database')

  // A non-default second location is fine.
  await prisma.location.create({
    data: { name: 'Garage', order: 1, isDefault: false, userId: 'user-a' },
  })
  assert(
    (await prisma.location.count({ where: { userId: 'user-a' } })) === 2,
    'a non-default second location is allowed',
  )

  console.log('\nMigration verified.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Add the script to `apps/server/package.json`**

In the `scripts` block, after `"typecheck"`:

```json
    "verify:migration": "tsx scripts/verify-migration.ts",
```

- [ ] **Step 3: Run it**

```bash
cd apps/server && pnpm verify:migration
```

Expected: every `ok —` line prints, ending with `Migration verified.`

- [ ] **Step 4: Mutation check — prove the assertions are load-bearing**

Run each of these, confirm the script FAILS, then restore:

1. In `migration.sql`, change the union to `SELECT "userId" FROM "Item"` only.
   Expected failure: *one Location per user across all three users* (user-c gets none).
2. In `migration.sql`, drop `AND l."isDefault"` from the second backfill's JOIN.
   Expected failure: duplicate `ItemStock` rows once a user has two locations, or a stock under the wrong location.
3. In `migration.sql`, delete the `CREATE UNIQUE INDEX ... WHERE "isDefault"` line.
   Expected failure: *a second isDefault location for one user is rejected by the database*.

Re-run `pnpm verify:migration` after restoring and confirm green. **Report all three results.**

- [ ] **Step 5: Apply the migration to the dev database**

Only now, with the migration verified:

```bash
cd apps/server && pnpm exec prisma migrate deploy
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/scripts/verify-migration.ts apps/server/package.json
git commit -m "test(server): verify the Location/ItemStock migration against real Postgres

The resolver suite runs entirely against a hand-written Prisma fake, which
cannot exercise a migration at all. This script resets the throwaway test
database, seeds a two-user fixture (plus a third user owning only a tag), runs
migrate deploy, and asserts the backfills scoped correctly.

The fixture is deliberately multi-user: with one user, 'stocked under its
owner's location' and 'stocked under any location' are the same assertion."
```

---

## Task 6: `requireLocationRole` — the authorization seam

**Files:**
- Create: `apps/server/src/lib/authz.ts`
- Create: `apps/server/src/lib/authz.test.ts`

**Interfaces:**
- Consumes: `Context` and `requireAuth` from `../context.js`; `prisma` from `./prisma.js`.
- Produces:
  ```ts
  export type LocationRole = 'viewer' | 'member' | 'owner'
  export async function requireLocationRole(
    ctx: Context,
    locationId: string,
    role: LocationRole,
  ): Promise<{ id: string; userId: string; isDefault: boolean }>
  ```
  Tasks 8 and 9 call this at every location-touching resolver.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/lib/authz.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state, client } = vi.hoisted(() => {
  const state = { locations: [] as { id: string; userId: string; isDefault: boolean }[] }
  const client = {
    location: {
      // Filters only on keys actually present in `where`, exactly as real
      // Prisma does. Hardcoding a userId comparison here would leave the
      // "delete userId from the where clause" mutation check meaningless.
      findFirst: async ({ where }: { where: { id?: string; userId?: string } }) =>
        state.locations.find(
          (l) =>
            (where.id === undefined || l.id === where.id) &&
            (where.userId === undefined || l.userId === where.userId),
        ) ?? null,
    },
  }
  return { state, client }
})

vi.mock('./prisma.js', () => ({ prisma: client }))

const { requireLocationRole } = await import('./authz.js')

describe('requireLocationRole', () => {
  beforeEach(() => {
    state.locations = [
      { id: 'loc-a', userId: 'user-a', isDefault: true },
      { id: 'loc-b', userId: 'user-b', isDefault: true },
    ]
  })

  it('user can act in a location they hold a role on', async () => {
    // Given a caller authenticated as user-a and a location owned by user-a
    const ctx = { userId: 'user-a' }

    // When they request the member role on it
    const location = await requireLocationRole(ctx, 'loc-a', 'member')

    // Then the location is returned so the caller need not re-query
    expect(location).toEqual({ id: 'loc-a', userId: 'user-a', isDefault: true })
  })

  it('user cannot act in another user\'s location', async () => {
    // Given a caller authenticated as user-a
    const ctx = { userId: 'user-a' }

    // When they target a location owned by user-b
    // Then the call is refused as FORBIDDEN, not merely "not found"
    await expect(requireLocationRole(ctx, 'loc-b', 'viewer')).rejects.toThrow(/Forbidden/)
  })

  it('user cannot act in a location that does not exist', async () => {
    const ctx = { userId: 'user-a' }
    await expect(requireLocationRole(ctx, 'loc-missing', 'viewer')).rejects.toThrow(/Forbidden/)
  })

  it('an unauthenticated caller is rejected before any lookup', async () => {
    await expect(requireLocationRole({ userId: null }, 'loc-a', 'viewer')).rejects.toThrow(
      /Unauthorized/,
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm test:server 2>&1 | grep -A5 authz
```

Expected: FAIL — `Cannot find module './authz.js'`.

- [ ] **Step 3: Write the implementation**

Create `apps/server/src/lib/authz.ts`:

```ts
import { GraphQLError } from 'graphql'
import { type Context, requireAuth } from '../context.js'
import { prisma } from './prisma.js'

export type LocationRole = 'viewer' | 'member' | 'owner'

/**
 * The single authorization seam for location-scoped data.
 *
 * Call sites ask "does the caller hold a sufficient role on this location?"
 * and never inspect `userId` themselves. That is the whole point: today the
 * body below is user ownership, but under location RBAC (owner/member edit,
 * viewer reads) it becomes a membership lookup — and that is a change to THIS
 * function, not to every resolver that calls it.
 *
 * See docs/global/permissions/2026-08-29-design-location-rbac.md.
 *
 * `role` is accepted and deliberately unused pre-RBAC. Do not remove the
 * parameter to silence the unused warning: its presence at every call site is
 * what makes landing RBAC a one-function change.
 */
export async function requireLocationRole(
  ctx: Context,
  locationId: string,
  role: LocationRole,
): Promise<{ id: string; userId: string; isDefault: boolean }> {
  const userId = requireAuth(ctx)
  void role

  const location = await prisma.location.findFirst({
    where: { id: locationId, userId },
    select: { id: true, userId: true, isDefault: true },
  })

  // Deliberately indistinguishable from "not found": a caller must not be able
  // to probe for the existence of another user's location ids.
  if (!location) {
    throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })
  }

  return location
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm test:server 2>&1 | grep -A5 authz
```

Expected: 4 passed.

- [ ] **Step 5: Mutation check**

1. Delete `userId` from the `where` clause. Expected: *user cannot act in another user's location* goes RED.
2. Replace the `if (!location) throw` with `if (!location) return { id: locationId, userId, isDefault: false }`. Expected: two tests go RED.

Restore after each and confirm green. **Report both results.**

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/lib/authz.ts apps/server/src/lib/authz.test.ts
git commit -m "feat(server): add the RBAC-shaped requireLocationRole helper

Call sites ask whether the caller holds a role on a location and never
inspect userId themselves. The body is user ownership today; under location
RBAC it becomes a membership lookup — a change to this function rather than
to every resolver that calls it.

Refusal is indistinguishable from not-found so a caller cannot probe for
another user's location ids."
```

---

## Task 7: GraphQL schema for `Location` and `ItemStock`

**Files:**
- Create: `apps/server/src/schema/location.graphql`
- Create: `apps/server/src/schema/itemStock.graphql`
- Modify: `apps/server/src/schema/index.ts`

**Interfaces:**
- Produces: the GraphQL operations Tasks 8 and 9 implement, and the codegen types `apps/server/src/generated/graphql.ts` exposes as `Resolvers['Query']['locations']` etc.

- [ ] **Step 1: Create `apps/server/src/schema/location.graphql`**

```graphql
type Location {
  id: ID!
  name: String!
  order: Int!
  isDefault: Boolean!
  createdAt: String!
  updatedAt: String!
}

extend type Query {
  # Lazily creates the caller's default location if they have none, so a new
  # account and a pre-migration account both start with exactly one.
  locations: [Location!]!
}

extend type Mutation {
  createLocation(name: String!): Location!
  updateLocation(id: ID!, input: UpdateLocationInput!): Location!
  deleteLocation(id: ID!): Boolean!
  reorderLocations(orderedIds: [ID!]!): [Location!]!
}

input UpdateLocationInput {
  name: String
}
```

- [ ] **Step 2: Create `apps/server/src/schema/itemStock.graphql`**

```graphql
# Per-(item × location) stock STATE. Configuration lives on Item.
type ItemStock {
  id: ID!
  itemId: ID!
  locationId: ID!
  targetQuantity: Float!
  refillThreshold: Float!
  packedQuantity: Float!
  unpackedQuantity: Float!
  dueDate: String
  createdAt: String!
  updatedAt: String!
}

extend type Query {
  # Every stock in one location — the pantry's join source.
  itemStocks(locationId: ID!): [ItemStock!]!
  # Every location's row for one item — the Stock-tab all-locations pager.
  itemStocksForItem(itemId: ID!): [ItemStock!]!
}

extend type Mutation {
  upsertItemStock(itemId: ID!, locationId: ID!, input: ItemStockInput!): ItemStock!
  # Copy-on-add. Inherits targetQuantity, refillThreshold and dueDate from the
  # source location; packed/unpacked always start at 0. Returns the existing row
  # unchanged if the item is already stocked there.
  addItemToLocation(itemId: ID!, locationId: ID!, sourceLocationId: ID): ItemStock!
  removeItemFromLocation(itemId: ID!, locationId: ID!): Boolean!
}

input ItemStockInput {
  targetQuantity: Float
  refillThreshold: Float
  packedQuantity: Float
  unpackedQuantity: Float
  dueDate: String
}
```

- [ ] **Step 3: Load both files in `apps/server/src/schema/index.ts`**

Append `load('location.graphql')` and `load('itemStock.graphql')` to the `typeDefs` array:

```ts
export const typeDefs = [load('schema.graphql'), load('item.graphql'), load('tag.graphql'), load('vendor.graphql'), load('recipe.graphql'), load('import.graphql'), load('cart.graphql'), load('inventoryLog.graphql'), load('purge.graphql'), load('shelf.graphql'), load('location.graphql'), load('itemStock.graphql')]
```

- [ ] **Step 4: Regenerate types and confirm the schema composes**

```bash
pnpm codegen
```

Expected: succeeds. A malformed `.graphql` file fails here, not at runtime.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/schema/location.graphql apps/server/src/schema/itemStock.graphql apps/server/src/schema/index.ts
git commit -m "feat(server): add Location and ItemStock GraphQL schema

ItemStock is a first-class type rather than fields on Item, so the web layer
can call the same joinItemStock in both modes (PR 2) and a future shared
predefined-item catalog carries no per-user state."
```

---

## Task 8: Location resolvers

**Files:**
- Create: `apps/server/src/resolvers/location.resolver.ts`
- Create: `apps/server/src/resolvers/location.resolver.test.ts`
- Modify: `apps/server/src/resolvers/index.ts`

**Interfaces:**
- Consumes: `requireLocationRole` (Task 6); `requireAuth` from `../context.js`.
- Produces: `export const locationResolvers: Pick<Resolvers, 'Query' | 'Mutation'>`, and the exported helper `ensureDefaultLocation(userId: string): Promise<void>` which Task 9's tests reuse.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/resolvers/location.resolver.test.ts`. Model the fake on `shelf.resolver.test.ts` — a stateful store, not `mockResolvedValue`.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

interface FakeLocation {
  id: string
  name: string
  order: number
  isDefault: boolean
  userId: string
  createdAt: Date
  updatedAt: Date
}

const { state, client } = vi.hoisted(() => {
  const state = { locations: [] as FakeLocation[], itemStocks: [] as { id: string; locationId: string }[] }
  let seq = 0

  function matches(l: FakeLocation, where: Record<string, unknown>): boolean {
    // Filters only on keys present in `where`, like real Prisma. Hardcoding a
    // userId check would leave every ownership mutation check meaningless.
    if (where.id !== undefined && l.id !== where.id) return false
    if (where.userId !== undefined && l.userId !== where.userId) return false
    if (where.isDefault !== undefined && l.isDefault !== where.isDefault) return false
    return true
  }

  const client = {
    location: {
      findFirst: async ({ where = {}, orderBy }: { where?: Record<string, unknown>; orderBy?: { order: 'asc' | 'desc' } }) => {
        const rows = state.locations.filter((l) => matches(l, where))
        if (orderBy?.order === 'asc') rows.sort((a, b) => a.order - b.order)
        return rows[0] ?? null
      },
      findMany: async ({ where = {}, orderBy }: { where?: Record<string, unknown>; orderBy?: { order: 'asc' | 'desc' } }) => {
        const rows = state.locations.filter((l) => matches(l, where))
        if (orderBy?.order === 'asc') rows.sort((a, b) => a.order - b.order)
        return rows
      },
      create: async ({ data }: { data: Omit<FakeLocation, 'id' | 'createdAt' | 'updatedAt'> }) => {
        // Models the partial unique index from the migration. Without this the
        // "drop the isDefault guard" mutation check would stay green.
        if (data.isDefault && state.locations.some((l) => l.userId === data.userId && l.isDefault)) {
          throw new Error('Unique constraint failed on the fields: (`userId`)')
        }
        const row: FakeLocation = { ...data, id: `loc-${++seq}`, createdAt: new Date(), updatedAt: new Date() }
        state.locations.push(row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeLocation> }) => {
        const row = state.locations.find((l) => l.id === where.id)
        if (!row) throw new Error('Location not found')
        Object.assign(row, data, { updatedAt: new Date() })
        return row
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const i = state.locations.findIndex((l) => l.id === where.id)
        if (i === -1) throw new Error('Location not found')
        const [row] = state.locations.splice(i, 1)
        // FK ON DELETE CASCADE
        state.itemStocks = state.itemStocks.filter((s) => s.locationId !== row.id)
        return row
      },
      count: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        state.locations.filter((l) => matches(l, where)).length,
    },
    $transaction: async (arg: unknown) => {
      const snapshot = JSON.parse(JSON.stringify(state))
      try {
        return typeof arg === 'function' ? await (arg as (tx: unknown) => Promise<unknown>)(client) : await Promise.all(arg as Promise<unknown>[])
      } catch (err) {
        state.locations = snapshot.locations.map((l: FakeLocation) => ({
          ...l,
          createdAt: new Date(l.createdAt),
          updatedAt: new Date(l.updatedAt),
        }))
        state.itemStocks = snapshot.itemStocks
        throw err
      }
    },
  }
  return { state, client }
})

vi.mock('../lib/prisma.js', () => ({ prisma: client }))

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(query: string, variables: Record<string, unknown> = {}, userId: string | null = 'user-a') {
  const res = await server.executeOperation({ query, variables }, { contextValue: { userId } })
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

describe('location resolvers', () => {
  beforeEach(() => {
    state.locations = [
      { id: 'loc-a', name: 'My Home', order: 0, isDefault: true, userId: 'user-a', createdAt: new Date(), updatedAt: new Date() },
      { id: 'loc-a2', name: 'Garage', order: 1, isDefault: false, userId: 'user-a', createdAt: new Date(), updatedAt: new Date() },
      { id: 'loc-b', name: 'Their Home', order: 0, isDefault: true, userId: 'user-b', createdAt: new Date(), updatedAt: new Date() },
    ]
    state.itemStocks = [{ id: 'st-1', locationId: 'loc-a2' }]
  })

  it('user can list only their own locations, in order', async () => {
    // Given user-a owns two locations and user-b owns one
    // When user-a lists locations
    const res = await run(`query { locations { id name order isDefault } }`)

    // Then only user-a's are returned, ordered — user-b's is absent
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([
      expect.objectContaining({ id: 'loc-a', order: 0, isDefault: true }),
      expect.objectContaining({ id: 'loc-a2', order: 1, isDefault: false }),
    ])
  })

  it('user with no locations gets a default created lazily', async () => {
    // Given a user who owns nothing
    state.locations = []

    // When they list locations
    const res = await run(`query { locations { name isDefault order } }`, {}, 'user-new')

    // Then exactly one default location was created for them
    expect(res.data?.locations).toEqual([{ name: 'My Home', isDefault: true, order: 0 }])
  })

  it('user can create a location, appended after the highest order', async () => {
    const res = await run(`mutation { createLocation(name: "Cellar") { name order isDefault } }`)
    expect(res.data?.createLocation).toEqual({ name: 'Cellar', order: 2, isDefault: false })
  })

  it('user can rename their own location', async () => {
    const res = await run(
      `mutation Update($id: ID!, $input: UpdateLocationInput!) { updateLocation(id: $id, input: $input) { name } }`,
      { id: 'loc-a2', input: { name: 'Shed' } },
    )
    expect(res.data?.updateLocation).toEqual({ name: 'Shed' })
  })

  it('user cannot rename another user\'s location', async () => {
    const res = await run(
      `mutation Update($id: ID!, $input: UpdateLocationInput!) { updateLocation(id: $id, input: $input) { name } }`,
      { id: 'loc-b', input: { name: 'Hijacked' } },
    )
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.locations.find((l) => l.id === 'loc-b')?.name).toBe('Their Home')
  })

  it('user can delete a non-default location, cascading its stock', async () => {
    const res = await run(`mutation { deleteLocation(id: "loc-a2") }`)
    expect(res.data?.deleteLocation).toBe(true)
    expect(state.locations.some((l) => l.id === 'loc-a2')).toBe(false)
    expect(state.itemStocks).toHaveLength(0)
  })

  it('user cannot delete the default location', async () => {
    const res = await run(`mutation { deleteLocation(id: "loc-a") }`)
    expect(res.errors?.[0]?.message).toMatch(/default location cannot be deleted/i)
    expect(state.locations.some((l) => l.id === 'loc-a')).toBe(true)
  })

  it('user cannot delete another user\'s location', async () => {
    const res = await run(`mutation { deleteLocation(id: "loc-b") }`)
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.locations.some((l) => l.id === 'loc-b')).toBe(true)
  })

  it('user can reorder their locations', async () => {
    const res = await run(
      `mutation Reorder($ids: [ID!]!) { reorderLocations(orderedIds: $ids) { id order } }`,
      { ids: ['loc-a2', 'loc-a'] },
    )
    expect(res.data?.reorderLocations).toEqual([
      { id: 'loc-a2', order: 0 },
      { id: 'loc-a', order: 1 },
    ])
  })

  it('reorder rejects the whole batch if any id is another user\'s', async () => {
    // Given a batch mixing user-a's location with user-b's
    const res = await run(
      `mutation Reorder($ids: [ID!]!) { reorderLocations(orderedIds: $ids) { id } }`,
      { ids: ['loc-a2', 'loc-b'] },
    )

    // Then nothing is written — user-a's own order is unchanged too
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.locations.find((l) => l.id === 'loc-a2')?.order).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm test:server 2>&1 | tail -30
```

Expected: FAIL — `Cannot find module './location.resolver.js'` once it is imported in `index.ts`, or unknown-field GraphQL errors before that.

- [ ] **Step 3: Write the implementation**

Create `apps/server/src/resolvers/location.resolver.ts`:

```ts
import { GraphQLError } from 'graphql'
import { requireAuth } from '../context.js'
import { requireLocationRole } from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'
import type { Location, Resolvers } from '../generated/graphql.js'

const DEFAULT_LOCATION_NAME = 'My Home'

/**
 * Give a user a default location if they have none.
 *
 * Mirrors local mode, where `ensureDefaultLocation` is called from BOTH the
 * Dexie upgrade and `on('populate')` because a fresh database never runs
 * upgrade functions. The cloud equivalents are the migration backfill (users
 * who existed then) and this call (everyone who signs up after).
 *
 * Race-safe by the database, not by check-then-act: the migration adds a
 * partial unique index on ("userId") WHERE "isDefault", so a concurrent second
 * insert loses with P2002 and we simply proceed — the winner's row is the one
 * the subsequent read returns.
 */
export async function ensureDefaultLocation(userId: string): Promise<void> {
  const existing = await prisma.location.findFirst({ where: { userId } })
  if (existing) return
  try {
    await prisma.location.create({
      data: { name: DEFAULT_LOCATION_NAME, order: 0, isDefault: true, userId },
    })
  } catch {
    // Lost the race; the other caller created it.
  }
}

export const locationResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    locations: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      await ensureDefaultLocation(userId)
      return prisma.location.findMany({
        where: { userId },
        orderBy: { order: 'asc' },
      }) as unknown as Promise<Location[]>
    },
  },

  Mutation: {
    createLocation: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      const siblings = await prisma.location.findMany({ where: { userId } })
      const maxOrder = siblings.reduce((max, l) => Math.max(max, l.order), -1)
      return prisma.location.create({
        data: { name: name.trim(), order: maxOrder + 1, isDefault: false, userId },
      }) as unknown as Promise<Location>
    },

    updateLocation: async (_, { id, input }, ctx) => {
      await requireLocationRole(ctx, id, 'member')
      const data: { name?: string } = {}
      if (typeof input.name === 'string') data.name = input.name.trim()
      return prisma.location.update({ where: { id }, data }) as unknown as Promise<Location>
    },

    deleteLocation: async (_, { id }, ctx) => {
      // Owner, not member: deleting a location is destructive and is the kind
      // of action location RBAC reserves for owners.
      const location = await requireLocationRole(ctx, id, 'owner')
      if (location.isDefault) {
        throw new GraphQLError('The default location cannot be deleted.', {
          extensions: { code: 'BAD_USER_INPUT' },
        })
      }
      // ItemStock cascades via the FK. Carts and inventory logs gain their
      // locationId — and therefore their cascade — in PR 3.
      await prisma.location.delete({ where: { id } })
      return true
    },

    reorderLocations: async (_, { orderedIds }, ctx) => {
      const userId = requireAuth(ctx)
      // Authorize EVERY id before writing ANY of them, so a batch containing
      // someone else's location changes nothing at all.
      for (const id of orderedIds) {
        await requireLocationRole(ctx, id, 'member')
      }
      await prisma.$transaction(
        orderedIds.map((id, index) =>
          prisma.location.update({ where: { id }, data: { order: index } }),
        ),
      )
      return prisma.location.findMany({
        where: { userId },
        orderBy: { order: 'asc' },
      }) as unknown as Promise<Location[]>
    },
  },
}
```

- [ ] **Step 4: Wire it into `apps/server/src/resolvers/index.ts`**

Add the import alongside the others:

```ts
import { locationResolvers } from './location.resolver.js'
```

Add `...locationResolvers.Query,` to the `Query` block and `...locationResolvers.Mutation,` to the `Mutation` block.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm test:server
```

Expected: all location tests pass, and the pre-existing ~100 server tests still pass.

- [ ] **Step 6: Mutation check**

1. Remove the `isDefault` guard from `deleteLocation`. Expected RED: *user cannot delete the default location*.
2. Replace `requireLocationRole(ctx, id, 'member')` in `updateLocation` with nothing. Expected RED: *user cannot rename another user's location*.
3. Move the `reorderLocations` authorization loop to *after* the `$transaction`. Expected RED: *reorder rejects the whole batch if any id is another user's* (the order assertion, not the error assertion).
4. Delete the `await ensureDefaultLocation(userId)` call. Expected RED: *user with no locations gets a default created lazily*.

Restore after each. **Report all four results.**

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/resolvers/location.resolver.ts apps/server/src/resolvers/location.resolver.test.ts apps/server/src/resolvers/index.ts
git commit -m "feat(server): add Location resolvers

CRUD plus reorder, every guard routed through requireLocationRole rather
than an inline userId comparison. reorderLocations authorizes every id
before writing any, so a batch containing another user's location changes
nothing.

locations() lazily seeds a default, mirroring local mode where
ensureDefaultLocation runs from both the Dexie upgrade and on('populate').
It is race-safe by the partial unique index, not by check-then-act."
```

---

## Task 9: ItemStock resolvers

**Files:**
- Create: `apps/server/src/resolvers/itemStock.resolver.ts`
- Create: `apps/server/src/resolvers/itemStock.resolver.test.ts`
- Modify: `apps/server/src/resolvers/index.ts`

**Interfaces:**
- Consumes: `requireLocationRole` (Task 6).
- Produces: `export const itemStockResolvers: Pick<Resolvers, 'Query' | 'Mutation'>`. PR 2's web client consumes the operations.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/resolvers/itemStock.resolver.test.ts`. **Every fixture below has two locations, and `item-far` is stocked only at the second one** — with a single location, "stocks in this location" and "all stocks" are the same set and none of these tests would prove anything.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

interface FakeStock {
  id: string
  itemId: string
  locationId: string
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
}

const { state, client } = vi.hoisted(() => {
  const state = {
    locations: [] as { id: string; userId: string; isDefault: boolean }[],
    itemStocks: [] as FakeStock[],
  }
  let seq = 0

  function stockMatches(s: FakeStock, where: Record<string, unknown>): boolean {
    if (where.itemId !== undefined && s.itemId !== where.itemId) return false
    if (where.locationId !== undefined && s.locationId !== where.locationId) return false
    const loc = where.location as { userId?: string } | undefined
    if (loc?.userId !== undefined) {
      const l = state.locations.find((x) => x.id === s.locationId)
      if (l?.userId !== loc.userId) return false
    }
    const compound = where.itemId_locationId as { itemId: string; locationId: string } | undefined
    if (compound && (s.itemId !== compound.itemId || s.locationId !== compound.locationId)) return false
    return true
  }

  const client = {
    location: {
      findFirst: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        state.locations.find(
          (l) =>
            (where.id === undefined || l.id === where.id) &&
            (where.userId === undefined || l.userId === where.userId),
        ) ?? null,
    },
    itemStock: {
      findMany: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        state.itemStocks.filter((s) => stockMatches(s, where)),
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        state.itemStocks.find((s) => stockMatches(s, where)) ?? null,
      create: async ({ data }: { data: Omit<FakeStock, 'id' | 'createdAt' | 'updatedAt'> }) => {
        // Models @@unique([itemId, locationId]). A fake that silently deduped
        // here would hide the P2002 real Postgres throws and leave the
        // already-stocked branch of addItemToLocation unpinned.
        if (state.itemStocks.some((s) => s.itemId === data.itemId && s.locationId === data.locationId)) {
          throw new Error('Unique constraint failed on the fields: (`itemId`,`locationId`)')
        }
        const row: FakeStock = { ...data, id: `st-${++seq}`, createdAt: new Date(), updatedAt: new Date() }
        state.itemStocks.push(row)
        return row
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Partial<FakeStock> }) => {
        const row = state.itemStocks.find((s) => stockMatches(s, where))
        if (!row) throw new Error('ItemStock not found')
        Object.assign(row, data, { updatedAt: new Date() })
        return row
      },
      deleteMany: async ({ where = {} }: { where?: Record<string, unknown> }) => {
        const before = state.itemStocks.length
        state.itemStocks = state.itemStocks.filter((s) => !stockMatches(s, where))
        return { count: before - state.itemStocks.length }
      },
    },
  }
  return { state, client }
})

vi.mock('../lib/prisma.js', () => ({ prisma: client }))

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(query: string, variables: Record<string, unknown> = {}, userId: string | null = 'user-a') {
  const res = await server.executeOperation({ query, variables }, { contextValue: { userId } })
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

function stock(over: Partial<FakeStock> & Pick<FakeStock, 'id' | 'itemId' | 'locationId'>): FakeStock {
  return {
    targetQuantity: 0, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0,
    dueDate: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  }
}

describe('itemStock resolvers', () => {
  beforeEach(() => {
    // TWO locations for user-a, plus one for user-b. `item-far` is stocked
    // ONLY at loc-a2 — without it, "stocks here" and "all stocks" would be the
    // same set and every scoping assertion below would be vacuous.
    state.locations = [
      { id: 'loc-a', userId: 'user-a', isDefault: true },
      { id: 'loc-a2', userId: 'user-a', isDefault: false },
      { id: 'loc-b', userId: 'user-b', isDefault: true },
    ]
    state.itemStocks = [
      stock({ id: 'st-home', itemId: 'item-milk', locationId: 'loc-a', targetQuantity: 3, refillThreshold: 1, packedQuantity: 2 }),
      stock({ id: 'st-garage', itemId: 'item-far', locationId: 'loc-a2', targetQuantity: 9, refillThreshold: 4, packedQuantity: 7 }),
      stock({ id: 'st-theirs', itemId: 'item-rice', locationId: 'loc-b', targetQuantity: 1 }),
    ]
  })

  it('user can read the stocks of one location only', async () => {
    // Given user-a has stock in two locations
    // When they read loc-a
    const res = await run(`query Q($l: ID!) { itemStocks(locationId: $l) { id itemId } }`, { l: 'loc-a' })

    // Then the loc-a2 row is absent — this is the assertion a one-location
    // fixture could not make
    expect(res.data?.itemStocks).toEqual([{ id: 'st-home', itemId: 'item-milk' }])
  })

  it('user cannot read another user\'s location stocks', async () => {
    const res = await run(`query Q($l: ID!) { itemStocks(locationId: $l) { id } }`, { l: 'loc-b' })
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
  })

  it('user can read every location\'s stock for one item', async () => {
    state.itemStocks.push(stock({ id: 'st-extra', itemId: 'item-milk', locationId: 'loc-a2', targetQuantity: 5 }))
    const res = await run(`query Q($i: ID!) { itemStocksForItem(itemId: $i) { locationId } }`, { i: 'item-milk' })
    expect(res.data?.itemStocksForItem).toEqual([{ locationId: 'loc-a' }, { locationId: 'loc-a2' }])
  })

  it('itemStocksForItem excludes another user\'s rows', async () => {
    // Given user-b also stocks an item id that user-a stocks
    state.itemStocks.push(stock({ id: 'st-b2', itemId: 'item-milk', locationId: 'loc-b' }))
    const res = await run(`query Q($i: ID!) { itemStocksForItem(itemId: $i) { locationId } }`, { i: 'item-milk' })
    expect(res.data?.itemStocksForItem).toEqual([{ locationId: 'loc-a' }])
  })

  it('user can upsert a stock that does not exist yet', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { targetQuantity packedQuantity } }`,
      { i: 'item-new', l: 'loc-a2', in: { targetQuantity: 4, packedQuantity: 1 } },
    )
    expect(res.data?.upsertItemStock).toEqual({ targetQuantity: 4, packedQuantity: 1 })
  })

  it('user can upsert a stock that already exists, merging fields', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { targetQuantity refillThreshold packedQuantity } }`,
      { i: 'item-milk', l: 'loc-a', in: { packedQuantity: 5 } },
    )
    // refillThreshold and targetQuantity are untouched by a partial input
    expect(res.data?.upsertItemStock).toEqual({ targetQuantity: 3, refillThreshold: 1, packedQuantity: 5 })
  })

  it('user cannot upsert into another user\'s location', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { id } }`,
      { i: 'item-milk', l: 'loc-b', in: { packedQuantity: 99 } },
    )
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.itemStocks.find((s) => s.id === 'st-theirs')?.packedQuantity).toBe(0)
  })

  it('add to location inherits target and refill but zeroes quantities', async () => {
    // Given item-milk is stocked at loc-a with packed 2
    // When it is added to loc-a2 sourcing from loc-a
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $s: ID) { addItemToLocation(itemId: $i, locationId: $l, sourceLocationId: $s) { targetQuantity refillThreshold packedQuantity unpackedQuantity } }`,
      { i: 'item-milk', l: 'loc-a2', s: 'loc-a' },
    )
    // Then configuration-like state carries over but on-hand quantities do not
    expect(res.data?.addItemToLocation).toEqual({
      targetQuantity: 3, refillThreshold: 1, packedQuantity: 0, unpackedQuantity: 0,
    })
  })

  it('add to location is a no-op when already stocked there', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!) { addItemToLocation(itemId: $i, locationId: $l) { id packedQuantity } }`,
      { i: 'item-milk', l: 'loc-a' },
    )
    // Returns the existing row untouched rather than throwing on @@unique
    expect(res.data?.addItemToLocation).toEqual({ id: 'st-home', packedQuantity: 2 })
    expect(state.itemStocks.filter((s) => s.itemId === 'item-milk')).toHaveLength(1)
  })

  it('add to location zeroes everything when there is no source row', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!) { addItemToLocation(itemId: $i, locationId: $l) { targetQuantity refillThreshold packedQuantity } }`,
      { i: 'item-orphan', l: 'loc-a2' },
    )
    expect(res.data?.addItemToLocation).toEqual({ targetQuantity: 0, refillThreshold: 0, packedQuantity: 0 })
  })

  it('user can remove an item from one location, leaving the others', async () => {
    state.itemStocks.push(stock({ id: 'st-extra', itemId: 'item-milk', locationId: 'loc-a2' }))
    const res = await run(`mutation M($i: ID!, $l: ID!) { removeItemFromLocation(itemId: $i, locationId: $l) }`, {
      i: 'item-milk', l: 'loc-a',
    })
    expect(res.data?.removeItemFromLocation).toBe(true)
    expect(state.itemStocks.map((s) => s.id).sort()).toEqual(['st-extra', 'st-garage', 'st-theirs'])
  })

  it('user cannot remove an item from another user\'s location', async () => {
    const res = await run(`mutation M($i: ID!, $l: ID!) { removeItemFromLocation(itemId: $i, locationId: $l) }`, {
      i: 'item-rice', l: 'loc-b',
    })
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.itemStocks.some((s) => s.id === 'st-theirs')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm test:server 2>&1 | tail -30
```

Expected: FAIL — the `itemStocks` field has no resolver.

- [ ] **Step 3: Write the implementation**

Create `apps/server/src/resolvers/itemStock.resolver.ts`:

```ts
import { requireAuth } from '../context.js'
import { requireLocationRole } from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'
import type { ItemStock, Resolvers } from '../generated/graphql.js'

// The five state fields, all optional on input. A key absent from `input` is
// left untouched on an existing row — this is a merge, not a replace.
type StockInput = {
  targetQuantity?: number | null
  refillThreshold?: number | null
  packedQuantity?: number | null
  unpackedQuantity?: number | null
  dueDate?: string | null
}

function toData(input: StockInput): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (input.targetQuantity != null) data.targetQuantity = input.targetQuantity
  if (input.refillThreshold != null) data.refillThreshold = input.refillThreshold
  if (input.packedQuantity != null) data.packedQuantity = input.packedQuantity
  if (input.unpackedQuantity != null) data.unpackedQuantity = input.unpackedQuantity
  if ('dueDate' in input) data.dueDate = input.dueDate ? new Date(input.dueDate) : null
  return data
}

export const itemStockResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    itemStocks: async (_, { locationId }, ctx) => {
      await requireLocationRole(ctx, locationId, 'viewer')
      return prisma.itemStock.findMany({ where: { locationId } }) as unknown as Promise<ItemStock[]>
    },

    itemStocksForItem: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      // Scoped THROUGH the location — ItemStock has no userId of its own.
      return prisma.itemStock.findMany({
        where: { itemId, location: { userId } },
      }) as unknown as Promise<ItemStock[]>
    },
  },

  Mutation: {
    upsertItemStock: async (_, { itemId, locationId, input }, ctx) => {
      await requireLocationRole(ctx, locationId, 'member')
      const data = toData(input as StockInput)
      const existing = await prisma.itemStock.findUnique({
        where: { itemId_locationId: { itemId, locationId } },
      })
      if (existing) {
        return prisma.itemStock.update({
          where: { itemId_locationId: { itemId, locationId } },
          data,
        }) as unknown as Promise<ItemStock>
      }
      return prisma.itemStock.create({
        data: {
          itemId,
          locationId,
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          dueDate: null,
          ...data,
        },
      }) as unknown as Promise<ItemStock>
    },

    // Copy-on-add, matching local `addItemToLocation` (db/operations.ts:152).
    // Since the v16 split there is nothing to copy for units, packaging,
    // expiration mode or consume amount — those are global Item fields the new
    // location shares automatically. Only targetQuantity, refillThreshold and
    // dueDate are inherited; on-hand quantities always start at 0.
    addItemToLocation: async (_, { itemId, locationId, sourceLocationId }, ctx) => {
      const userId = requireAuth(ctx)
      await requireLocationRole(ctx, locationId, 'member')

      const existing = await prisma.itemStock.findUnique({
        where: { itemId_locationId: { itemId, locationId } },
      })
      if (existing) return existing as unknown as ItemStock

      const all = await prisma.itemStock.findMany({ where: { itemId, location: { userId } } })
      const source =
        (sourceLocationId ? all.find((s) => s.locationId === sourceLocationId) : undefined) ??
        [...all].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]

      return prisma.itemStock.create({
        data: {
          itemId,
          locationId,
          targetQuantity: source?.targetQuantity ?? 0,
          refillThreshold: source?.refillThreshold ?? 0,
          dueDate: source?.dueDate ?? null,
          packedQuantity: 0,
          unpackedQuantity: 0,
        },
      }) as unknown as Promise<ItemStock>
    },

    removeItemFromLocation: async (_, { itemId, locationId }, ctx) => {
      await requireLocationRole(ctx, locationId, 'member')
      // Only the stock row here. The global Item survives — an item removed
      // from its last location becomes an orphan: absent from the pantry but
      // still in the catalog, so it can be re-added. The location's inventory
      // logs and cart entries cascade in PR 3, when they gain a locationId.
      await prisma.itemStock.deleteMany({ where: { itemId, locationId } })
      return true
    },
  },
}
```

- [ ] **Step 4: Wire it into `apps/server/src/resolvers/index.ts`**

```ts
import { itemStockResolvers } from './itemStock.resolver.js'
```

Add `...itemStockResolvers.Query,` and `...itemStockResolvers.Mutation,` to their blocks.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm test:server
```

Expected: all itemStock tests pass; nothing pre-existing regresses.

- [ ] **Step 6: Mutation check**

1. In `itemStocks`, delete the `requireLocationRole` call. Expected RED: *user cannot read another user's location stocks*.
2. In `itemStocksForItem`, drop `location: { userId }` from the `where`. Expected RED: *itemStocksForItem excludes another user's rows*.
3. In `addItemToLocation`, delete the `if (existing) return existing` early return. Expected RED: *add to location is a no-op when already stocked there* — the fake throws the unique-constraint error, which is the point of modelling it.
4. In `addItemToLocation`, change `packedQuantity: 0` to `source?.packedQuantity ?? 0`. Expected RED: *add to location inherits target and refill but zeroes quantities*.
5. In `removeItemFromLocation`, drop `locationId` from the `deleteMany` where. Expected RED: *user can remove an item from one location, leaving the others*.

Restore after each. **Report all five results.**

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/resolvers/itemStock.resolver.ts apps/server/src/resolvers/itemStock.resolver.test.ts apps/server/src/resolvers/index.ts
git commit -m "feat(server): add ItemStock resolvers

Reads, upsert, and copy-on-add/remove for per-(item x location) stock, all
scoped through the location rather than a userId on ItemStock itself.

addItemToLocation matches local semantics: inherits targetQuantity,
refillThreshold and dueDate, always zeroes on-hand quantities, and returns
the existing row untouched when already stocked there.

Every fixture has two locations with one item stocked only at the second —
with one location, 'stocks here' and 'all stocks' are the same set and the
scoping assertions would be vacuous."
```

---

## Task 10: Purge must delete the new tables

The design assigns purge to PR 4, but the moment these tables exist a purge leaves orphan rows. This is a correctness requirement of Task 3, not §6 feature work.

**Files:**
- Modify: `apps/server/src/resolvers/purge.resolver.ts`
- Modify: `apps/server/src/resolvers/purge-coverage.test.ts`

**Interfaces:**
- Consumes: the Prisma models from Task 3.

- [ ] **Step 1: Confirm the coverage test actually fails when a model is omitted**

Do not assume it does — root `CLAUDE.md` records three purge tests sitting broken on `main`.

```bash
sed -n '1,60p' apps/server/src/resolvers/purge-coverage.test.ts
```

Then temporarily delete the `shelves` line from `purge.resolver.ts`'s `$transaction` array and run:

```bash
pnpm test:server 2>&1 | grep -A5 purge
```

Expected: RED. If it stays green the coverage test is vacuous — fix it before continuing. Restore the line either way.

- [ ] **Step 2: Add both models to the purge transaction**

In `apps/server/src/resolvers/purge.resolver.ts`, add to the destructured array and the `$transaction` list. **Order matters** — `ItemStock` before `Location`, since it FKs to it:

```ts
        // ItemStock has no userId of its own — scoped through its location,
        // matching how recipeItems is scoped through its recipe above.
        prisma.itemStock.deleteMany({ where: { location: { userId } } }),
        prisma.location.deleteMany({ where: { userId } }),
```

Destructure them as `itemStocks` and `locations`, and add both counts to the returned object.

- [ ] **Step 3: Add the counts to the GraphQL purge payload**

In `apps/server/src/schema/purge.graphql`, add two fields to the result type:

```graphql
  itemStocks: Int!
  locations: Int!
```

- [ ] **Step 4: Extend the coverage test to require the new models**

Add `'itemStock'` and `'location'` to whatever list of expected Prisma models `purge-coverage.test.ts` asserts against.

- [ ] **Step 5: Run the tests**

```bash
pnpm codegen && pnpm test:server
```

Expected: pass.

- [ ] **Step 6: Mutation check**

Delete the `prisma.location.deleteMany` line. Expected RED in `purge-coverage.test.ts`. Restore and confirm green. **Report the result.**

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/resolvers/purge.resolver.ts apps/server/src/resolvers/purge-coverage.test.ts apps/server/src/schema/purge.graphql
git commit -m "fix(server): purge Location and ItemStock rows

Creating the tables without extending purgeUserData would leave orphan rows
behind on every purge. ItemStock is scoped through its location, mirroring
how recipeItems is scoped through its recipe.

Pulled forward from PR 4 in the design: it is a correctness requirement of
creating the tables, not import/export feature work."
```

---

## Task 11: Full verification gate and PR 1

**Files:** none modified — this task verifies and ships.

- [ ] **Step 1: Run the complete verification gate**

```bash
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
pnpm test
```

All must pass. The root `pnpm build` is required — it runs codegen and type-checks **both** `apps/web` and `apps/server`, which `pnpm test`, `pnpm check` and `build-storybook` all skip.

If the web suite runs unusually slowly or reports disjoint failures across runs, check `uptime` for load average before investigating: that pattern is a starved machine, not a code failure.

- [ ] **Step 2: Re-run the migration verification**

```bash
cd apps/server && pnpm verify:migration
```

Expected: `Migration verified.`

- [ ] **Step 3: Run E2E**

PR 1 changes no UI, so this is a regression check that the additive schema broke nothing.

Check ports are free first (`lsof -nP -iTCP:5175 -sTCP:LISTEN`, likewise 5174 and 4001), then:

```bash
pnpm test:e2e --grep "items|shopping|cooking|settings|shelves|vendors-group|recipes-group|a11y"
```

Expected: all pass. A failure here is a hard stop — the branch must not be pushed until it is fixed.

- [ ] **Step 4: Confirm a clean tree**

```bash
git status
```

Expected: nothing to commit. If anything is outstanding, commit it — splitting by logical concern — before proceeding.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feature/cloud-locations
gh pr create --title "feat(server): cloud Location and ItemStock backend" --body "$(cat <<'EOF'
## Summary
- Adds Prisma `Location` and `ItemStock`, with a migration that backfills one default location per user (unioned across all nine user-scoped tables) and one `ItemStock` per `Item`
- **Additive only** — `Item` keeps its five state columns and keeps serving them, so a browser running an older bundle is unaffected. PR 2 switches the client; PR 5 drops the columns
- `ItemStock` deliberately carries no `userId`: it is scoped through its location, keeping the RBAC-forbidden ownership guard out of reach at call sites
- Every location-touching resolver routes authorization through `requireLocationRole(ctx, locationId, role)` — RBAC-shaped today, user ownership in the body, so landing RBAC changes one function rather than N call sites
- A partial unique index enforces exactly one default location per user, making the lazy `ensureDefaultLocation` race-safe by the database rather than by check-then-act
- Purge extended to both tables (pulled forward from PR 4 — orphan rows otherwise)
- Cloud E2E now runs against a dedicated test database, not dev

Design: `docs/features/locations/2026-08-30-cloud-locations-design.md`
Plan: `docs/features/locations/2026-08-30-cloud-locations-plan-pr0-pr1.md`

## Test Plan
- [ ] `pnpm test` — both suites
- [ ] `pnpm build` from the root — type-checks web **and** server
- [ ] `cd apps/server && pnpm verify:migration` — migration asserted against real Postgres with a multi-user fixture
- [ ] `pnpm test:e2e --grep "items|shopping|cooking|settings|shelves|vendors-group|recipes-group|a11y"`
- [ ] Mutation checks reported for authz, location resolvers, itemStock resolvers, purge, and the migration

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01AeauZMSZJnR5TQWiS7PKj3
EOF
)"
```

- [ ] **Step 6: Attach the PR to a milestone**

`gh milestone` is not a valid subcommand and `gh pr edit --milestone` does not work here — use `gh api`:

```bash
gh api repos/ETBlue/player1inventory/milestones | grep -E '"title"|"number"'
gh api repos/ETBlue/player1inventory/issues/<PR_NUMBER> --method PATCH --field milestone=<MILESTONE_NUMBER>
```

Match to the cloud milestone (e.g. `v0.2.0 — Cloud Foundation`). Skip if none fits.

- [ ] **Step 7: Update `docs/INDEX.md`**

Change the `cloud-locations` row's status from `🔲 Pending` to `🔄 In Progress`, noting PR 0 ✅ and PR 1 ✅ with their PR numbers. Commit as `docs(index): mark cloud-locations PR 0 and PR 1 complete`.

---

## Self-Review

**Spec coverage (PR 0 + PR 1 scope only):**

| Spec section | Task |
|---|---|
| §1 `Location` model + `isDefault` | 3, 4 |
| §1 `ItemStock` model, `@@unique`, no `userId` | 3, 4, 9 |
| §1 `Item` keeps state columns | 3 (constraint), 5 (asserted) |
| §2 `Location` / `ItemStock` GraphQL types | 7 |
| §2 `locations`, `itemStocks`, `itemStocksForItem` | 7, 8, 9 |
| §2 Location + stock mutations | 7, 8, 9 |
| §4.1–4.3 migration + nine-table union | 4, 5 |
| §4 lazy `ensureDefaultLocation` | 8 |
| §6 purge | 10 (pulled forward, noted) |
| §7 real-Postgres verification | 5 |
| §7 fakes model the constraint | 8, 9 |
| §7 two-location fixtures | 9 |
| §7 mutation checks reported | 5, 6, 8, 9, 10 |
| §7 issue #260 pre-PR | 1 |
| §7 dedicated test database | 2 |
| Authorization helper | 6 |

**Deferred to later PRs, by design:** §2 `applyUnitSwitch` / `consumeRecipes` transactions and `applyShelfFilterPicks` re-pointing (PR 3); §2 the client join, `lib/itemStock.ts`, Apollo `keyArgs` (PR 2); §3 the whole `'local'` sentinel retirement and Dexie v18 (PR 2); §4.5–4.7 logs and carts, §5 the `'no-vendor'` split (PR 3); §6 import/export/post-login (PR 4); §4.4 dropping `Item` columns (PR 5).

**Type consistency:** `requireLocationRole(ctx, locationId, role)` returns `{ id, userId, isDefault }` in Task 6 and is consumed for `.isDefault` in Task 8's `deleteLocation` — consistent. `ensureDefaultLocation(userId: string): Promise<void>` is exported in Task 8 and named identically wherever referenced. The GraphQL `ItemStockInput` field names in Task 7 match `StockInput` in Task 9. `itemId_locationId` is the compound-key name Prisma generates from `@@unique([itemId, locationId])` in Task 3, and Task 9's fake models it.

**Placeholder scan:** no TBD/TODO; every code step carries real code; every test step carries real assertions; no "similar to Task N".
