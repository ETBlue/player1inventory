// Verifies the Location/ItemStock migration against a REAL Postgres, because
// the resolver test suite runs entirely against a hand-written Prisma fake and
// cannot exercise SQL at all.
//
// Destructive: drops and recreates the public schema of TEST_DATABASE_URL —
// via TEST_DIRECT_URL, since Prisma Migrate always issues DDL through
// `directUrl` (see prisma/schema.prisma), never the pooled `url`.
// Refuses to run if TEST_DATABASE_URL or TEST_DIRECT_URL resolve — by parsed
// host + pathname, not raw string equality — to the same database as either
// DATABASE_URL or DIRECT_URL (dev). Raw equality would miss a pooled/direct
// or query-param variant of the same underlying database.
import { execSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
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
// TEN distinct users, one per union arm plus Item's two owners:
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
//
// Every one of the nine unioned tables (Item, TagType, Tag, Vendor, Recipe,
// Cart, CartItem, InventoryLog, Shelf) is exercised by an owner who appears
// in NO other table — deleting any single arm from the migration's UNION
// leaves exactly that user without a default location, and the coverage
// assertion below catches it.
const MILK_DUE_DATE = new Date('2026-09-15T00:00:00.000Z')

async function seedFixture(): Promise<void> {
  console.log('Seeding ten-user pre-migration fixture (covers all nine union arms)...')

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

  // Cart — user-i, standalone.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Cart" ("id","userId") VALUES ('cart-i','user-i')
  `)

  // CartItem — user-h. FKs borrow cart-i and item-a1, but its own userId is
  // a distinct owner from both.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "CartItem" ("id","cartId","itemId","quantity","userId") VALUES ('cartitem-h','cart-i','item-a1',1,'user-h')
  `)

  // InventoryLog — user-j. FK borrows item-a1, but its own userId is a
  // distinct owner.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "InventoryLog" ("id","itemId","delta","quantity","occurredAt","userId") VALUES ('log-j','item-a1',1,3,NOW(),'user-j')
  `)
}

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url))
const MIGRATION = '20260830000000_add_location_and_item_stock'
const MIGRATION_DIR = join(SERVER_DIR, 'prisma/migrations', MIGRATION)
const PARKED_DIR = join(SERVER_DIR, '.migration-under-test')

// Idempotent by construction: safe to call from a startup self-heal check,
// from the normal finally block, and from a SIGINT/SIGTERM handler, in any
// combination, without throwing on a directory that isn't there.
function restoreIfParked(): void {
  if (!existsSync(PARKED_DIR)) return
  if (existsSync(MIGRATION_DIR)) {
    // Both exist — a previous restore already succeeded but the parked copy
    // was never cleaned up (e.g. two restore calls raced). Trust the live
    // migration directory and discard the stale parked copy.
    console.log(`Both ${MIGRATION} and a stale parked copy exist — discarding the parked copy.`)
    rmSync(PARKED_DIR, { recursive: true, force: true })
    return
  }
  console.log(`Restoring parked ${MIGRATION}...`)
  renameSync(PARKED_DIR, MIGRATION_DIR)
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
  console.log(`Parking ${MIGRATION}...`)
  renameSync(MIGRATION_DIR, PARKED_DIR)
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

  console.log('Applying the migration under test...')
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
