// Verifies the location migrations against a REAL Postgres, because the
// resolver test suite runs entirely against a hand-written Prisma fake and
// cannot exercise SQL at all.
//
// Three migrations are under test, applied in order:
//   1. 20260830000000_add_location_and_item_stock      (PR 1)  — Location, ItemStock
//   2. 20260916000000_add_location_to_log_and_cart     (PR 3a) — InventoryLog.locationId,
//      Cart.locationId
//   3. 20260917000000_rekey_cart_to_location_vendor    (PR 3b) — splits the shared
//      'no-vendor' cart, then re-keys Cart.id to `${locationId}:${vendorId}`
// All three must be parked together. Each one references what the previous one
// creates, so resetting with only some of them parked would fail at reset time.
//
// Destructive: drops and recreates the public schema of TEST_DATABASE_URL —
// via TEST_DIRECT_URL, since Prisma Migrate always issues DDL through
// `directUrl` (see prisma/schema.prisma), never the pooled `url`.
// Refuses to run if TEST_DATABASE_URL or TEST_DIRECT_URL resolve — by parsed
// host + pathname, not raw string equality — to the same database as either
// DATABASE_URL or DIRECT_URL (dev). Raw equality would miss a pooled/direct
// or query-param variant of the same underlying database.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Prisma, PrismaClient } from '@prisma/client'

const TEST_URL = process.env.TEST_DATABASE_URL
const TEST_DIRECT = process.env.TEST_DIRECT_URL

if (!TEST_URL || !TEST_DIRECT) {
  throw new Error('TEST_DATABASE_URL and TEST_DIRECT_URL must be set (see .env.example)')
}

// Identity of the database a connection string points at, independent of
// pooling mode or query-string differences (e.g. `?sslmode=require` on one
// but not the other) — just enough to catch "this is secretly the same
// database" without being fooled by cosmetic string differences.
function databaseIdentity(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  return `${parsed.host}${parsed.pathname}`
}

// Prisma Migrate uses `directUrl` for all DDL (migrate reset/deploy), and the
// pooled `url` only for the query engine — so BOTH TEST_DATABASE_URL and
// TEST_DIRECT_URL must be checked against BOTH DATABASE_URL and DIRECT_URL.
// Checking only TEST_URL against DATABASE_URL (the original guard) misses the
// connection that actually issues the destructive DDL.
function assertDistinctFromDev(label: string, rawUrl: string): void {
  const target = databaseIdentity(rawUrl)
  for (const [devLabel, devUrl] of [
    ['DATABASE_URL', process.env.DATABASE_URL],
    ['DIRECT_URL', process.env.DIRECT_URL],
  ] as const) {
    if (!devUrl) continue
    if (databaseIdentity(devUrl) === target) {
      throw new Error(
        `${label} resolves to the same database (${target}) as ${devLabel} — refusing to run, this script drops the schema`,
      )
    }
  }
}

assertDistinctFromDev('TEST_DATABASE_URL', TEST_URL)
assertDistinctFromDev('TEST_DIRECT_URL', TEST_DIRECT)

const env = { ...process.env, DATABASE_URL: TEST_URL, DIRECT_URL: TEST_DIRECT }
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } })

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  ok — ${message}`)
}

// A fixture shaped like production BEFORE the migration: Item still carries
// its five state fields inline, and there is no Location table yet.
//
// THIRTEEN distinct users. Ten cover PR 1's union arms (one per arm, plus
// Item's two owners); three more (user-k, user-l, user-m) exist only to test
// PR 3b's 'no-vendor' split, and are described at the CartItem seed below.
//   user-a, user-b — Item (2 rows + 1 row)
//   user-c         — TagType only (owns no Item)
//   user-d         — Vendor only (standalone)
//   user-e         — Recipe only (standalone)
//   user-f         — Shelf only (standalone)
//   user-g         — Tag only (FK borrows tt-c's TagType, but the Tag row's
//                    OWN userId — what the backfill selects — is distinct)
//   user-h         — CartItem only (FKs borrow cart-i and item-a1; its own
//                    userId is distinct from both)
//   user-i         — Cart only (standalone)
//   user-j         — InventoryLog only (FK borrows item-a1; its own userId is
//                    distinct)
//   user-k         — owns the shared 'no-vendor' Cart, and one CartItem on it
//   user-l         — two CartItems on the shared 'no-vendor' Cart, owns no Cart
//   user-m         — owns 'cart-m' and one CartItem on it; nothing on the
//                    shared row (the control for phase A)
//
// Every one of the nine unioned tables (Item, TagType, Tag, Vendor, Recipe,
// Cart, CartItem, InventoryLog, Shelf) is exercised by an owner who appears
// in NO other table — deleting any single arm from the migration's UNION
// leaves exactly that user without a default location, and the coverage
// assertion below catches it.
const MILK_DUE_DATE = new Date('2026-09-15T00:00:00.000Z')

// Set on the shared 'no-vendor' cart. It belongs to user-k, who owns that row.
// Phase A must NOT create a second cart for user-k: phase B renames their row
// in place, so this timestamp has to survive. A split that created a fresh cart
// for the owner too would lose it (and would also collide on the primary key).
const SHARED_CART_LAST_PURCHASED_AT = new Date('2026-09-10T12:00:00.000Z')

async function seedFixture(): Promise<void> {
  console.log('Seeding thirteen-user pre-migration fixture (nine union arms + the PR 3b split)...')

  // Item — user-a (x2), user-b (x1). item-a1's refillThreshold (1) and
  // unpackedQuantity (5) are deliberately different values, so a swap between
  // those two columns in the backfill is catchable; its dueDate is
  // deliberately non-NULL, so a dropped/NULLed dueDate column is catchable.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Item" ("id","name","targetUnit","targetQuantity","refillThreshold","packedQuantity","unpackedQuantity","consumeAmount","expirationMode","dueDate","userId","createdAt","updatedAt")
    VALUES
      ('item-a1','Milk','package',3,1,2,5,1,'disabled','${MILK_DUE_DATE.toISOString()}','user-a',NOW(),NOW()),
      ('item-a2','Eggs','package',6,2,4,0,1,'disabled',NULL,'user-a',NOW(),NOW()),
      ('item-b1','Rice','package',1,1,1,0,1,'disabled',NULL,'user-b',NOW(),NOW())
  `)

  // TagType — user-c, who otherwise owns nothing.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "TagType" ("id","name","color","userId") VALUES ('tt-c','Storage','blue','user-c')
  `)

  // Vendor — user-d, standalone (no FK dependencies).
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Vendor" ("id","name","userId") VALUES ('vendor-d','Costco','user-d')
  `)

  // Recipe — user-e, standalone.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Recipe" ("id","name","userId") VALUES ('recipe-e','Pancakes','user-e')
  `)

  // Shelf — user-f, standalone.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Shelf" ("id","name","type","order","userId","createdAt","updatedAt")
    VALUES ('shelf-f','Fridge','vendor',0,'user-f',NOW(),NOW())
  `)

  // Tag — user-g. Its FK (typeId) borrows tt-c, but its own userId column —
  // what the backfill's UNION actually selects — is a distinct owner.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Tag" ("id","name","typeId","userId") VALUES ('tag-g','Cold','tt-c','user-g')
  `)

  // Cart — user-i (standalone) and user-a (who also owns items).
  // TWO owners on purpose. With one cart the "backfill picked the right
  // owner's location" assertion cannot fail: any constant location id would
  // satisfy it. See root CLAUDE.md, "Proving a Test Works".
  //
  // Plus the PR 3b fixture (see SHARED_CART_LAST_PURCHASED_AT below):
  //   'no-vendor' — the ONE shared row, owned by user-k. This is the leak
  //                 design §5 describes: the id is a literal, not a cuid, so
  //                 the first user to open it owned it for everybody.
  //   'cart-m'    — user-m's own vendor cart. user-m is the control: they have
  //                 cart items, but NONE on the shared row, so phase A must
  //                 leave them completely alone.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Cart" ("id","userId","lastPurchasedAt") VALUES
      ('cart-i','user-i',NULL),
      ('cart-a','user-a',NULL),
      ('no-vendor','user-k','${SHARED_CART_LAST_PURCHASED_AT.toISOString()}'),
      ('cart-m','user-m',NULL)
  `)

  // CartItem — user-h. FKs borrow cart-i and item-a1, but its own userId is
  // a distinct owner from both.
  //
  // Then the PR 3b split fixture. THREE users touch the shared 'no-vendor'
  // cart in different ways, because a one-user fixture cannot fail here:
  //
  //   user-k  owns the shared row AND has an item on it. Phase A must leave
  //           this pair alone; phase B renames their row to
  //           `${their locationId}:no-vendor` and their item follows.
  //   user-l  has TWO items on the shared row and owns NO cart. Phase A must
  //           create `${their locationId}:no-vendor` and move both items to it.
  //           This is the only assertion that can tell the split apart from
  //           "the re-key ran".
  //   user-m  has an item, but on their own cart. Untouched by phase A.
  //
  // TWO items for user-l, not one, so a split that moved only the first row
  // is catchable.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "CartItem" ("id","cartId","itemId","quantity","userId") VALUES
      ('cartitem-h','cart-i','item-a1',1,'user-h'),
      ('ci-k1','no-vendor','item-a1',2,'user-k'),
      ('ci-l1','no-vendor','item-a1',3,'user-l'),
      ('ci-l2','no-vendor','item-b1',4,'user-l'),
      ('ci-m1','cart-m','item-a1',5,'user-m')
  `)

  // InventoryLog — user-j and user-a. BOTH rows point at item-a1, which
  // user-a owns. Two things ride on that:
  //   - log-j's own userId (user-j) differs from its item's owner (user-a), so
  //     a backfill that joined through "Item"."userId" instead of
  //     "InventoryLog"."userId" puts log-j in user-a's location and the
  //     assertion goes red.
  //   - two logs with two different owners mean a backfill writing one
  //     constant location cannot pass either.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "InventoryLog" ("id","itemId","delta","quantity","occurredAt","userId") VALUES
      ('log-j','item-a1',1,3,NOW(),'user-j'),
      ('log-a','item-a1',2,5,NOW(),'user-a')
  `)
}

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url))

// In apply order. Adding a later location migration means adding it here.
const MIGRATIONS = [
  '20260830000000_add_location_and_item_stock',
  '20260916000000_add_location_to_log_and_cart',
  '20260917000000_rekey_cart_to_location_vendor',
] as const

const PARKED_ROOT = join(SERVER_DIR, '.migration-under-test')
const migrationDir = (name: string) => join(SERVER_DIR, 'prisma/migrations', name)
const parkedDir = (name: string) => join(PARKED_ROOT, name)

// Idempotent by construction: safe to call from a startup self-heal check,
// from the normal finally block, and from a SIGINT/SIGTERM handler, in any
// combination, without throwing on a directory that isn't there.
function restoreIfParked(): void {
  if (!existsSync(PARKED_ROOT)) return
  for (const name of MIGRATIONS) {
    const parked = parkedDir(name)
    if (!existsSync(parked)) continue
    if (existsSync(migrationDir(name))) {
      // Both exist — a previous restore already succeeded but the parked copy
      // was never cleaned up (e.g. two restore calls raced). Trust the live
      // migration directory and discard the stale parked copy.
      console.log(`Both ${name} and a stale parked copy exist — discarding the parked copy.`)
      rmSync(parked, { recursive: true, force: true })
      continue
    }
    console.log(`Restoring parked ${name}...`)
    renameSync(parked, migrationDir(name))
  }
  rmSync(PARKED_ROOT, { recursive: true, force: true })
}

let parked = false

// A SIGINT (Ctrl-C) or SIGTERM delivered while the migration is parked would,
// with no handler registered, kill the process immediately at the OS level —
// bypassing the try/finally entirely, since Node's default disposition for
// these signals is unconditional termination, not "run pending finally
// blocks". Registering a handler overrides that default, so the process
// instead waits for in-flight synchronous work (e.g. execSync) to return
// before this handler runs, giving the restore a chance to happen.
function handleFatalSignal(signal: NodeJS.Signals): void {
  console.error(`\nReceived ${signal}.`)
  if (parked) restoreIfParked()
  process.exit(1)
}
process.on('SIGINT', handleFatalSignal)
process.on('SIGTERM', handleFatalSignal)

async function main(): Promise<void> {
  // Self-heal: if a previous run was killed between parking and restoring,
  // recover instead of throwing on the renameSync below.
  restoreIfParked()

  // `prisma migrate reset` applies EVERY committed migration — including the
  // one under test. Seeding after that would run the backfill against an
  // empty database and make `migrate deploy` a no-op, so the assertions below
  // would verify nothing. Park the migration, reset to the state before it,
  // seed a production-shaped fixture, then restore and apply it.
  //
  // This is also the property apps/server/prisma/CLAUDE.md demands — "a
  // migration must be valid on a DB built only from committed history" — so
  // the harness now tests that directly rather than assuming it.
  console.log(`Parking ${MIGRATIONS.join(', ')}...`)
  mkdirSync(PARKED_ROOT, { recursive: true })
  for (const name of MIGRATIONS) renameSync(migrationDir(name), parkedDir(name))
  parked = true

  try {
    console.log('Resetting test database to pre-migration history...')
    execSync('pnpm exec prisma migrate reset --force --skip-seed --skip-generate', {
      cwd: SERVER_DIR,
      env,
      stdio: 'inherit',
    })
    await seedFixture()
  } finally {
    restoreIfParked()
    parked = false
  }

  console.log('Applying the migrations under test...')
  execSync('pnpm exec prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'inherit' })

  console.log('Asserting...')

  const EXPECTED_USER_IDS = [
    'user-a', // Item
    'user-b', // Item
    'user-c', // TagType
    'user-d', // Vendor
    'user-e', // Recipe
    'user-f', // Shelf
    'user-g', // Tag
    'user-h', // CartItem
    'user-i', // Cart
    'user-j', // InventoryLog
    'user-k', // Cart + CartItem — owns the shared 'no-vendor' row (PR 3b)
    'user-l', // CartItem only — two items on the shared row (PR 3b)
    'user-m', // Cart + CartItem — the control, nothing on the shared row (PR 3b)
  ] as const

  const locations = await prisma.location.findMany({ orderBy: { userId: 'asc' } })
  assert(
    locations.length === EXPECTED_USER_IDS.length,
    `one Location per user across all ${EXPECTED_USER_IDS.length} users (all nine union arms plus Item)`,
  )
  assert(
    locations.every((l) => l.isDefault && l.order === 0 && l.name === 'My Home'),
    'every seeded Location is the default, order 0, named My Home',
  )
  assert(
    new Set(locations.map((l) => l.userId)).size === EXPECTED_USER_IDS.length,
    `${EXPECTED_USER_IDS.length} distinct userIds among the Location rows (structural invariant, not independently falsifiable: given assertion 2 above — every row isDefault — the partial unique index already forbids two rows sharing a userId; kept as a sanity check, not as evidence of correct scoping)`,
  )
  assert(
    EXPECTED_USER_IDS.every((userId) => locations.some((l) => l.userId === userId)),
    'every one of the nine union-arm owners (Item, TagType, Tag, Vendor, Recipe, Cart, CartItem, InventoryLog, Shelf) got a default location — deleting any single arm from the UNION leaves exactly that owner missing one',
  )

  const stocks = await prisma.itemStock.findMany({
    include: { location: true },
    orderBy: { itemId: 'asc' },
  })
  assert(stocks.length === 3, 'one ItemStock per Item')
  assert(
    stocks.every((s) => s.location.isDefault),
    'every ItemStock sits under its default location (structural invariant in THIS fixture: no non-default Location exists yet when Backfill 2 runs, so this cannot go red on its own and is NOT evidence for the `AND l."isDefault"` JOIN filter — see the migration-check report for why that filter is unfalsifiable within a single migration file)',
  )
  // The scoping assertion that a single-user fixture could not make.
  const rice = stocks.find((s) => s.itemId === 'item-b1')
  assert(rice?.location.userId === 'user-b', "user-b's item is stocked under user-b's location")
  const milk = stocks.find((s) => s.itemId === 'item-a1')
  assert(milk?.location.userId === 'user-a', "user-a's item is stocked under user-a's location")
  assert(
    milk?.targetQuantity === 3 &&
      milk?.refillThreshold === 1 &&
      milk?.packedQuantity === 2 &&
      milk?.unpackedQuantity === 5 &&
      milk?.dueDate?.toISOString() === MILK_DUE_DATE.toISOString(),
    'all five state fields (targetQuantity, refillThreshold, packedQuantity, unpackedQuantity, dueDate) copied verbatim — refillThreshold/unpackedQuantity use distinct values so a field swap is catchable, and dueDate is non-NULL so a dropped/nulled column is catchable',
  )

  // Item keeps its columns in this PR — a stale browser bundle still reads them.
  const items = await prisma.$queryRawUnsafe<{ targetQuantity: number }[]>(
    `SELECT "targetQuantity" FROM "Item" WHERE "id" = 'item-a1'`,
  )
  assert(items[0]?.targetQuantity === 3, 'Item.targetQuantity survives (dropped in PR 5, not here)')

  // The partial unique index must actually reject a second default — and for
  // the right reason (P2002 / unique violation), not merely "some error".
  let rejectCode: string | undefined
  try {
    await prisma.location.create({
      data: { name: 'Second Default', order: 1, isDefault: true, userId: 'user-a' },
    })
  } catch (err) {
    rejectCode = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined
  }
  assert(
    rejectCode === 'P2002',
    'a second isDefault location for one user is rejected by the database with P2002 (unique violation)',
  )

  // A non-default second location is fine.
  await prisma.location.create({
    data: { name: 'Garage', order: 1, isDefault: false, userId: 'user-a' },
  })
  assert(
    (await prisma.location.count({ where: { userId: 'user-a' } })) === 2,
    'a non-default second location is allowed',
  )

  // ItemStock_itemId_locationId_key must actually be enforced.
  let duplicateCode: string | undefined
  try {
    await prisma.itemStock.create({
      data: {
        itemId: milk!.itemId,
        locationId: milk!.locationId,
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
      },
    })
  } catch (err) {
    duplicateCode = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined
  }
  assert(
    duplicateCode === 'P2002',
    'a duplicate (itemId, locationId) ItemStock is rejected with P2002 (ItemStock_itemId_locationId_key)',
  )

  // FK cascade: deleting a Location must cascade-delete its ItemStock rows.
  const riceLocationId = rice!.locationId
  await prisma.location.delete({ where: { id: riceLocationId } })
  assert(
    (await prisma.itemStock.count({ where: { locationId: riceLocationId } })) === 0,
    'deleting a Location cascades to delete its ItemStock rows',
  )

  // ══════════════════════════════════════════════════════════════════════
  // PR 3a — InventoryLog.locationId and Cart.locationId
  // ══════════════════════════════════════════════════════════════════════

  // The backfill reached every row. Both columns are NOT NULL by now, so a
  // missed row would have failed the migration itself; these assertions are
  // about WHICH location each row got.
  const logs = await prisma.inventoryLog.findMany({
    include: { location: true },
    orderBy: { id: 'asc' },
  })
  assert(logs.length === 2, 'both seeded InventoryLog rows survive the migration')

  const logA = logs.find((l) => l.id === 'log-a')
  const logJ = logs.find((l) => l.id === 'log-j')
  assert(
    logA?.location.userId === 'user-a' && logA?.location.isDefault === true,
    "user-a's log is backfilled to user-a's default location",
  )
  assert(
    logJ?.location.userId === 'user-j' && logJ?.location.isDefault === true,
    "user-j's log is backfilled to user-j's default location — NOT user-a's, even though the log's item (item-a1) belongs to user-a. This is what catches a backfill that joins through Item instead of through InventoryLog.userId",
  )
  assert(
    logA?.locationId !== logJ?.locationId,
    'the two logs landed in DIFFERENT locations — a backfill writing one constant location id fails here',
  )

  // PR 3b re-keys Cart.id, so these rows can no longer be found by their seeded
  // ids. Each of the five users below owns exactly one cart, so `userId` is an
  // unambiguous handle that survives the re-key.
  const carts = await prisma.cart.findMany({ include: { location: true }, orderBy: { id: 'asc' } })

  const cartA = carts.find((c) => c.userId === 'user-a')
  const cartI = carts.find((c) => c.userId === 'user-i')
  assert(
    cartA?.location.userId === 'user-a' && cartI?.location.userId === 'user-i',
    "each cart is backfilled to its OWN owner's default location",
  )
  assert(
    cartA?.locationId !== cartI?.locationId,
    'the two carts landed in DIFFERENT locations — a constant location id fails here',
  )

  // ══════════════════════════════════════════════════════════════════════
  // PR 3b — the 'no-vendor' split and the Cart.id re-key
  // ══════════════════════════════════════════════════════════════════════

  // ── Counts ──
  //
  // Seeded: 4 carts ('cart-a', 'cart-i', 'no-vendor', 'cart-m') and 5 cart
  // items. Phase A adds exactly ONE cart, user-l's, because user-l is the only
  // user with items on the shared row who does not own it. No cart item is
  // created or destroyed by either phase.
  //
  // NOTE: the PR 3b plan's assertion table says "Cart and cart-item counts are
  // unchanged". That is true of the production rehearsal, where phase A does
  // nothing (0 accounts have items on the shared row), but it is NOT true here
  // and must not be: a fixture where the cart count is unchanged is a fixture
  // where phase A did nothing.
  assert(
    carts.length === 5,
    'cart count is 4 seeded + 1 created by the split (user-l) = 5 — an unchanged count here would mean phase A did nothing',
  )
  assert(
    (await prisma.cartItem.count()) === 5,
    'cart-item count is unchanged at 5 — the split moves rows, it never creates or drops one',
  )

  // ── The shared row is gone under its old id ──
  assert(
    (await prisma.cart.findUnique({ where: { id: 'no-vendor' } })) === null,
    "no Cart row is left under the literal id 'no-vendor' — that literal was shared by every user, which is the leak design §5 describes",
  )

  // ── Each user's items point at THEIR OWN no-vendor cart ──
  const cartK = carts.find((c) => c.userId === 'user-k')
  const cartL = carts.find((c) => c.userId === 'user-l')
  const cartM = carts.find((c) => c.userId === 'user-m')
  assert(
    cartK?.id === `${cartK?.locationId}:no-vendor` && cartK?.location.userId === 'user-k',
    "user-k (who owned the shared row) ends up with `${their own locationId}:no-vendor`",
  )
  assert(
    cartL?.id === `${cartL?.locationId}:no-vendor` && cartL?.location.userId === 'user-l',
    "user-l (who owned no cart at all) gets a NEW `${their own locationId}:no-vendor` — this is the split, and nothing else in this script proves it ran",
  )
  assert(
    cartK?.id !== cartL?.id,
    "user-k's and user-l's no-vendor carts are DIFFERENT rows — one shared row for both is exactly the bug being fixed",
  )

  const ciK1 = await prisma.cartItem.findUnique({ where: { id: 'ci-k1' } })
  const ciL1 = await prisma.cartItem.findUnique({ where: { id: 'ci-l1' } })
  const ciL2 = await prisma.cartItem.findUnique({ where: { id: 'ci-l2' } })
  const ciM1 = await prisma.cartItem.findUnique({ where: { id: 'ci-m1' } })
  assert(ciK1?.cartId === cartK?.id, "user-k's cart item points at user-k's cart")
  assert(
    ciL1?.cartId === cartL?.id && ciL2?.cartId === cartL?.id,
    "BOTH of user-l's cart items point at user-l's cart — one item moving while the other stays fails here",
  )

  // ── No user's items moved into another user's cart ──
  //
  // Stated as the negative as well as the positive: if the split had not run,
  // phase B would have dragged user-l's two items onto user-k's renamed row and
  // the assertion above would read `cartK.id`, so this restates the same fact
  // from the other side for a reader scanning the output.
  assert(
    ciL1?.cartId !== cartK?.id && ciL2?.cartId !== cartK?.id,
    "user-l's items are NOT in user-k's cart — this is what running phase B before phase A looks like",
  )
  assert(ciK1?.cartId !== cartL?.id, "user-k's item is not in user-l's cart either")

  // ── The control user is untouched ──
  assert(
    cartM?.id === `${cartM?.locationId}:cart-m` && ciM1?.cartId === cartM?.id,
    "user-m, who had no items on the shared row, keeps their own cart and item — phase A left them alone",
  )

  // ── The owner keeps their row, and its lastPurchasedAt with it ──
  //
  // Phase A skips the shared row's own owner. This assertion is what proves it:
  // if phase A created a fresh cart for user-k as well, the new row would carry
  // a NULL timestamp, and phase B's rename of the old row would then collide
  // with it on the primary key.
  assert(
    cartK?.lastPurchasedAt?.toISOString() === SHARED_CART_LAST_PURCHASED_AT.toISOString(),
    "the shared row's owner keeps their lastPurchasedAt — their row was RENAMED, not replaced",
  )
  assert(
    cartL?.lastPurchasedAt === null,
    "user-l's new cart opens with a NULL lastPurchasedAt — it must not inherit the shared row's timestamp, which belonged to user-k",
  )

  // ── Every cart id is EXACTLY the one it should be ──
  //
  // Checked against a table built from each cart's own locationId and its
  // seeded vendor part, not with a `startsWith` test. `startsWith` cannot see a
  // doubled prefix: `${loc}:${loc}:no-vendor` starts with `${loc}:` too.
  const EXPECTED_CART_IDS: Record<string, string> = {
    'user-a': `${cartA?.locationId}:cart-a`,
    'user-i': `${cartI?.locationId}:cart-i`,
    'user-k': `${cartK?.locationId}:no-vendor`,
    'user-l': `${cartL?.locationId}:no-vendor`,
    'user-m': `${cartM?.locationId}:cart-m`,
  }
  assert(
    carts.every((c) => c.id === EXPECTED_CART_IDS[c.userId]),
    'every Cart.id is exactly `${its own locationId}:${its original id}` — catches a missed row and a doubled prefix, which a startsWith test cannot',
  )

  // ── No orphaned cart items ──
  //
  // The FK is back on by the end of the migration, so a true orphan could not
  // survive to here. The join is asserted anyway because the FK is DROPPED for
  // the length of phase B, and an orphan created there is what a wrong
  // statement order produces.
  const allCartIds = new Set(carts.map((c) => c.id))
  const allCartItems = await prisma.cartItem.findMany()
  const orphans = allCartItems.filter((ci) => !allCartIds.has(ci.cartId))
  assert(
    orphans.length === 0,
    `no CartItem points at a missing Cart${orphans.length ? ` (orphans: ${orphans.map((o) => `${o.id}->${o.cartId}`).join(', ')})` : ''}`,
  )

  // FK cascade from Location. Deleting user-i's location must take cart-i and,
  // through Cart -> CartItem, cartitem-h with it.
  await prisma.location.delete({ where: { id: cartI!.locationId } })
  assert(
    (await prisma.cart.count({ where: { id: cartI!.id } })) === 0,
    'deleting a Location cascades to delete its Cart rows',
  )
  assert(
    (await prisma.cartItem.count({ where: { id: 'cartitem-h' } })) === 0,
    "deleting a Location cascades through Cart to its CartItem rows (cartitem-h's OWN userId is user-h, not user-i — the cascade follows the FK, not ownership)",
  )

  // Deleting user-j's location must take log-j with it, and must leave
  // user-a's log alone.
  await prisma.location.delete({ where: { id: logJ!.locationId } })
  assert(
    (await prisma.inventoryLog.count({ where: { id: 'log-j' } })) === 0,
    'deleting a Location cascades to delete its InventoryLog rows',
  )
  assert(
    (await prisma.inventoryLog.count({ where: { id: 'log-a' } })) === 1,
    "another user's log in another location is untouched by that cascade",
  )

  // FK cascade: deleting an Item must cascade-delete its ItemStock rows.
  // item-a2 (Eggs) has no other FK references (no CartItem/InventoryLog/tags
  // point at it), so deleting it exercises only the ItemStock cascade.
  await prisma.item.delete({ where: { id: 'item-a2' } })
  assert(
    (await prisma.itemStock.count({ where: { itemId: 'item-a2' } })) === 0,
    'deleting an Item cascades to delete its ItemStock rows',
  )

  console.log('\nMigration verified.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
