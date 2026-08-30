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
