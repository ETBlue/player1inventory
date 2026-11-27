// Verifies the migrations listed in migrationDeploys.ts against a REAL Postgres, because the
// resolver test suite runs entirely against a hand-written Prisma fake and
// cannot exercise SQL at all.
//
// Ten migrations are under test, applied in order:
//   1. 20260830000000_add_location_and_item_stock      (PR 1)  — Location, ItemStock
//   2. 20260916000000_add_location_to_log_and_cart     (PR 3a) — InventoryLog.locationId,
//      Cart.locationId
//   3. 20260917000000_rekey_cart_to_location_vendor    (PR 3b) — splits the shared
//      'no-vendor' cart, then re-keys Cart.id to `${locationId}:${vendorId}`
//   4. 20261004000000_drop_item_stock_state_columns    (PR 5)  — drops Item's five
//      stock state columns, whose home is now ItemStock
//   5. 20261008000000_add_item_note_and_wikidata_url   (#335)  — adds Item.note and
//      Item.wikidataUrl, both nullable
//   6. 20261031000000_add_user                         (households H2) — a new,
//      empty "User" table keyed by the Clerk user id
//   7. 20261104000000_add_households                   (households H3a) — Household,
//      HouseholdMember, LocationMember, User.householdSetupAt, and a nullable
//      householdId on Location and the six catalog models, filled in for every row
//   8. 20261111000000_drop_user_scope                  (households H3a, task 3.14) —
//      re-runs 7's backfill for rows written between the two deploys, cleans up
//      references that cross households, then sets householdId NOT NULL and
//      drops userId (seven tables) and Location.isDefault
//   9. 20261114000000_shared_carts                     (households H3b, task B.3) —
//      merges CartItem rows with the same (cartId, itemId), adds the unique
//      index on that pair, drops CartItem_cartId_idx, and drops Cart.userId
//  10. 20261118000000_add_household_invites            (households H5b, task G.1) —
//      a new, empty "HouseholdInvite" table and a nullable
//      "User"."activeHouseholdId". Additive only
//  11. 20261120000000_add_household_activity           (households H6, task J.1) —
//      one enum and a new, empty "HouseholdActivity" table. Additive only
//  12. 20261120100000_add_ownership_offers             (households H6b, task K.1) —
//      one enum and a new, empty "OwnershipOffer" table. Additive only
//  13. 20261122000000_add_location_preferences         (households H7b, task M.1) —
//      one enum, the nullable "User"."locationSort" and "Location"."dataUpdatedAt",
//      ONE backfill of "dataUpdatedAt" from "ItemStock", and a new, empty
//      "LocationPreference" table
// Thirteen migrations, then. This count and the list in migrationDeploys.ts must agree.
// (It said "Ten" until H7b task M.1, after H6 and H6b had added two more
// without changing it. It said "Eight" until H3b task B.3, and "Nine" until H5b task G.1, while
// the line above it already said "Eight" again.) The comment said "Four"
// for a while after entry 5 was added, so check the array rather than trusting
// this line.
// Migration 7 reads the "User" table that 6 creates. So it is applied in a
// second `migrate deploy`, after a second seed step writes two "User" rows.
// See seedUsersBeforeHouseholds below for why.
// Migration 8 is applied in a THIRD `migrate deploy`. Between 7 and 8 the
// script asserts every block that reads "userId" or "isDefault" (both are gone
// after 8), then writes what the OLD server could write between the two
// deploys in production. See seedBetweenDeploys.
// Migration 9 is applied in a FOURTH `migrate deploy`, after
// seedSharedCartDuplicates writes duplicate cart rows. Those rows cannot be
// written once 9 has run: its unique index refuses them.
// Migration 10 is applied by that same fourth deploy. It needs no seed step
// of its own: it only adds, and its one data claim ("every existing person
// reads NULL") is about the rows the earlier steps wrote. Because it is the
// last to run, every "User" read before the fourth deploy needs an explicit
// `select` (the Prisma client is generated from the final schema).
// Which migration goes in which deploy is listed in `migrationDeploys.ts`,
// and `migrationDeploys.test.ts` checks that list with no database.
// Migration 6 is not a location migration and depends on none of the others.
// It is parked with them anyway. Left unparked, `migrate reset` would apply it
// BEFORE migrations 1-5, which is not the order production applies them in.
// All of them must be parked together. Each one references what the previous one
// creates, so resetting with only some of them parked would fail at reset time.
// Migration 4 depends on 1 in the other direction too: it destroys the data
// that 1's backfill reads, so parking 4 alone would reset to a database where
// Item has no such columns and 1's backfill could not compile.
//
// Destructive: drops and recreates the public schema of TEST_DATABASE_URL —
// via TEST_DIRECT_URL, since Prisma Migrate always issues DDL through
// `directUrl` (see prisma/schema.prisma), never the pooled `url`.
// Refuses to run if TEST_DATABASE_URL or TEST_DIRECT_URL resolve — by parsed
// host + pathname, not raw string equality — to the same database as ANY other
// environment variable whose name ends in `_URL`. Raw equality would miss a
// pooled/direct or query-param variant of the same underlying database. The
// check lives in `scripts/databaseIsolation.ts` and is unit-tested in
// `scripts/databaseIsolation.test.ts`.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Prisma, PrismaClient } from '@prisma/client'
import { assertNotAnotherDatabase } from './databaseIsolation.js'
import { MIGRATIONS, migrationsOfDeploy } from './migrationDeploys.js'

const TEST_URL = process.env.TEST_DATABASE_URL
const TEST_DIRECT = process.env.TEST_DIRECT_URL

if (!TEST_URL || !TEST_DIRECT) {
  throw new Error('TEST_DATABASE_URL and TEST_DIRECT_URL must be set (see .env.example)')
}

// The guard against dropping the wrong database's schema. Both TEST_* URLs are
// checked, because Prisma Migrate issues all DDL through `directUrl` and uses
// the pooled `url` only for the query engine — so checking only
// TEST_DATABASE_URL against the others (the original guard) misses the
// connection that actually issues the destructive DDL.
//
// See `scripts/databaseIsolation.ts` for which variables are compared and why,
// and `scripts/databaseIsolation.test.ts` for the cases it is proved against.
assertNotAnotherDatabase('TEST_DATABASE_URL', TEST_URL, process.env)
assertNotAnotherDatabase('TEST_DIRECT_URL', TEST_DIRECT, process.env)

const env = { ...process.env, DATABASE_URL: TEST_URL, DIRECT_URL: TEST_DIRECT }
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } })

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  ok — ${message}`)
}

// The five columns PR 5 drops from "Item". "ItemStock" declares the same five
// names and keeps them — see the PR 5 assertions at the end of main().
const STOCK_STATE_COLUMNS = [
  'targetQuantity',
  'refillThreshold',
  'packedQuantity',
  'unpackedQuantity',
  'dueDate',
] as const

// The column names a table actually has, read from the catalog.
//
// A dropped column has to be checked this way round. `SELECT "dueDate" FROM
// "Item"` on a table without it throws Postgres 42703 before `assert` is ever
// reached, so the run fails with a raw driver error instead of a named FAIL —
// and a FAIL that names the column is the whole point of this script.
// The ::text casts matter: information_schema's columns are the
// `sql_identifier` domain, a type Prisma's raw-query mapper does not know.
async function columnNamesOf(table: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name::text AS column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name::text = ${table}
  `
  return new Set(rows.map((r) => r.column_name))
}

// One column's type and nullability, read from the catalog. Returns undefined
// when the column does not exist, so a caller can assert on "missing" without
// a raw driver error.
//
// Same two rules as `columnNamesOf` above: read the catalog rather than running
// a `SELECT` on a column that may not be there, and cast every identifier
// column with `::text`, because information_schema uses the `sql_identifier`
// domain and Prisma's raw-query mapper does not know it.
async function columnMetaOf(
  table: string,
  column: string,
): Promise<{ dataType: string; isNullable: string } | undefined> {
  const rows = await prisma.$queryRaw<{ data_type: string; is_nullable: string }[]>`
    SELECT data_type::text AS data_type, is_nullable::text AS is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name::text = ${table}
      AND column_name::text = ${column}
  `
  const row = rows[0]
  return row ? { dataType: row.data_type, isNullable: row.is_nullable } : undefined
}

// "Location" as it is BEFORE drop_user_scope, with the two columns that
// migration drops: "userId" and "isDefault". Read with raw SQL because the
// Prisma client is generated from the FINAL schema, which has neither, so
// `prisma.location` cannot select them. Only valid between add_households and
// drop_user_scope: the blocks that call it run in that window (see main()).
interface LegacyLocation {
  id: string
  name: string
  order: number
  isDefault: boolean
  userId: string
  householdId: string | null
}

async function legacyLocations(): Promise<LegacyLocation[]> {
  return prisma.$queryRaw<LegacyLocation[]>`
    SELECT "id", "name", "order", "isDefault", "userId", "householdId"
    FROM "Location" ORDER BY "userId", "id"
  `
}

async function legacyLocationsById(): Promise<Map<string, LegacyLocation>> {
  return new Map((await legacyLocations()).map((l) => [l.id, l]))
}

// "Cart" as it is BEFORE shared_carts, with the "userId" column that
// migration drops. Raw SQL for the same reason as `legacyLocations`: the
// Prisma client is generated from the FINAL schema, so `prisma.cart` cannot
// select "userId". Only valid before shared_carts.
interface LegacyCart {
  id: string
  userId: string
  locationId: string
  lastPurchasedAt: Date | null
}

async function legacyCarts(): Promise<LegacyCart[]> {
  return prisma.$queryRaw<LegacyCart[]>`
    SELECT "id", "userId", "locationId", "lastPurchasedAt" FROM "Cart" ORDER BY "id"
  `
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

// The thirteen users seedFixture writes, each of whom owns data. Module scope
// because assertHouseholdsBackfill reads it as well as main().
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

// The second seed step, for add_households (households H3a).
//
// seedFixture above runs BEFORE add_user, when there is no "User" table, so it
// cannot write a "User" row. But two of add_households' cases need one:
//
//   user-a      has data AND a "User" row, with a real name that contains an
//               apostrophe: "Ann O'Neil". The migration must keep this row and
//               its name (step 2 adds rows only for ids with no row), and the
//               household must be "Ann O'Neil's Household". Every other seeded
//               user has data and NO "User" row, so they get one named 'User'.
//               With only that kind of user, a migration that renamed every
//               user to 'User', or ignored existing rows, would still pass.
//   user-empty  has a "User" row and NO data at all (decision H2): a person who
//               signed in once and saved nothing. They must get a household and
//               exactly one 'Home' location. No other seeded user can show this,
//               because every one of them owns data, so each already has a
//               location from migration 1's backfill.
//
// So main() applies migrations 1-6, runs this, then applies add_households
// alone. This is the order production sees too: add_user is deployed, users
// sign in and get "User" rows, and only then does add_households run.
//
// Raw SQL on purpose. The Prisma client is generated from the FINAL schema, so
// prisma.user.create would ask for "householdSetupAt" in its RETURNING clause,
// and that column does not exist until add_households runs.
const NAMED_USER_ID = 'user-a'
const NAMED_USER_NAME = "Ann O'Neil"
const NO_DATA_USER_ID = 'user-empty'
const NO_DATA_USER_NAME = 'Nobody'

async function seedUsersBeforeHouseholds(): Promise<void> {
  console.log('Seeding two "User" rows before add_households (one with data, one without)...')
  await prisma.$executeRaw`
    INSERT INTO "User" ("id","displayName","createdAt","updatedAt") VALUES
      (${NAMED_USER_ID}, ${NAMED_USER_NAME}, NOW(), NOW()),
      (${NO_DATA_USER_ID}, ${NO_DATA_USER_NAME}, NOW(), NOW())
  `
}

// References that will cross households after the backfill, for the count
// query in add_households' step 8b. Before 2026-11-04 the server did not check
// that a reference named the caller's own row, so production may hold rows
// like these (docs/global/bugs/2026-11-04-bug-unscoped-catalog-writes.md).
//
// seedFixture already has one: tag-g (user-g) names tt-c (user-c) as its type.
// This step adds one more crossing row for each of the other four kinds, and a
// SAME-household row next to each kind as a control. A query that counted
// every row, not only crossing ones, would then report too many.
//
//   kind          crossing (counted)                     same household (not counted)
//   Tag.typeId    tag-g -> tt-c (seedFixture),           tag-c1, tag-c2 -> tt-c (all user-c)
//                 tag-a1, tag-a2 (user-a) -> tt-c (user-c)
//   Tag.parentId  tag-c1 (user-c) -> tag-g (user-g)      tag-c2 -> tag-c1 (both user-c)
//   ItemTag       item-a1 (user-a) + tag-g (user-g)      item-a1 + tag-a1 (both user-a)
//   ItemVendor    item-b1 (user-b) + vendor-d (user-d)   item-a1 + vendor-a (both user-a)
//   RecipeItem    recipe-e (user-e) + item-b1 (user-b)   recipe-a + item-a1 (both user-a)
//
// Tag.typeId counts 3 and every other kind 1, so a query that put one kind's
// count under another kind's label fails too.
//
// tag-a2 was added for drop_user_scope's cleanup (task 3.14, owner's choice
// A1): tag-a1 and tag-a2 are TWO tags of one household that use ONE foreign
// type, so the cleanup must make one copy of tt-c for user-a's household, not
// two. See assertDropUserScope.
//
// Only existing users, on purpose. A new user would add a "User" row, a
// household and a 'Home' location, and the backfill checks count those. And
// item-a2 gets no reference: the PR 1 block deletes it to test ONE cascade.
// No check deletes the households of user-a, -b, -c, -d, -e or -g, so these
// rows block nothing (a crossing Tag.typeId blocks deleting tt-c's household).
const EXPECTED_CROSS_HOUSEHOLD_COUNTS: Record<string, number> = {
  'Tag.typeId': 3,
  'Tag.parentId': 1,
  ItemTag: 1,
  ItemVendor: 1,
  RecipeItem: 1,
}

async function seedCrossHouseholdReferences(): Promise<void> {
  console.log('Seeding references that cross households after the backfill, and their controls...')
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Tag" ("id","name","typeId","userId","parentId") VALUES
      ('tag-a1','Fresh','tt-c','user-a',NULL),
      ('tag-a2','Ripe','tt-c','user-a',NULL),
      ('tag-c1','Chilled','tt-c','user-c','tag-g'),
      ('tag-c2','Frozen','tt-c','user-c','tag-c1')
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "ItemTag" ("itemId","tagId") VALUES ('item-a1','tag-g'), ('item-a1','tag-a1')
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Vendor" ("id","name","userId") VALUES ('vendor-a','Corner Shop','user-a')
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "ItemVendor" ("itemId","vendorId") VALUES ('item-b1','vendor-d'), ('item-a1','vendor-a')
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Recipe" ("id","name","userId") VALUES ('recipe-a','Omelette','user-a')
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "RecipeItem" ("recipeId","itemId","defaultAmount") VALUES
      ('recipe-e','item-b1',1), ('recipe-a','item-a1',2)
  `)
}

// The count query of add_households' step 8b, read from the migration file
// between its two marker lines. Running the file's own text, not a copy, means
// this check tests the query the migration really runs.
function crossHouseholdQueryFromMigration(): string {
  const sql = readFileSync(join(migrationDir(HOUSEHOLDS_MIGRATION), 'migration.sql'), 'utf8')
  const begin = '-- cross-household-references:begin'
  const end = '-- cross-household-references:end'
  const from = sql.indexOf(begin)
  const to = sql.indexOf(end)
  if (from < 0 || to < from) {
    throw new Error(`FAIL: the markers "${begin}" and "${end}" are missing from ${HOUSEHOLDS_MIGRATION}`)
  }
  return sql.slice(from + begin.length, to)
}

// The seven tables that gain a nullable "householdId" in add_households, and
// the four tables that must NOT gain one. Cart, CartItem and InventoryLog keep
// "userId" (it means the author now), and ItemStock is scoped through its
// location. A migration that added the column to the wrong table would pass a
// "present" check alone (apps/server/prisma/CLAUDE.md, "An ADD COLUMN needs the
// same two halves").
const HOUSEHOLD_SCOPED_TABLES = [
  'Location',
  'Item',
  'Tag',
  'TagType',
  'Vendor',
  'Recipe',
  'Shelf',
] as const
const NOT_HOUSEHOLD_SCOPED_TABLES = ['ItemStock', 'Cart', 'CartItem', 'InventoryLog'] as const

// ══════════════════════════════════════════════════════════════════════
// 20261104000000 — households, part 1: the backfill (households H3a)
// ══════════════════════════════════════════════════════════════════════
//
// Read-only. main() calls this right after add_households is deployed, before
// any other block writes a row, and before drop_user_scope. It reads
// "Location"."userId" and "isDefault", which drop_user_scope removes, through
// `legacyLocations`. Fourteen users exist at this point: the thirteen
// seedFixture users, all with data, and user-empty, with a "User" row and no
// data. Of the thirteen, only user-a had a "User" row before the migration.
async function assertHouseholdsBackfill(): Promise<void> {
  console.log('add_households — the backfill:')
  const allUserIds = [...EXPECTED_USER_IDS, NO_DATA_USER_ID]

  // ── Step 2: a "User" row for every userId in the data ──
  //
  // An explicit `select` on every "User" read that runs before the LAST
  // deploy. The Prisma client is generated from the FINAL schema, so a read
  // with no `select` asks for "activeHouseholdId", which add_household_invites
  // adds, and Postgres refuses it (P2022) at this point.
  const users = await prisma.user.findMany({
    select: { id: true, displayName: true, householdSetupAt: true },
  })
  assert(
    users.length === allUserIds.length && allUserIds.every((id) => users.some((u) => u.id === id)),
    `there is one "User" row for each of the ${allUserIds.length} users and no other (read: ${users.length})`,
  )
  const namedUser = users.find((u) => u.id === NAMED_USER_ID)
  assert(
    namedUser?.displayName === NAMED_USER_NAME,
    `${NAMED_USER_ID}'s existing "User" row keeps its name "${NAMED_USER_NAME}" — the migration adds rows only for ids with no row (read: ${namedUser?.displayName})`,
  )
  const createdUsers = users.filter((u) => u.id !== NAMED_USER_ID && u.id !== NO_DATA_USER_ID)
  assert(
    createdUsers.length === EXPECTED_USER_IDS.length - 1 &&
      createdUsers.every((u) => u.displayName === 'User'),
    `the ${EXPECTED_USER_IDS.length - 1} users found only in the data get a "User" row named 'User' (decision H2)`,
  )

  // ── Step 3: one household per user, named after them, owned by them ──
  const households = await prisma.household.findMany({ include: { members: true } })
  assert(
    households.length === allUserIds.length,
    `one Household per "User" row: ${allUserIds.length} (read: ${households.length})`,
  )
  for (const user of users) {
    const own = households.filter((h) => h.ownerId === user.id)
    const household = own[0]
    const expectedName = `${user.displayName}'s Household`
    assert(
      own.length === 1 &&
        household?.name === expectedName &&
        household.members.length === 1 &&
        household.members[0]?.userId === user.id &&
        household.members[0]?.role === 'owner',
      `${user.id} has exactly one household, named "${expectedName}", and is its only member, with role owner (read: ${own.length} household(s), name ${household?.name}, members ${household?.members.map((m) => `${m.userId}/${m.role}`).join(', ')})`,
    )
  }
  const householdOfUser = new Map(households.map((h) => [h.ownerId, h.id]))

  // ── Step 7: every user is marked as set up ──
  assert(
    users.every((u) => u.householdSetupAt !== null),
    'every user with a household has householdSetupAt set, so first sign-in will not make a second one (decision H1)',
  )

  // ── Step 4: user-empty got exactly one 'Home'; nobody else got one ──
  const legacy = await legacyLocations()
  const homes = legacy.filter((l) => l.userId === NO_DATA_USER_ID)
  const home = homes[0]
  assert(
    homes.length === 1 &&
      home?.name === 'Home' &&
      home.order === 0 &&
      home.isDefault &&
      home.householdId === householdOfUser.get(NO_DATA_USER_ID),
    `${NO_DATA_USER_ID}, who has no data, gets exactly one location: 'Home', order 0, isDefault, in their own household (read: ${homes.map((l) => `${l.name}/${l.order}/${l.isDefault}`).join(', ')})`,
  )
  assert(
    (await prisma.location.count({ where: { name: 'Home' } })) === 1,
    "no user who already had a location gets a 'Home' as well",
  )

  // ── Step 5: the seven tables. No null householdId; each row is in its owner's household ──
  //
  // Each table has at least one seeded row, so these checks cannot pass on an
  // empty table. "Location" and "Item" have rows from several owners, so a
  // backfill that wrote one household into every row fails on them. The join
  // compares each row's household owner with the row's own "userId".
  // $queryRawUnsafe because a table name cannot be a bound parameter; the
  // names come from the constant list above, never from input.
  for (const table of HOUSEHOLD_SCOPED_TABLES) {
    const rows = await prisma.$queryRawUnsafe<{ total: bigint; nulls: bigint; wrong: bigint }[]>(`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE t."householdId" IS NULL) AS nulls,
             count(*) FILTER (WHERE h."ownerId" IS DISTINCT FROM t."userId") AS wrong
      FROM "${table}" t
      LEFT JOIN "Household" h ON h."id" = t."householdId"
    `)
    const r = rows[0]
    assert(
      r !== undefined && r.total > 0n && r.nulls === 0n && r.wrong === 0n,
      `"${table}": every row has a householdId, and it is the household its userId owns (read: ${r?.total} rows, ${r?.nulls} null, ${r?.wrong} in the wrong household)`,
    )
  }

  // ── The column itself: nullable text on the seven, absent on the four ──
  for (const table of HOUSEHOLD_SCOPED_TABLES) {
    const meta = await columnMetaOf(table, 'householdId')
    assert(
      meta?.dataType === 'text' && meta?.isNullable === 'YES',
      `"${table}"."householdId" is nullable text until drop_user_scope (decision H16) (read: ${meta ? `${meta.dataType}, nullable=${meta.isNullable}` : 'column missing'})`,
    )
    assert(
      (await columnNamesOf(table)).has('userId'),
      `"${table}"."userId" is still there — add_households keeps it (decision H16)`,
    )
  }
  for (const table of NOT_HOUSEHOLD_SCOPED_TABLES) {
    assert(
      !(await columnNamesOf(table)).has('householdId'),
      `"${table}" has NO householdId — it is scoped through its location or keeps its userId`,
    )
  }

  // ── Step 6: every location has its owner as organizer, and no one else ──
  const ownerOf = new Map(legacy.map((l) => [l.id, l.userId]))
  // An explicit `select` on every "Location" read that runs before the LAST
  // deploy (households H7b task M.1). The Prisma client is generated from the
  // FINAL schema, so a read or a delete with no `select` asks for
  // "dataUpdatedAt", which add_location_preferences adds, and Postgres refuses
  // it (P2022) at this point. The same rule as for "User" in
  // assertHouseholdsBackfill.
  const locations = await prisma.location.findMany({ select: { id: true, members: true } })
  const badLocations = locations.filter(
    (l) =>
      l.members.length !== 1 ||
      l.members[0]?.userId !== ownerOf.get(l.id) ||
      l.members[0]?.role !== 'organizer',
  )
  assert(
    locations.length === allUserIds.length && badLocations.length === 0,
    `each of the ${allUserIds.length} locations has exactly one LocationMember: its own userId, as organizer${badLocations.length ? ` (wrong: ${badLocations.map((l) => l.id).join(', ')})` : ''}`,
  )

  // ── Step 8b: the count of references that cross households ──
  //
  // The migration reports these counts with RAISE NOTICE, which this script
  // cannot read. So it runs the same query, taken from the migration file, and
  // checks the counts against the rows seedCrossHouseholdReferences wrote. See
  // there for the crossing rows and the same-household controls.
  const crossRows = await prisma.$queryRawUnsafe<{ ref: string; n: number }[]>(
    crossHouseholdQueryFromMigration(),
  )
  const crossCounts = Object.fromEntries(crossRows.map((r) => [r.ref, Number(r.n)]))
  const expectedKinds = Object.keys(EXPECTED_CROSS_HOUSEHOLD_COUNTS).sort()
  assert(
    JSON.stringify(Object.keys(crossCounts).sort()) === JSON.stringify(expectedKinds) &&
      expectedKinds.every((k) => crossCounts[k] === EXPECTED_CROSS_HOUSEHOLD_COUNTS[k]),
    `step 8b's query counts only the references that cross households: ${JSON.stringify(EXPECTED_CROSS_HOUSEHOLD_COUNTS)} (read: ${JSON.stringify(crossCounts)})`,
  )
}

// ══════════════════════════════════════════════════════════════════════
// 20261104000000 — households, part 2: constraints and the race guard
// ══════════════════════════════════════════════════════════════════════
//
// These write rows, so main() calls this at the end, after drop_user_scope. Each check uses users
// and households it creates itself, except the owner-index check, which uses
// user-a's household and a new user.
async function assertHouseholdsConstraints(): Promise<void> {
  console.log('add_households — constraints and the first sign-in race guard:')

  // ── HouseholdMember_one_owner_key: one owner per household (decision H15) ──
  //
  // user-second has no row in user-a's household, so the primary key
  // (householdId, userId) cannot be what rejects the first insert. Only the
  // partial index can.
  const householdA = await prisma.household.findFirstOrThrow({ where: { ownerId: NAMED_USER_ID } })
  await prisma.user.create({ data: { id: 'user-second', displayName: 'Second' } })
  let secondOwnerCode: string | undefined
  try {
    await prisma.householdMember.create({
      data: { householdId: householdA.id, userId: 'user-second', role: 'owner' },
    })
  } catch (err) {
    secondOwnerCode = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined
  }
  assert(
    secondOwnerCode === 'P2002',
    `a second owner row for one household is rejected with P2002 (HouseholdMember_one_owner_key) (read: ${secondOwnerCode})`,
  )
  // The other half: the index is PARTIAL. A unique index on "householdId"
  // alone, or on ("householdId", "role"), would reject this second
  // non-owner row too, or a third.
  await prisma.householdMember.create({
    data: { householdId: householdA.id, userId: 'user-second', role: 'manager' },
  })
  assert(
    (await prisma.householdMember.count({ where: { householdId: householdA.id } })) === 2,
    'a second member who is NOT an owner is allowed — the index covers only role owner',
  )

  // ── The first sign-in race guard (decision H1) ──
  //
  // Two separate PrismaClients, so two separate database connections. One
  // client could run both transactions on one connection, one after the
  // other, and then nothing would race.
  //
  // Transaction A runs the claim and stays open. Transaction B then runs the
  // same claim. Postgres makes B wait for A's row lock. The script waits until
  // it can SEE that A is blocking B, and only then lets A commit. When A
  // commits, B re-checks its WHERE against the committed row and matches 0
  // rows.
  //
  // Each transaction reads its own backend pid with pg_backend_pid() as its
  // first statement. Inside the transaction on purpose: with a pooled
  // connection, the backend is fixed only for the length of one transaction.
  // The script then polls pg_blocking_pids(pid of B) until it contains the pid
  // of A. That names this exact pair. Counting "any lock not granted" in
  // pg_locks would also count a wait in some other session on the shared test
  // database.
  const raceUserId = 'user-race'
  await prisma.user.create({ data: { id: raceUserId, displayName: 'Race' } })
  const clientA = new PrismaClient({ datasources: { db: { url: TEST_URL } } })
  const clientB = new PrismaClient({ datasources: { db: { url: TEST_URL } } })
  let releaseA: () => void = () => {}
  try {
    await Promise.all([clientA.$connect(), clientB.$connect()])
    const aMayCommit = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    let reportPidA: (pid: number) => void = () => {}
    const aClaimed = new Promise<number>((resolve) => {
      reportPidA = resolve
    })
    let reportPidB: (pid: number) => void = () => {}
    const bStarted = new Promise<number>((resolve) => {
      reportPidB = resolve
    })
    const txOptions = { maxWait: 10_000, timeout: 30_000 }
    const backendPid = async (tx: Prisma.TransactionClient): Promise<number> => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
      const pid = rows[0]?.pid
      if (typeof pid !== 'number') throw new Error(`FAIL: pg_backend_pid() returned ${String(pid)}`)
      return pid
    }
    // The claim, written exactly as ensureHousehold in src/lib/household.ts
    // writes it: Prisma's updateMany with the same where. scripts/ must not
    // import from src, so the call is repeated here. Keep the two the same.
    // If ensureHousehold's claim changes, change this one too, or this proof
    // stops being about the code that runs.
    const claim = (tx: Prisma.TransactionClient) =>
      tx.user.updateMany({
        where: { id: raceUserId, householdSetupAt: null },
        data: { householdSetupAt: new Date() },
      })

    const txA = clientA.$transaction(async (tx) => {
      const pid = await backendPid(tx)
      const { count } = await claim(tx)
      reportPidA(pid)
      await aMayCommit
      return count
    }, txOptions)
    // txA cannot finish before releaseA() is called, so if it wins this race
    // it failed, and the race passes its error on.
    const pidA = await Promise.race([aClaimed, txA])

    let bSettled = false
    const txB = clientB.$transaction(async (tx) => {
      reportPidB(await backendPid(tx))
      const { count } = await claim(tx)
      return count
    }, txOptions)
    txB.then(
      () => {
        bSettled = true
      },
      () => {
        bSettled = true
      },
    )
    // Same shape as above: if txB settles first, it failed before its pid.
    const pidB = await Promise.race([bStarted, txB])

    // At most 50 polls, 200 ms apart: about 10 seconds.
    let aBlocksB = false
    let polls = 0
    for (; polls < 50 && !aBlocksB && !bSettled; polls++) {
      const rows = await prisma.$queryRaw<{ blocked: boolean }[]>`
        SELECT ${pidA}::int = ANY(pg_blocking_pids(${pidB}::int)) AS blocked`
      aBlocksB = rows[0]?.blocked === true
      if (!aBlocksB) await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert(
      aBlocksB,
      aBlocksB
        ? `the second claim (pid ${pidB}) WAITED for the first transaction (pid ${pidA}), so the two really overlapped`
        : `the second claim (pid ${pidB}) was never seen blocked by the first transaction (pid ${pidA}) after ${polls} polls, about ${polls * 0.2} s. ${bSettled ? 'B finished before A committed, so the claim did not wait for the row lock.' : 'B is still running: it may be waiting on something else.'}`,
    )

    releaseA()
    const [countA, countB] = await Promise.all([txA, txB])
    assert(
      countA === 1 && countB === 0,
      `exactly one of two overlapping claims wins: the first updates 1 row, the second 0 (read: ${countA} and ${countB})`,
    )
    const raced = await prisma.user.findUniqueOrThrow({ where: { id: raceUserId } })
    assert(raced.householdSetupAt !== null, 'the claimed user has householdSetupAt set')
  } finally {
    releaseA()
    await Promise.all([clientA.$disconnect(), clientB.$disconnect()])
  }

  // ── Deleting a household deletes everything in it ──
  //
  // Every householdId foreign key is ON DELETE CASCADE, and the tables below
  // them cascade from those rows. "Tag_typeId_fkey" is NO ACTION (changed from
  // RESTRICT in this migration): the type and its tags go in the same
  // statement. Since H3a task 3.10, `/e2e/cleanup` deletes households too,
  // but it deletes every child row itself first, so it never relies on the
  // cascade. Until H6 this is the only place the cascade itself runs.
  //
  // The fixture has at least one row in each of the 17 tables a household
  // reaches, including a tag with a parent tag. For each table the check:
  //   1. collects the ids of this household's rows BEFORE the delete, and
  //      requires at least one (so no table can pass by being empty);
  //   2. after the delete, counts rows by those ids, which must be 0. By id,
  //      not by householdId: a foreign key that set householdId to NULL instead
  //      of cascading would leave rows that a householdId filter cannot see;
  //   3. checks the table's total went down by exactly that many, so the
  //      cascade removed nothing from other households.
  const cascadeUser = 'user-cascade'
  await prisma.user.create({ data: { id: cascadeUser, displayName: 'Cascade' } })
  const doomed = await prisma.household.create({
    data: {
      name: "Cascade's Household",
      ownerId: cascadeUser,
      members: { create: { userId: cascadeUser, role: 'owner' } },
    },
  })
  // The six catalog models and "Location" carry only "householdId" since
  // drop_user_scope. "CartItem" and "InventoryLog" keep "userId"; "Cart" has
  // none since shared_carts (this runs after it).
  const scope = { householdId: doomed.id }
  const tagType = await prisma.tagType.create({ data: { name: 'Kind', color: 'red', ...scope } })
  const parentTag = await prisma.tag.create({ data: { name: 'Dairy', typeId: tagType.id, ...scope } })
  const childTag = await prisma.tag.create({
    data: { name: 'Cheese', typeId: tagType.id, parentId: parentTag.id, ...scope },
  })
  const item = await prisma.item.create({ data: { name: 'Butter', targetUnit: 'package', ...scope } })
  await prisma.itemTag.create({ data: { itemId: item.id, tagId: childTag.id } })
  const vendor = await prisma.vendor.create({ data: { name: 'Shop', ...scope } })
  await prisma.itemVendor.create({ data: { itemId: item.id, vendorId: vendor.id } })
  const recipe = await prisma.recipe.create({ data: { name: 'Toast', ...scope } })
  await prisma.recipeItem.create({ data: { recipeId: recipe.id, itemId: item.id, defaultAmount: 1 } })
  await prisma.shelf.create({ data: { name: 'Top', type: 'manual', order: 0, itemIds: [], ...scope } })
  const location = await prisma.location.create({
    data: { name: 'Cellar', order: 0, ...scope, members: { create: { userId: cascadeUser, role: 'organizer' } } },
  })
  await prisma.itemStock.create({ data: { itemId: item.id, locationId: location.id } })
  const cart = await prisma.cart.create({
    data: { id: `${location.id}:no-vendor`, locationId: location.id },
  })
  await prisma.cartItem.create({ data: { cartId: cart.id, itemId: item.id, quantity: 1, userId: cascadeUser } })
  await prisma.inventoryLog.create({
    data: { itemId: item.id, locationId: location.id, delta: 1, quantity: 1, occurredAt: new Date(), userId: cascadeUser },
  })

  // One entry per table: how to count all its rows, and how to count this
  // household's rows by the ids collected before the delete.
  const h = doomed.id
  const ids = {
    tagTypes: (await prisma.tagType.findMany({ where: { householdId: h } })).map((r) => r.id),
    tags: (await prisma.tag.findMany({ where: { householdId: h } })).map((r) => r.id),
    items: (await prisma.item.findMany({ where: { householdId: h } })).map((r) => r.id),
    vendors: (await prisma.vendor.findMany({ where: { householdId: h } })).map((r) => r.id),
    recipes: (await prisma.recipe.findMany({ where: { householdId: h } })).map((r) => r.id),
    shelves: (await prisma.shelf.findMany({ where: { householdId: h } })).map((r) => r.id),
    locations: (await prisma.location.findMany({ where: { householdId: h } })).map((r) => r.id),
  }
  const carts = (await prisma.cart.findMany({ where: { locationId: { in: ids.locations } } })).map((r) => r.id)
  const cartItems = (await prisma.cartItem.findMany({ where: { cartId: { in: carts } } })).map((r) => r.id)
  const logs = (await prisma.inventoryLog.findMany({ where: { locationId: { in: ids.locations } } })).map(
    (r) => r.id,
  )
  const tables: Record<string, { total: () => Promise<number>; mine: () => Promise<number> }> = {
    Household: { total: () => prisma.household.count(), mine: () => prisma.household.count({ where: { id: h } }) },
    HouseholdMember: {
      total: () => prisma.householdMember.count(),
      mine: () => prisma.householdMember.count({ where: { householdId: h } }),
    },
    TagType: { total: () => prisma.tagType.count(), mine: () => prisma.tagType.count({ where: { id: { in: ids.tagTypes } } }) },
    Tag: { total: () => prisma.tag.count(), mine: () => prisma.tag.count({ where: { id: { in: ids.tags } } }) },
    Item: { total: () => prisma.item.count(), mine: () => prisma.item.count({ where: { id: { in: ids.items } } }) },
    ItemTag: { total: () => prisma.itemTag.count(), mine: () => prisma.itemTag.count({ where: { itemId: { in: ids.items } } }) },
    Vendor: { total: () => prisma.vendor.count(), mine: () => prisma.vendor.count({ where: { id: { in: ids.vendors } } }) },
    ItemVendor: {
      total: () => prisma.itemVendor.count(),
      mine: () => prisma.itemVendor.count({ where: { itemId: { in: ids.items } } }),
    },
    Recipe: { total: () => prisma.recipe.count(), mine: () => prisma.recipe.count({ where: { id: { in: ids.recipes } } }) },
    RecipeItem: {
      total: () => prisma.recipeItem.count(),
      mine: () => prisma.recipeItem.count({ where: { recipeId: { in: ids.recipes } } }),
    },
    Shelf: { total: () => prisma.shelf.count(), mine: () => prisma.shelf.count({ where: { id: { in: ids.shelves } } }) },
    Location: {
      total: () => prisma.location.count(),
      mine: () => prisma.location.count({ where: { id: { in: ids.locations } } }),
    },
    LocationMember: {
      total: () => prisma.locationMember.count(),
      mine: () => prisma.locationMember.count({ where: { locationId: { in: ids.locations } } }),
    },
    ItemStock: {
      total: () => prisma.itemStock.count(),
      mine: () => prisma.itemStock.count({ where: { locationId: { in: ids.locations } } }),
    },
    Cart: { total: () => prisma.cart.count(), mine: () => prisma.cart.count({ where: { id: { in: carts } } }) },
    CartItem: { total: () => prisma.cartItem.count(), mine: () => prisma.cartItem.count({ where: { id: { in: cartItems } } }) },
    InventoryLog: {
      total: () => prisma.inventoryLog.count(),
      mine: () => prisma.inventoryLog.count({ where: { id: { in: logs } } }),
    },
  }
  const before: Record<string, { total: number; mine: number }> = {}
  for (const [name, t] of Object.entries(tables)) before[name] = { total: await t.total(), mine: await t.mine() }
  const emptyBefore = Object.entries(before).filter(([, b]) => b.mine === 0)
  assert(
    emptyBefore.length === 0 && before.Tag?.mine === 2,
    `the household to delete has rows in all ${Object.keys(tables).length} tables, and two tags, one the parent of the other${emptyBefore.length ? ` (empty: ${emptyBefore.map(([k]) => k).join(', ')})` : ''}`,
  )

  let deleteError: string | undefined
  try {
    await prisma.household.delete({ where: { id: h } })
  } catch (err) {
    deleteError = err instanceof Error ? err.message : String(err)
  }
  assert(deleteError === undefined, `deleting the household succeeds (error: ${deleteError})`)

  const wrong: string[] = []
  for (const [name, t] of Object.entries(tables)) {
    const b = before[name]
    const mine = await t.mine()
    const total = await t.total()
    if (b === undefined || mine !== 0 || total !== b.total - b.mine) {
      wrong.push(`${name}: ${mine} of its ${b?.mine} rows left, total ${b?.total} -> ${total}`)
    }
  }
  assert(
    wrong.length === 0,
    `deleting a household deletes every one of its rows in all ${Object.keys(tables).length} tables, and no row of any other household${wrong.length ? ` (wrong: ${wrong.join('; ')})` : ''}`,
  )
  assert(
    (await prisma.user.count({ where: { id: cascadeUser } })) === 1,
    'the owner\'s "User" row survives — a household delete never deletes a person',
  )
}

// ══════════════════════════════════════════════════════════════════════
// PR 1, PR 3a and PR 3b — read BEFORE drop_user_scope
// ══════════════════════════════════════════════════════════════════════
//
// These blocks prove which location each row of the oldest migrations went
// to, and they do it by the location's "userId" and "isDefault". Both columns
// are gone after drop_user_scope, and that migration's cleanup deletes most
// of the cart items and one log these blocks check (they name another
// account's item: the PR 3a and PR 3b fixtures need that). So main() runs
// this between add_households and drop_user_scope. It reads the two columns
// through `legacyLocations`, and writes only deletes, which the Prisma client
// of the final schema can still do.
async function assertLocationMigrationsBeforeDrop(): Promise<void> {
  const legacy = await legacyLocationsById()

  // add_households (H3a) adds exactly ONE location: user-empty's 'Home', for
  // the "User" row with no data. That row is not PR 1's work, so it is set
  // aside here, and the block below checks PR 1's backfill as before. The
  // count check first makes sure it is the only row set aside: a stray extra
  // location for any of the thirteen would still fail the assertions below.
  // assertHouseholdsBackfill checks the 'Home' row itself.
  const allLocations = await legacyLocations()
  const locations = allLocations.filter((l) => l.userId !== NO_DATA_USER_ID)
  assert(
    allLocations.length === locations.length + 1,
    `exactly one Location belongs to ${NO_DATA_USER_ID}, the user add_households gave a 'Home' (read: ${allLocations.length - locations.length})`,
  )
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
    // A `select`, not all columns: this runs BEFORE the last deploy, so
    // "ItemStock"."isActive" (add_item_stock_is_active) is not there yet, and
    // the client built from the final schema would ask for it (P2022). For the
    // same reason the location gives only its id: "dataUpdatedAt" is not
    // there yet either (see assertHouseholdsBackfill). Nothing below reads
    // the relation.
    select: {
      itemId: true,
      locationId: true,
      targetQuantity: true,
      refillThreshold: true,
      packedQuantity: true,
      unpackedQuantity: true,
      dueDate: true,
      location: { select: { id: true } },
    },
    orderBy: { itemId: 'asc' },
  })
  assert(stocks.length === 3, 'one ItemStock per Item')
  assert(
    stocks.every((s) => legacy.get(s.locationId)?.isDefault === true),
    'every ItemStock sits under its default location (structural invariant in THIS fixture: no non-default Location exists yet when Backfill 2 runs, so this cannot go red on its own and is NOT evidence for the `AND l."isDefault"` JOIN filter — see the migration-check report for why that filter is unfalsifiable within a single migration file)',
  )
  // The scoping assertion that a single-user fixture could not make.
  const rice = stocks.find((s) => s.itemId === 'item-b1')
  assert(legacy.get(rice?.locationId ?? '')?.userId === 'user-b', "user-b's item is stocked under user-b's location")
  const milk = stocks.find((s) => s.itemId === 'item-a1')
  assert(legacy.get(milk?.locationId ?? '')?.userId === 'user-a', "user-a's item is stocked under user-a's location")
  assert(
    milk?.targetQuantity === 3 &&
      milk?.refillThreshold === 1 &&
      milk?.packedQuantity === 2 &&
      milk?.unpackedQuantity === 5 &&
      milk?.dueDate?.toISOString() === MILK_DUE_DATE.toISOString(),
    'all five state fields (targetQuantity, refillThreshold, packedQuantity, unpackedQuantity, dueDate) copied verbatim — refillThreshold/unpackedQuantity use distinct values so a field swap is catchable, and dueDate is non-NULL so a dropped/nulled column is catchable',
  )

  // There used to be an assertion here that "Item"."targetQuantity" still read
  // 3 — "dropped in PR 5, not here". PR 5 is now in this script's MIGRATIONS
  // list, so the column is gone by the time the assertions run and that
  // SELECT would throw 42703. It is replaced, inverted, by the PR 5 block in
  // main(). The `milk` assertion above is what proves the
  // five values survived the drop: they are read off "ItemStock", their new
  // home, after PR 5 has removed "Item"'s copy.

  // Two checks of PR 1's partial unique index "Location_one_default_per_user_key"
  // stood here: a second default for one user fails with P2002, and a second
  // NON-default location is allowed. drop_user_scope (households H3a task
  // 3.14) drops the index with the "isDefault" column, so both were replaced
  // by assertDropUserScope's "the column and the index are gone" checks.

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
      // `select`: a create returns the row, and "isActive" is not there yet.
      // Without it the INSERT fails on the missing column (P2022), not on the
      // unique key, and this check reads the wrong error.
      select: { id: true },
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
  // `select`: a delete returns the row, and "dataUpdatedAt" is not there yet.
  await prisma.location.delete({ where: { id: riceLocationId }, select: { id: true } })
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
    // Only the id, for the same reason as the ItemStock read above.
    include: { location: { select: { id: true } } },
    orderBy: { id: 'asc' },
  })
  assert(logs.length === 2, 'both seeded InventoryLog rows survive the migration')

  const logA = logs.find((l) => l.id === 'log-a')
  const logJ = logs.find((l) => l.id === 'log-j')
  assert(
    legacy.get(logA?.locationId ?? '')?.userId === 'user-a' && legacy.get(logA?.locationId ?? '')?.isDefault === true,
    "user-a's log is backfilled to user-a's default location",
  )
  assert(
    legacy.get(logJ?.locationId ?? '')?.userId === 'user-j' && legacy.get(logJ?.locationId ?? '')?.isDefault === true,
    "user-j's log is backfilled to user-j's default location — NOT user-a's, even though the log's item (item-a1) belongs to user-a. This is what catches a backfill that joins through Item instead of through InventoryLog.userId",
  )
  assert(
    logA?.locationId !== logJ?.locationId,
    'the two logs landed in DIFFERENT locations — a backfill writing one constant location id fails here',
  )

  // PR 3b re-keys Cart.id, so these rows can no longer be found by their seeded
  // ids. Each of the five users below owns exactly one cart, so `userId` is an
  // unambiguous handle that survives the re-key.
  //
  // Read with raw SQL (`legacyCarts`): "Cart"."userId" is still in the
  // database here, but the Prisma client no longer knows it since
  // shared_carts.
  const carts = await legacyCarts()

  const cartA = carts.find((c) => c.userId === 'user-a')
  const cartI = carts.find((c) => c.userId === 'user-i')
  assert(
    legacy.get(cartA?.locationId ?? '')?.userId === 'user-a' && legacy.get(cartI?.locationId ?? '')?.userId === 'user-i',
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
    cartK?.id === `${cartK?.locationId}:no-vendor` && legacy.get(cartK?.locationId ?? '')?.userId === 'user-k',
    "user-k (who owned the shared row) ends up with `${their own locationId}:no-vendor`",
  )
  assert(
    cartL?.id === `${cartL?.locationId}:no-vendor` && legacy.get(cartL?.locationId ?? '')?.userId === 'user-l',
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
  await prisma.location.delete({ where: { id: cartI!.locationId }, select: { id: true } })
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
  await prisma.location.delete({ where: { id: logJ!.locationId }, select: { id: true } })
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
  // `select`: this runs before the "last" deploy, so "Item"."consumable" does
  // not exist yet, and the client built from the final schema would ask for
  // it (P2022). The same rule as for "Location" in this file.
  await prisma.item.delete({ where: { id: 'item-a2' }, select: { id: true } })
  assert(
    (await prisma.itemStock.count({ where: { itemId: 'item-a2' } })) === 0,
    'deleting an Item cascades to delete its ItemStock rows',
  )
}

// ══════════════════════════════════════════════════════════════════════
// 20261111000000 — drop_user_scope: the seed between the two deploys
// ══════════════════════════════════════════════════════════════════════
//
// Each migration file is its own transaction. In production, after
// add_households commits, the OLD server keeps serving until Railway switches
// to the new one. drop_user_scope must handle what it writes in that window
// (plan, task 3.14 step 1). This seed writes those rows the way the old
// server writes them: "userId" only, no "householdId", no role row.
//
//   user-late     a new person: ensureUser made their "User" row, then the
//                 old ensureDefaultLocation made 'My Home' (isDefault) and
//                 they saved one item. Must get a household, an owner row,
//                 an organizer row on 'My Home', and NO second location.
//   user-webhook  a new person the Clerk webhook created, with no data. Must
//                 get a household and one 'Home', like user-empty did in
//                 add_households.
//   user-ghost    wrote a vendor, but has no "User" row (ensureUserOrLog never
//                 fails a request). Must get a "User" row named 'User', a
//                 household, a 'Home', and the vendor in that household.
//   user-a        an EXISTING person, who wrote a tag type, a tag and a new
//                 location 'Garage' after add_households. The three rows must
//                 go into user-a's household, and 'Garage' must get user-a as
//                 organizer.
//   user-removed  has householdSetupAt set and is in NO household: the shape
//                 of a person removed from a household (the E2E member route
//                 on the test database; H5 adds leaving). No data. Must NOT
//                 get a household: first sign-in would not give one either.
//
// Then one row of each kind the cleanup handles (owner's choice A, with A1
// for a tag's type, and Q4 for the three stock-side kinds), each with a
// same-household row next to it that must be KEPT. The five catalog kinds
// were seeded before add_households (seedCrossHouseholdReferences); the rows
// below add the shelf arrays and the stock-side kinds:
//
//   kind                 crossing (cleaned)                    same household (kept)
//   Shelf.itemIds        shelf-mix names item-b1 (user-b)       item-a1; and 'item-gone',
//                                                              which no row holds
//   Shelf.filterConfig   tag-g, vendor-d, recipe-e              tag-a1, vendor-a, recipe-a,
//                                                              'tag-gone', and a "note" key
//   ItemStock            stock-cross: item-b1 at user-a's       item-a1 at user-a's location
//                        location                              (the PR 1 backfill's row)
//   CartItem             ci-cross: item-b1 in user-a's cart     ci-own: item-a1 in the same cart
//   InventoryLog         log-cross: item-b1 at user-a's        log-a (seedFixture)
//                        location
//
// shelf-b-own (user-b) names only item-b1, its own household's item, so it
// must not change at all.
const LATE_USER = 'user-late'
const WEBHOOK_USER = 'user-webhook'
const GHOST_USER = 'user-ghost'
const REMOVED_USER = 'user-removed'
const SHELF_MIX_FILTER = {
  tagIds: ['tag-a1', 'tag-g', 'tag-gone'],
  vendorIds: ['vendor-a', 'vendor-d'],
  recipeIds: ['recipe-a', 'recipe-e'],
  note: 'keep',
}

async function seedBetweenDeploys(): Promise<void> {
  console.log('Seeding what the old server writes between the two deploys, and one row of each kind the cleanup handles...')
  const householdA = await prisma.household.findFirstOrThrow({ where: { ownerId: 'user-a' } })
  const householdB = await prisma.household.findFirstOrThrow({ where: { ownerId: 'user-b' } })
  const locationA = (await legacyLocations()).find((l) => l.userId === 'user-a' && l.isDefault)
  if (!locationA) throw new Error("FAIL: user-a's default location is missing before drop_user_scope")
  const cartA = (await legacyCarts()).find((c) => c.userId === 'user-a')
  if (!cartA) throw new Error("FAIL: user-a's cart is missing before drop_user_scope")

  // ── The old server's writes ──
  await prisma.$executeRaw`
    INSERT INTO "User" ("id","displayName","householdSetupAt","createdAt","updatedAt") VALUES
      (${LATE_USER}, 'Late', NULL, NOW(), NOW()),
      (${WEBHOOK_USER}, 'Hook', NULL, NOW(), NOW()),
      (${REMOVED_USER}, 'Removed', NOW(), NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "Location" ("id","name","order","isDefault","userId","createdAt","updatedAt") VALUES
      ('loc-late', 'My Home', 0, true, ${LATE_USER}, NOW(), NOW()),
      ('loc-a-late', 'Garage', 1, false, 'user-a', NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "Item" ("id","name","targetUnit","consumeAmount","expirationMode","userId","createdAt","updatedAt")
    VALUES ('item-late', 'Tea', 'package', 1, 'disabled', ${LATE_USER}, NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "Vendor" ("id","name","userId") VALUES ('vendor-ghost', 'Ghost Mart', ${GHOST_USER})
  `
  await prisma.$executeRaw`
    INSERT INTO "TagType" ("id","name","color","userId") VALUES ('tt-a-late', 'Late Kind', 'green', 'user-a')
  `
  await prisma.$executeRaw`
    INSERT INTO "Tag" ("id","name","typeId","userId") VALUES ('tag-a-late', 'Late Tag', 'tt-a-late', 'user-a')
  `

  // ── One row of each kind the cleanup handles, written as the H3a server
  //    would (with "householdId"), next to a row it must keep ──
  await prisma.$executeRaw`
    INSERT INTO "Shelf" ("id","name","type","order","itemIds","filterConfig","userId","householdId","createdAt","updatedAt") VALUES
      ('shelf-mix', 'Mixed', 'filter', 1, ARRAY['item-a1','item-b1','item-gone'],
       ${JSON.stringify(SHELF_MIX_FILTER)}::jsonb, 'user-a', ${householdA.id}, NOW(), NOW()),
      ('shelf-b-own', 'Own', 'manual', 0, ARRAY['item-b1'], NULL, 'user-b', ${householdB.id}, NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "ItemStock" ("id","itemId","locationId","createdAt","updatedAt")
    VALUES ('stock-cross', 'item-b1', ${locationA.id}, NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "CartItem" ("id","cartId","itemId","quantity","userId") VALUES
      ('ci-cross', ${cartA.id}, 'item-b1', 1, 'user-a'),
      ('ci-own', ${cartA.id}, 'item-a1', 2, 'user-a')
  `
  await prisma.$executeRaw`
    INSERT INTO "InventoryLog" ("id","itemId","delta","quantity","occurredAt","userId","locationId")
    VALUES ('log-cross', 'item-b1', 1, 1, NOW(), 'user-a', ${locationA.id})
  `
}

// ══════════════════════════════════════════════════════════════════════
// 20261111000000 — drop_user_scope: the final state
// ══════════════════════════════════════════════════════════════════════
//
// Read-only. main() calls this right after drop_user_scope is deployed. Three
// groups of checks:
//   1. the shape: what is gone, and what must still be there
//   2. step 2, the re-run of add_households' backfill (seedBetweenDeploys)
//   3. step 3, the cleanup of references that cross households
async function assertDropUserScope(): Promise<void> {
  console.log('drop_user_scope — the shape:')

  // ── 1. The shape. Each "gone" check has a "still there" half next to it
  //    (apps/server/prisma/CLAUDE.md, "A column DROP inverts the usual
  //    assertion shape") ──
  for (const table of HOUSEHOLD_SCOPED_TABLES) {
    assert(
      !(await columnNamesOf(table)).has('userId'),
      `"${table}"."userId" is gone`,
    )
    const meta = await columnMetaOf(table, 'householdId')
    assert(
      meta?.dataType === 'text' && meta?.isNullable === 'NO',
      `"${table}"."householdId" is NOT NULL text (read: ${meta ? `${meta.dataType}, nullable=${meta.isNullable}` : 'column missing'})`,
    )
  }
  for (const table of ['Cart', 'CartItem', 'InventoryLog', 'HouseholdMember', 'LocationMember'] as const) {
    assert(
      (await columnNamesOf(table)).has('userId'),
      `"${table}"."userId" is still there — drop_user_scope drops it from the seven tables only`,
    )
  }
  const locationColumns = await columnNamesOf('Location')
  assert(
    !locationColumns.has('isDefault') && locationColumns.has('order'),
    '"Location"."isDefault" is gone, and "order" stays (decision H5)',
  )

  // Indexes, read from pg_indexes. The partial index went with "isDefault";
  // every index on the seven tables that named "userId" went with that
  // column. The "householdId" indexes beside them must still be there.
  const indexes = await prisma.$queryRaw<{ indexname: string; tablename: string; indexdef: string }[]>`
    SELECT indexname::text AS indexname, tablename::text AS tablename, indexdef
    FROM pg_indexes WHERE schemaname = 'public'
  `
  assert(
    !indexes.some((i) => i.indexname === 'Location_one_default_per_user_key'),
    '"Location_one_default_per_user_key" is gone',
  )
  const userIdIndexes = indexes.filter(
    (i) => (HOUSEHOLD_SCOPED_TABLES as readonly string[]).includes(i.tablename) && i.indexdef.includes('"userId"'),
  )
  assert(
    userIdIndexes.length === 0,
    `no index on the seven tables names "userId"${userIdIndexes.length ? ` (left: ${userIdIndexes.map((i) => i.indexname).join(', ')})` : ''}`,
  )
  const householdIndexes = [
    'Location_householdId_order_idx',
    'Item_householdId_updatedAt_idx',
    'Item_householdId_name_idx',
    'Tag_householdId_typeId_idx',
    'TagType_householdId_name_idx',
    'Vendor_householdId_name_idx',
    'Recipe_householdId_name_idx',
    'Shelf_householdId_order_idx',
  ]
  const missingIndexes = householdIndexes.filter((name) => !indexes.some((i) => i.indexname === name))
  assert(
    missingIndexes.length === 0,
    `the eight "householdId" indexes are still there${missingIndexes.length ? ` (missing: ${missingIndexes.join(', ')})` : ''}`,
  )

  console.log('drop_user_scope — step 2, the re-run of the backfill:')

  // ── 2. The re-run (seedBetweenDeploys says what each user stands for) ──
  const households = await prisma.household.findMany({ include: { members: true } })
  const householdOf = (userId: string) => households.filter((h) => h.ownerId === userId)
  for (const [userId, name] of [
    [LATE_USER, "Late's Household"],
    [WEBHOOK_USER, "Hook's Household"],
    [GHOST_USER, "User's Household"],
  ] as const) {
    const own = householdOf(userId)
    assert(
      own.length === 1 &&
        own[0]?.name === name &&
        own[0].members.length === 1 &&
        own[0].members[0]?.userId === userId &&
        own[0].members[0]?.role === 'owner',
      `${userId} gets exactly one household, "${name}", and is its only member, as owner (read: ${own.length} household(s), ${own.map((h) => `${h.name}: ${h.members.map((m) => `${m.userId}/${m.role}`).join(', ')}`).join('; ')})`,
    )
  }
  // Every "User" read here has an explicit `select`: this runs before
  // add_household_invites, and a read with no `select` would ask for
  // "activeHouseholdId" (see assertHouseholdsBackfill).
  const ghost = await prisma.user.findUnique({ where: { id: GHOST_USER }, select: { displayName: true } })
  assert(
    ghost?.displayName === 'User',
    `${GHOST_USER}, found only in the data, gets a "User" row named 'User' (read: ${ghost?.displayName})`,
  )
  const setUp = await prisma.user.findMany({
    where: { id: { in: [LATE_USER, WEBHOOK_USER, GHOST_USER] } },
    select: { householdSetupAt: true },
  })
  assert(
    setUp.length === 3 && setUp.every((u) => u.householdSetupAt !== null),
    'the three new people are marked as set up, so first sign-in makes no second household',
  )
  const removed = await prisma.user.findUnique({ where: { id: REMOVED_USER }, select: { householdSetupAt: true } })
  assert(
    householdOf(REMOVED_USER).length === 0 &&
      (await prisma.householdMember.count({ where: { userId: REMOVED_USER } })) === 0 &&
      removed?.householdSetupAt !== null,
    `${REMOVED_USER}, set up and in no household (removed from one), gets NO household`,
  )

  const householdIdOf = (userId: string) => householdOf(userId)[0]?.id
  // "dataUpdatedAt" is not there yet: see the note in assertHouseholdsBackfill.
  const locations = await prisma.location.findMany({
    select: { id: true, name: true, order: true, householdId: true, members: true },
  })
  const lateLocations = locations.filter((l) => l.householdId === householdIdOf(LATE_USER))
  assert(
    lateLocations.length === 1 &&
      lateLocations[0]?.id === 'loc-late' &&
      lateLocations[0].members.length === 1 &&
      lateLocations[0].members[0]?.userId === LATE_USER &&
      lateLocations[0].members[0]?.role === 'organizer',
    `${LATE_USER}'s 'My Home' from the old server is in their household with them as organizer, and they get no second location (read: ${lateLocations.map((l) => l.id).join(', ')})`,
  )
  for (const userId of [WEBHOOK_USER, GHOST_USER]) {
    const theirs = locations.filter((l) => l.householdId === householdIdOf(userId))
    assert(
      theirs.length === 1 &&
        theirs[0]?.name === 'Home' &&
        theirs[0].order === 0 &&
        theirs[0].members.length === 1 &&
        theirs[0].members[0]?.userId === userId &&
        theirs[0].members[0]?.role === 'organizer',
      `${userId}, who had no location, gets exactly one 'Home', order 0, as its organizer (read: ${theirs.map((l) => `${l.name}/${l.order}`).join(', ')})`,
    )
  }
  const householdA = householdIdOf('user-a')
  const garage = locations.find((l) => l.id === 'loc-a-late')
  assert(
    garage?.householdId === householdA &&
      garage.members.length === 1 &&
      garage.members[0]?.userId === 'user-a' &&
      garage.members[0]?.role === 'organizer',
    "user-a's 'Garage' from the old server is in user-a's household, with user-a as its only organizer",
  )
  // `select` for the same reason as the `item-a2` delete: no "consumable" yet.
  const lateItem = await prisma.item.findUnique({ where: { id: 'item-late' }, select: { householdId: true } })
  const ghostVendor = await prisma.vendor.findUnique({ where: { id: 'vendor-ghost' } })
  const lateType = await prisma.tagType.findUnique({ where: { id: 'tt-a-late' } })
  const lateTag = await prisma.tag.findUnique({ where: { id: 'tag-a-late' } })
  assert(
    lateItem?.householdId === householdIdOf(LATE_USER) &&
      ghostVendor?.householdId === householdIdOf(GHOST_USER) &&
      lateType?.householdId === householdA &&
      lateTag?.householdId === householdA &&
      lateTag.typeId === 'tt-a-late',
    'every row the old server wrote with no householdId is filled in with its person\'s household (item, vendor, tag type, tag), and a tag whose type is in its OWN household keeps that type',
  )
  assert(
    (await prisma.location.count({ where: { name: 'Home' } })) === 3,
    "exactly three 'Home' locations: user-empty's from add_households, and the two from this re-run",
  )

  console.log('drop_user_scope — step 3, the cleanup of references that cross households:')

  // ── 3a. Tag.typeId (A1): one copy of the type per household ──
  const householdG = householdIdOf('user-g')
  const householdC = householdIdOf('user-c')
  const storageTypes = await prisma.tagType.findMany({ where: { name: 'Storage' } })
  const copyA = storageTypes.filter((t) => t.householdId === householdA)
  const copyG = storageTypes.filter((t) => t.householdId === householdG)
  assert(
    storageTypes.length === 3 &&
      storageTypes.some((t) => t.id === 'tt-c' && t.householdId === householdC) &&
      copyA.length === 1 &&
      copyG.length === 1 &&
      storageTypes.every((t) => t.color === 'blue'),
    `tt-c ('Storage', blue) stays in user-c's household, and ONE copy with the same name and color is made in user-a's and in user-g's household: two tags of user-a use it, and they share one copy (read: ${storageTypes.map((t) => `${t.id}/${t.color}`).join(', ')})`,
  )
  const tags = new Map((await prisma.tag.findMany()).map((t) => [t.id, t]))
  assert(
    tags.get('tag-a1')?.typeId === copyA[0]?.id &&
      tags.get('tag-a2')?.typeId === copyA[0]?.id &&
      tags.get('tag-g')?.typeId === copyG[0]?.id,
    "tag-a1 and tag-a2 point at user-a's copy, tag-g at user-g's copy",
  )
  assert(
    tags.get('tag-c1')?.typeId === 'tt-c' && tags.get('tag-c2')?.typeId === 'tt-c',
    "tag-c1 and tag-c2 keep tt-c: it is in their own household (the control)",
  )

  // ── 3b. Tag.parentId ──
  assert(
    tags.get('tag-c1')?.parentId === null && tags.get('tag-c2')?.parentId === 'tag-c1',
    "tag-c1's parent in another household (tag-g) is cleared; tag-c2 keeps its same-household parent tag-c1",
  )

  // ── 3c. The three join tables ──
  const itemTags = await prisma.itemTag.findMany({ where: { itemId: 'item-a1' } })
  assert(
    !itemTags.some((j) => j.tagId === 'tag-g') && itemTags.some((j) => j.tagId === 'tag-a1'),
    'ItemTag: item-a1 + tag-g (another household) is deleted; item-a1 + tag-a1 is kept',
  )
  const itemVendors = await prisma.itemVendor.findMany()
  assert(
    !itemVendors.some((j) => j.itemId === 'item-b1' && j.vendorId === 'vendor-d') &&
      itemVendors.some((j) => j.itemId === 'item-a1' && j.vendorId === 'vendor-a'),
    'ItemVendor: item-b1 + vendor-d is deleted; item-a1 + vendor-a is kept',
  )
  const recipeItems = await prisma.recipeItem.findMany()
  assert(
    !recipeItems.some((j) => j.recipeId === 'recipe-e' && j.itemId === 'item-b1') &&
      recipeItems.some((j) => j.recipeId === 'recipe-a' && j.itemId === 'item-a1'),
    'RecipeItem: recipe-e + item-b1 is deleted; recipe-a + item-a1 is kept',
  )

  // ── 3d and 3e. The shelf arrays ──
  const shelfMix = await prisma.shelf.findUnique({ where: { id: 'shelf-mix' } })
  assert(
    JSON.stringify(shelfMix?.itemIds) === JSON.stringify(['item-a1', 'item-gone']),
    `shelf-mix loses item-b1 (another household), and keeps item-a1 and 'item-gone' (no row holds it), in their order (read: ${JSON.stringify(shelfMix?.itemIds)})`,
  )
  const expectedFilter = {
    tagIds: ['tag-a1', 'tag-gone'],
    vendorIds: ['vendor-a'],
    recipeIds: ['recipe-a'],
    note: 'keep',
  }
  const readFilter = shelfMix?.filterConfig as Record<string, unknown> | null | undefined
  assert(
    readFilter !== null &&
      readFilter !== undefined &&
      Object.keys(readFilter).length === Object.keys(expectedFilter).length &&
      Object.entries(expectedFilter).every(([k, v]) => JSON.stringify(readFilter[k]) === JSON.stringify(v)),
    `shelf-mix's filterConfig loses tag-g, vendor-d and recipe-e, and keeps its own ids, 'tag-gone' and the "note" key (read: ${JSON.stringify(readFilter)})`,
  )
  const shelfB = await prisma.shelf.findUnique({ where: { id: 'shelf-b-own' } })
  assert(
    JSON.stringify(shelfB?.itemIds) === JSON.stringify(['item-b1']) && shelfB?.filterConfig === null,
    "shelf-b-own, which names only its own household's item, is unchanged",
  )

  // ── 3f. The three stock-side kinds ──
  const myHomeA = locations.find((l) => l.householdId === householdA && l.name === 'My Home')
  // `select`: this runs before the last deploy, so "isActive" is not there yet.
  const stocks = await prisma.itemStock.findMany({ select: { id: true, itemId: true, locationId: true } })
  assert(
    myHomeA !== undefined &&
      !stocks.some((s) => s.id === 'stock-cross') &&
      stocks.some((s) => s.itemId === 'item-a1' && s.locationId === myHomeA.id),
    "ItemStock: stock-cross (item-b1, user-b's item, at user-a's 'My Home') is deleted; item-a1 at that location is kept",
  )
  const cartItems = (await prisma.cartItem.findMany()).map((c) => c.id).sort()
  assert(
    JSON.stringify(cartItems) === JSON.stringify(['ci-own']),
    `CartItem: only ci-own is left. ci-cross is deleted, and so are ci-k1, ci-l1, ci-l2 and ci-m1 from the PR 3b fixture, which put user-a's and user-b's items in other people's carts (read: ${cartItems.join(', ')})`,
  )
  const logs = (await prisma.inventoryLog.findMany()).map((l) => l.id).sort()
  assert(
    JSON.stringify(logs) === JSON.stringify(['log-a']),
    `InventoryLog: log-cross is deleted; log-a, item-a1 at user-a's location, is kept (read: ${logs.join(', ')})`,
  )
}

// ══════════════════════════════════════════════════════════════════════
// The household lock on real Postgres (plan H3a, task 3.16)
// ══════════════════════════════════════════════════════════════════════
//
// `lockHousehold` (src/lib/household.ts) takes a row lock on the "Household"
// row. Every transaction that removes locations takes it FIRST. The unit tests
// run against a Prisma fake, which has no row lock, so they prove only the
// order of the calls. These two checks prove the lock itself:
//
//   1. Two `deleteLocation` transactions on the last two locations of one
//      household (review of task 3.6). The second waits at the lock. Since
//      households H5 task F.7 it no longer refuses: after its own delete it
//      counts the household's locations and must see 0, because the first
//      one's delete has committed. Without the lock it would not wait and
//      would see 1.
//   2. `clearAllData` and `deleteLocation` at the same time (review of task
//      3.10). Both take the lock before their location delete, so the second
//      waits for the first and the two never deadlock.
//
// Both use the same two-connection method as the first sign-in race guard in
// assertHouseholdsConstraints: two PrismaClients, transaction A holds the lock
// and stays open, and the script polls pg_blocking_pids until it SEES that A
// blocks B. Only then does A commit.
//
// main() calls this at the very end. It writes its own users, households and
// locations, so it does not depend on the fixture above.

// The lock, written exactly as `lockHouseholdOrForbid` in src/lib/household.ts
// runs it (through `lockHouseholds`): one `updateMany`, and a count of 0 means
// the household is gone. Since households H6 task J.4 (decision T52) that is
// the lock `deleteLocation` and `clearAllData` take; until then it was
// `lockHousehold`, an `update` of the same row. Both take the same row lock.
// scripts/ must not import from src (see the no-overlap note in the root
// CLAUDE.md), so the call is repeated here. If the lock changes, change this
// one too, or these proofs stop being about the code that runs.
const lockHouseholdCopy = async (tx: Prisma.TransactionClient, householdId: string) => {
  const { count } = await tx.household.updateMany({
    where: { id: householdId },
    data: { updatedAt: new Date() },
  })
  if (count === 0) throw new Error(`FAIL: the household ${householdId} to lock is gone`)
}

// The household role read both bodies make AFTER the lock, through `tx`
// (`requireHouseholdRole(ctx, householdId, role, tx)` in src/lib/authz.ts;
// households H6 task J.4, decision T52). It takes no lock; it is here so the
// statements are the ones that run. The fixture's user is the owner.
const householdRoleCopy = (tx: Prisma.TransactionClient, householdId: string, userId: string) =>
  tx.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { role: true },
  })

async function backendPidOf(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
  const pid = rows[0]?.pid
  if (typeof pid !== 'number') throw new Error(`FAIL: pg_backend_pid() returned ${String(pid)}`)
  return pid
}

/**
 * Rejects if `tx` settles while `reached()` is still false. That means the
 * transaction finished, or failed, before it reached the point the caller
 * waits for. Otherwise it never settles, so it only ever loses a
 * Promise.race. Both outcomes of `tx` are handled here, so a later rejection
 * is never unhandled; the caller still awaits `tx` itself for its result.
 */
function failIfSettlesBefore(
  tx: Promise<unknown>,
  reached: () => boolean,
  what: string,
): Promise<never> {
  const never = new Promise<never>(() => {})
  return tx.then(
    () => {
      if (!reached()) throw new Error(`FAIL: ${what} finished before it got there`)
      return never
    },
    (err: unknown) => {
      if (!reached()) throw err
      return never
    },
  )
}

/**
 * Runs `first` and `second` on two separate connections so that they overlap.
 *
 * `first` must call `hold()` at the point where it holds the lock. `hold()`
 * returns only after the script has seen `first`'s backend block `second`'s
 * backend. Then `first` goes on and commits. Returns both results.
 *
 * Fails (throws `FAIL: …`) when:
 *   - `second` is never seen waiting for `first` within about 10 seconds;
 *   - either transaction fails after the overlap. A deadlock is one such
 *     failure: Postgres cancels one side with 40P01, and Prisma reports it.
 */
async function overlapTwoTransactions<RA, RB>(
  label: string,
  first: (tx: Prisma.TransactionClient, hold: () => Promise<void>) => Promise<RA>,
  second: (tx: Prisma.TransactionClient) => Promise<RB>,
): Promise<{ first: RA; second: RB }> {
  const clientA = new PrismaClient({ datasources: { db: { url: TEST_URL } } })
  const clientB = new PrismaClient({ datasources: { db: { url: TEST_URL } } })
  let releaseA: () => void = () => {}
  try {
    await Promise.all([clientA.$connect(), clientB.$connect()])
    const aMayCommit = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    let aHeld = false
    let reportPidA: (pid: number) => void = () => {}
    const aHolding = new Promise<number>((resolve) => {
      reportPidA = resolve
    })
    let bStartedFlag = false
    let reportPidB: (pid: number) => void = () => {}
    const bStarted = new Promise<number>((resolve) => {
      reportPidB = resolve
    })
    const txOptions = { maxWait: 10_000, timeout: 30_000 }

    const txA = clientA.$transaction(async (tx) => {
      const pid = await backendPidOf(tx)
      return first(tx, async () => {
        aHeld = true
        reportPidA(pid)
        await aMayCommit
      })
    }, txOptions)
    const pidA = await Promise.race([
      aHolding,
      failIfSettlesBefore(txA, () => aHeld, `${label}: the first transaction`),
    ])

    let bSettled = false
    const txB = clientB.$transaction(async (tx) => {
      bStartedFlag = true
      reportPidB(await backendPidOf(tx))
      return second(tx)
    }, txOptions)
    txB.then(
      () => {
        bSettled = true
      },
      () => {
        bSettled = true
      },
    )
    const pidB = await Promise.race([
      bStarted,
      failIfSettlesBefore(txB, () => bStartedFlag, `${label}: the second transaction`),
    ])

    // At most 50 polls, 200 ms apart: about 10 seconds. pg_blocking_pids of
    // B must contain A's pid: that names this exact pair, not some other wait
    // on the shared test database.
    let aBlocksB = false
    let polls = 0
    for (; polls < 50 && !aBlocksB && !bSettled; polls++) {
      const rows = await prisma.$queryRaw<{ blocked: boolean }[]>`
        SELECT ${pidA}::int = ANY(pg_blocking_pids(${pidB}::int)) AS blocked`
      aBlocksB = rows[0]?.blocked === true
      if (!aBlocksB) await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert(
      aBlocksB,
      aBlocksB
        ? `${label}: the second transaction (pid ${pidB}) WAITED for the first (pid ${pidA}), so the two really overlapped`
        : `${label}: the second transaction (pid ${pidB}) was never seen blocked by the first (pid ${pidA}) after ${polls} polls, about ${polls * 0.2} s. ${bSettled ? 'It finished while the first still held the lock, so it did not wait for the lock.' : 'It is still running: it may be waiting on something else.'}`,
    )

    releaseA()
    try {
      const [a, b] = await Promise.all([txA, txB])
      return { first: a, second: b }
    } catch (err) {
      const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined
      throw new Error(
        `FAIL: ${label}: a transaction failed after the overlap (Prisma code ${code ?? 'none'}; P2034 is a deadlock or write conflict): ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  } finally {
    releaseA()
    await Promise.all([clientA.$disconnect(), clientB.$disconnect()])
  }
}

/** A user who owns one household with two locations, each with an organizer row. */
async function makeTwoLocationHousehold(
  tag: string,
): Promise<{ userId: string; householdId: string; locationIds: [string, string] }> {
  const userId = `user-lock-${tag}`
  await prisma.user.create({
    data: { id: userId, displayName: `Lock ${tag}`, householdSetupAt: new Date() },
  })
  const household = await prisma.household.create({
    data: {
      name: `Lock ${tag}'s Household`,
      ownerId: userId,
      members: { create: { userId, role: 'owner' } },
    },
  })
  const locationIds: [string, string] = [`loc-lock-${tag}-1`, `loc-lock-${tag}-2`]
  for (const [order, id] of locationIds.entries()) {
    await prisma.location.create({
      data: {
        id,
        name: `Lock ${tag} ${order + 1}`,
        order,
        householdId: household.id,
        members: { create: { userId, role: 'organizer' } },
      },
    })
  }
  // One item, stocked at both locations, so clearAllData's deletes below
  // have rows to delete and the location delete has stock rows to cascade.
  await prisma.item.create({
    data: {
      id: `item-lock-${tag}`,
      name: `Lock ${tag} item`,
      targetUnit: 'package',
      householdId: household.id,
      itemStocks: {
        create: locationIds.map((locationId) => ({ locationId, packedQuantity: 1 })),
      },
    },
  })
  return { userId, householdId: household.id, locationIds }
}

/**
 * The body of deleteLocation's transaction, in the same order, with the same
 * Prisma calls (src/resolvers/location.resolver.ts, `deleteLocation`):
 *
 *   lockHouseholdCopy    ← `await lockHouseholdOrForbid(tx, householdId)`
 *   householdRoleCopy    ← `await requireHouseholdRole(ctx, householdId, 'manager', tx)`
 *   location.findFirst   ← `tx.location.findFirst({ where: { id, householdId }, … })`
 *   location.delete      ← `tx.location.delete({ where: { id } })`
 *
 * Since households H5 task F.7 there is no `location.count` and no
 * `LAST_LOCATION`: the last location may be deleted (decision H13 lifted,
 * owner answer O8). The lock stays (decision T8 of the H5 plan).
 *
 * The resolver throws `forbidden()`. Here it is a result instead, so the
 * script can read which way it went. A thrown error would roll the
 * transaction back too, so nothing else differs.
 *
 * `hold` is called right after the lock, when given.
 */
async function deleteLocationBody(
  tx: Prisma.TransactionClient,
  householdId: string,
  userId: string,
  id: string,
  hold?: () => Promise<void>,
): Promise<{ outcome: 'deleted' | 'forbidden' }> {
  await lockHouseholdCopy(tx, householdId)
  if (hold) await hold()
  const role = await householdRoleCopy(tx, householdId, userId)
  if (!role || role.role === 'member') return { outcome: 'forbidden' }
  const location = await tx.location.findFirst({ where: { id, householdId }, select: { id: true } })
  if (!location) return { outcome: 'forbidden' }
  await tx.location.delete({ where: { id } })
  return { outcome: 'deleted' }
}

async function assertHouseholdLock(): Promise<void> {
  console.log('the household lock (lockHousehold) on real Postgres:')

  // ── 1. Two deletes of the last two locations (review of task 3.6;
  //       rewritten in households H5 task F.7) ──
  //
  // Until F.7 the second delete counted 1 location and refused with
  // LAST_LOCATION. F.7 removed the count: both deletes now succeed and the
  // household is left with no location. What this still proves is that the
  // lock makes the second delete WAIT for the first:
  //
  // - A deletes location 1 and holds its transaction open AFTER the delete.
  // - B then deletes location 2. `overlapTwoTransactions` asserts that B is
  //   blocked by A (pg_blocking_pids), which is the wait at the lock.
  // - When A commits, B goes on. B then counts the household's locations
  //   AFTER its own delete. That count is a new statement, so under READ
  //   COMMITTED it sees A's committed delete: 0.
  //
  // Without the lock, B would not wait at its first statement. It would
  // delete location 2 while A is still open, and its count would see A's
  // location 1 (not committed yet): 1. `overlapTwoTransactions` would also
  // report that B was never blocked.
  {
    const { userId, householdId, locationIds } = await makeTwoLocationHousehold('delete-delete')
    const [loc1, loc2] = locationIds
    const { first, second } = await overlapTwoTransactions(
      'two deleteLocation at once',
      async (tx, hold) => {
        const result = await deleteLocationBody(tx, householdId, userId, loc1)
        // Hold AFTER the delete, so B would see location 1 if it did not wait.
        await hold()
        return result
      },
      async (tx) => {
        const result = await deleteLocationBody(tx, householdId, userId, loc2)
        // Not a statement of the resolver: an observation, read inside B's
        // transaction after its delete.
        const seenAfter = await tx.location.count({ where: { householdId } })
        return { ...result, seenAfter }
      },
    )
    assert(
      first.outcome === 'deleted',
      `two deleteLocation at once: the first deletes its location (read: ${first.outcome})`,
    )
    assert(
      second.outcome === 'deleted' && second.seenAfter === 0,
      `two deleteLocation at once: the second, after the wait, deletes its location and then sees 0 locations, so it ran after the first had committed (read: ${second.outcome}, seen after ${second.seenAfter})`,
    )
    const left = (await prisma.location.findMany({ where: { householdId } })).map((l) => l.id)
    assert(
      left.length === 0,
      `two deleteLocation at once: the household has no location left, which is allowed since H5 task F.7 (read: ${left.join(', ') || 'none'})`,
    )
  }

  // ── 2. clearAllData and deleteLocation at once (review of task 3.10) ──
  //
  // A runs clearAllData's transaction up to and including its location
  // deleteMany, and holds it open there. At that point A holds the household
  // lock AND row locks on both locations. B then runs deleteLocation's
  // transaction on location 2. B's first statement is the household lock, so
  // B waits there and touches no location row. When A goes on (makes "Home")
  // and commits, B gets the lock, its findFirst no longer finds location 2,
  // and it refuses with forbidden. No deadlock: a deadlock needs each side to
  // hold a lock the other wants, and B holds none while it waits.
  //
  // If clearAllData took the household lock AFTER its location deleteMany,
  // and deleteLocation took a location row lock before the household lock,
  // the two could wait on each other. Postgres would then cancel one with
  // 40P01, and overlapTwoTransactions fails with the Prisma error.
  //
  // If deleteLocation took no household lock at all, B would still wait, on
  // location 2's row lock, but only at its delete. After A commits, that
  // delete finds no row, Prisma raises P2025, and this check fails too.
  //
  // The statements are clearAllData's, in its order, with the same Prisma
  // calls (src/resolvers/import.resolver.ts, `clearAllData`, the body of its
  // `prisma.$transaction`). Since households H6 task J.4 the fourteen deletes
  // live in `deleteHouseholdData` (src/lib/household.ts), which clearAllData
  // calls; the copy below is of that function's body, unchanged. Each line
  // below names the source line it mirrors.
  // Since J.4 the owner check is inside the transaction, after the lock
  // (decision T52), so it is copied too. It takes no lock.
  {
    const { userId, householdId, locationIds } = await makeTwoLocationHousehold('clear-delete')
    const [, loc2] = locationIds
    const { first, second } = await overlapTwoTransactions(
      'clearAllData and deleteLocation at once',
      async (tx, hold) => {
        // `await lockHouseholdOrForbid(tx, householdId)`
        await lockHouseholdCopy(tx, householdId)
        // `await requireHouseholdRole(ctx, householdId, 'owner', tx)`
        const role = await householdRoleCopy(tx, householdId, userId)
        if (role?.role !== 'owner') throw new Error(`FAIL: the fixture user is not the owner (read: ${role?.role})`)
        // `await tx.inventoryLog.deleteMany({ where: { location: { householdId } } })`
        await tx.inventoryLog.deleteMany({ where: { location: { householdId } } })
        // `await tx.cartItem.deleteMany({ where: { cart: { location: { householdId } } } })`
        await tx.cartItem.deleteMany({ where: { cart: { location: { householdId } } } })
        // `await tx.cart.deleteMany({ where: { location: { householdId } } })`
        await tx.cart.deleteMany({ where: { location: { householdId } } })
        // `await tx.recipeItem.deleteMany({ where: { recipe: { householdId } } })`
        await tx.recipeItem.deleteMany({ where: { recipe: { householdId } } })
        // `await tx.recipe.deleteMany({ where: { householdId } })`
        await tx.recipe.deleteMany({ where: { householdId } })
        // `await tx.itemTag.deleteMany({ where: { item: { householdId } } })`
        await tx.itemTag.deleteMany({ where: { item: { householdId } } })
        // `await tx.itemVendor.deleteMany({ where: { item: { householdId } } })`
        await tx.itemVendor.deleteMany({ where: { item: { householdId } } })
        // `await tx.itemStock.deleteMany({ where: { location: { householdId } } })`
        await tx.itemStock.deleteMany({ where: { location: { householdId } } })
        // `await tx.item.deleteMany({ where: { householdId } })`
        await tx.item.deleteMany({ where: { householdId } })
        // `await tx.tag.deleteMany({ where: { householdId } })`
        await tx.tag.deleteMany({ where: { householdId } })
        // `await tx.tagType.deleteMany({ where: { householdId } })`
        await tx.tagType.deleteMany({ where: { householdId } })
        // `await tx.vendor.deleteMany({ where: { householdId } })`
        await tx.vendor.deleteMany({ where: { householdId } })
        // `await tx.shelf.deleteMany({ where: { householdId } })`
        await tx.shelf.deleteMany({ where: { householdId } })
        // `await tx.location.deleteMany({ where: { householdId } })`
        const { count: locationsDeleted } = await tx.location.deleteMany({
          where: { householdId },
        })
        // Hold here: A now holds the household lock and both location rows.
        await hold()
        // `await createFirstLocation(tx, { householdId, userId, name: … })`,
        // whose body (src/lib/household.ts) is a location.create and a
        // locationMember.create. The name is "Home", firstLocationName('en').
        const home = await tx.location.create({
          data: { name: 'Home', order: 0, householdId },
        })
        await tx.locationMember.create({
          data: { locationId: home.id, userId, role: 'organizer' },
        })
        return { locationsDeleted, homeId: home.id }
      },
      (tx) => deleteLocationBody(tx, householdId, userId, loc2),
    )
    assert(
      first.locationsDeleted === 2,
      `clearAllData and deleteLocation at once: clearAllData deletes both locations (read: ${first.locationsDeleted})`,
    )
    assert(
      second.outcome === 'forbidden',
      `clearAllData and deleteLocation at once: deleteLocation, after the wait, no longer finds ${loc2} and refuses (read: ${second.outcome})`,
    )
    const left = (await prisma.location.findMany({ where: { householdId } })).map((l) => l.id)
    assert(
      JSON.stringify(left) === JSON.stringify([first.homeId]),
      `clearAllData and deleteLocation at once: the household keeps exactly one location, the new "Home" (read: ${left.join(', ') || 'none'})`,
    )
  }
}

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url))

// The migrations under test, and which `migrate deploy` applies each one, live
// in `migrationDeploys.ts` (since H5b task G.1). A new migration goes into ONE
// group there; `migrationDeploys.test.ts` fails, with no database, while a
// migration folder is in no group. These names are kept for the log lines and
// for the one block that reads add_households' SQL file.
const HOUSEHOLDS_MIGRATION = '20261104000000_add_households'
const DROP_USER_SCOPE_MIGRATION = '20261111000000_drop_user_scope'
const SHARED_CARTS_MIGRATION = '20261114000000_shared_carts'
const HOUSEHOLD_INVITES_MIGRATION = '20261118000000_add_household_invites'
const HOUSEHOLD_ACTIVITY_MIGRATION = '20261120000000_add_household_activity'
const OWNERSHIP_OFFERS_MIGRATION = '20261120100000_add_ownership_offers'
const LOCATION_PREFERENCES_MIGRATION = '20261122000000_add_location_preferences'
const ITEM_CONSUMABLE_MIGRATION = '20261125000000_add_item_consumable'
const ITEM_STOCK_IS_ACTIVE_MIGRATION = '20261126000000_add_item_stock_is_active'

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

// Put back the parked migrations of ONE deploy group (see migrationDeploys.ts).
// Only the names the group lists: a migration in no group, or in a later
// group, stays parked. That is what keeps a new migration out of an early
// deploy.
function restoreDeploy(label: Parameters<typeof migrationsOfDeploy>[0]): void {
  const names = migrationsOfDeploy(label)
  console.log(`Applying the "${label}" deploy: ${names.join(', ')}...`)
  for (const name of names) renameSync(parkedDir(name), migrationDir(name))
}

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

// ══════════════════════════════════════════════════════════════════════
// 20261114000000 — shared_carts (households H3b, task B.3)
// ══════════════════════════════════════════════════════════════════════
//
// main() calls `seedSharedCartDuplicates` after drop_user_scope and BEFORE
// shared_carts, then `assertSharedCarts` after it. The duplicate rows can only
// be written before: the migration's unique index refuses them after.
//
// Its own location, carts and items, so the expected numbers do not depend on
// what the older blocks deleted. In user-a's household. Raw SQL, because
// "Cart"."userId" is still NOT NULL here and the Prisma client no longer
// knows the column.
//
// | Cart          | Rows (id: item, quantity, userId)                       | Expected after              |
// |---------------|---------------------------------------------------------|-----------------------------|
// | sc:cart-dup   | sc-dup-b: item-sc-1, 3.5, user-b (written FIRST)        | deleted                     |
// |               | sc-dup-a: item-sc-1, 2,   user-a (written second)       | kept: 5.5, userId user-a    |
// |               | sc-tri-2: item-sc-2, 10,  user-a                        | deleted                     |
// |               | sc-tri-1: item-sc-2, 1,   user-b                        | kept: 111, userId user-b    |
// |               | sc-tri-3: item-sc-2, 100, user-m                        | deleted                     |
// | sc:cart-clean | sc-clean-1: item-sc-1, 4; sc-clean-2: item-sc-2, 6      | both unchanged              |
// | sc:cart-other | sc-other-1: item-sc-1, 7                                | unchanged, not merged       |
//
// Why each one:
//   - the pair has DIFFERENT amounts and DIFFERENT userIds, so "kept the sum"
//     and "kept its own userId" can each fail on their own. The lowest id,
//     sc-dup-a, is written SECOND: a merge that kept the first row written
//     (by ctid) instead of the lowest id fails here.
//   - the group of THREE catches a merge that only handles pairs, or that
//     deletes only one other row.
//   - sc:cart-clean holds the same two items with no duplicates: a merge that
//     touched every row of a cart that has duplicates elsewhere fails here.
//   - sc:cart-other holds item-sc-1 too, in a DIFFERENT cart: a merge grouped
//     by "itemId" alone would fold it into sc:cart-dup.
const SC_LOCATION = 'loc-sc'
const SC_CART_DUP = `${SC_LOCATION}:cart-dup`
const SC_CART_CLEAN = `${SC_LOCATION}:cart-clean`
const SC_CART_OTHER = `${SC_LOCATION}:cart-other`

interface CartItemSnapshot {
  id: string
  cartId: string
  itemId: string
  quantity: number
  userId: string
}

// Every CartItem row before shared_carts, keyed by id. Filled by
// seedSharedCartDuplicates, read by assertSharedCarts.
let cartItemsBeforeSharedCarts = new Map<string, CartItemSnapshot>()

async function seedSharedCartDuplicates(): Promise<void> {
  console.log('Seeding duplicate cart rows for shared_carts...')
  const householdA = await prisma.household.findFirstOrThrow({ where: { ownerId: 'user-a' } })
  await prisma.$executeRaw`
    INSERT INTO "Location" ("id","name","order","householdId","createdAt","updatedAt")
    VALUES (${SC_LOCATION}, 'Shared carts', 9, ${householdA.id}, NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "Item" ("id","name","targetUnit","consumeAmount","expirationMode","householdId","createdAt","updatedAt") VALUES
      ('item-sc-1', 'Eggs', 'package', 1, 'disabled', ${householdA.id}, NOW(), NOW()),
      ('item-sc-2', 'Flour', 'package', 1, 'disabled', ${householdA.id}, NOW(), NOW()),
      ('item-sc-3', 'Sugar', 'package', 1, 'disabled', ${householdA.id}, NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "Cart" ("id","userId","locationId","lastPurchasedAt") VALUES
      (${SC_CART_DUP}, 'user-a', ${SC_LOCATION}, NULL),
      (${SC_CART_CLEAN}, 'user-b', ${SC_LOCATION}, NULL),
      (${SC_CART_OTHER}, 'user-a', ${SC_LOCATION}, NULL)
  `
  // One statement per row, so the rows are written in this order. sc-dup-b
  // goes in before sc-dup-a on purpose (see the table above).
  const rows: CartItemSnapshot[] = [
    { id: 'sc-dup-b', cartId: SC_CART_DUP, itemId: 'item-sc-1', quantity: 3.5, userId: 'user-b' },
    { id: 'sc-dup-a', cartId: SC_CART_DUP, itemId: 'item-sc-1', quantity: 2, userId: 'user-a' },
    { id: 'sc-tri-2', cartId: SC_CART_DUP, itemId: 'item-sc-2', quantity: 10, userId: 'user-a' },
    { id: 'sc-tri-1', cartId: SC_CART_DUP, itemId: 'item-sc-2', quantity: 1, userId: 'user-b' },
    { id: 'sc-tri-3', cartId: SC_CART_DUP, itemId: 'item-sc-2', quantity: 100, userId: 'user-m' },
    { id: 'sc-clean-1', cartId: SC_CART_CLEAN, itemId: 'item-sc-1', quantity: 4, userId: 'user-b' },
    { id: 'sc-clean-2', cartId: SC_CART_CLEAN, itemId: 'item-sc-2', quantity: 6, userId: 'user-a' },
    { id: 'sc-other-1', cartId: SC_CART_OTHER, itemId: 'item-sc-1', quantity: 7, userId: 'user-a' },
  ]
  for (const r of rows) {
    await prisma.$executeRaw`
      INSERT INTO "CartItem" ("id","cartId","itemId","quantity","userId")
      VALUES (${r.id}, ${r.cartId}, ${r.itemId}, ${r.quantity}, ${r.userId})
    `
  }

  // `prisma.cartItem` is safe here: "CartItem" loses no column in shared_carts.
  const all = await prisma.cartItem.findMany()
  cartItemsBeforeSharedCarts = new Map(all.map((r) => [r.id, { ...r }]))
  assert(
    all.filter((r) => r.cartId === SC_CART_DUP && r.itemId === 'item-sc-1').length === 2 &&
      all.filter((r) => r.cartId === SC_CART_DUP && r.itemId === 'item-sc-2').length === 3,
    'before shared_carts: the duplicate pair and the group of three are really in the table — without them the merge checks below would prove nothing',
  )
}

async function assertSharedCarts(): Promise<void> {
  console.log('shared_carts — the merge:')
  const after = new Map((await prisma.cartItem.findMany()).map((r) => [r.id, r]))

  // ── The pair ──
  const dupA = after.get('sc-dup-a')
  assert(
    dupA?.quantity === 5.5 && dupA.userId === 'user-a' && dupA.cartId === SC_CART_DUP && dupA.itemId === 'item-sc-1',
    `the pair: the lowest id (sc-dup-a) stays, with the sum 2 + 3.5 = 5.5 and its OWN userId user-a (read: ${JSON.stringify(dupA)})`,
  )
  assert(!after.has('sc-dup-b'), 'the pair: the other row (sc-dup-b, written first) is gone — a merge by write order instead of by lowest id fails here')

  // ── The group of three ──
  const tri1 = after.get('sc-tri-1')
  assert(
    tri1?.quantity === 111 && tri1.userId === 'user-b',
    `the group of three: sc-tri-1 stays with 1 + 10 + 100 = 111 and its own userId user-b (read: ${JSON.stringify(tri1)})`,
  )
  assert(!after.has('sc-tri-2') && !after.has('sc-tri-3'), 'the group of three: both other rows are gone')

  // ── No other row changed ──
  //
  // Every row that was in the table before, except the four merged away and
  // the two that got a new sum, must be exactly as it was. This covers the
  // cart with no duplicates (sc:cart-clean), the other cart holding the same
  // item (sc:cart-other), and every row the older blocks left behind.
  const merged = new Set(['sc-dup-a', 'sc-dup-b', 'sc-tri-1', 'sc-tri-2', 'sc-tri-3'])
  const changed: string[] = []
  for (const [id, before] of cartItemsBeforeSharedCarts) {
    if (merged.has(id)) continue
    const now = after.get(id)
    if (!now || JSON.stringify({ ...now }) !== JSON.stringify(before)) changed.push(id)
  }
  assert(
    changed.length === 0 && after.size === cartItemsBeforeSharedCarts.size - 3,
    `every row outside the two groups is unchanged, and the table lost exactly 3 rows (read: ${cartItemsBeforeSharedCarts.size} -> ${after.size}${changed.length ? `, changed: ${changed.join(', ')}` : ''})`,
  )
  assert(
    after.get('sc-other-1')?.quantity === 7 && after.get('sc-other-1')?.cartId === SC_CART_OTHER,
    'sc-other-1 holds the same item in ANOTHER cart and is not merged — a merge grouped by itemId alone fails here',
  )
  assert(
    after.get('sc-clean-1')?.quantity === 4 && after.get('sc-clean-2')?.quantity === 6,
    'the cart with no duplicates (sc:cart-clean) is unchanged',
  )

  console.log('shared_carts — the shape:')

  // ── "Cart"."userId" is gone; "CartItem"."userId" stays ──
  //
  // Both halves (apps/server/prisma/CLAUDE.md, "A column DROP inverts the
  // usual assertion shape"): the two tables share the column name, and
  // CartItem's means "added by" and must survive.
  const cartColumns = await columnNamesOf('Cart')
  assert(
    !cartColumns.has('userId') && cartColumns.has('locationId') && cartColumns.has('lastPurchasedAt'),
    `"Cart"."userId" is gone, and "locationId" and "lastPurchasedAt" stay (read: ${[...cartColumns].sort().join(', ')})`,
  )
  assert(
    (await columnNamesOf('CartItem')).has('userId'),
    '"CartItem"."userId" is still there — it means "added by" and shared_carts keeps it',
  )

  // ── Indexes ──
  const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname::text AS indexname, indexdef
    FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('Cart', 'CartItem')
  `
  const pair = indexes.find((i) => i.indexname === 'CartItem_cartId_itemId_key')
  assert(
    !!pair && pair.indexdef.includes('UNIQUE') && pair.indexdef.includes('("cartId", "itemId")'),
    `"CartItem_cartId_itemId_key" is a UNIQUE index on ("cartId", "itemId") (read: ${pair?.indexdef ?? 'missing'})`,
  )
  assert(
    !indexes.some((i) => i.indexname === 'CartItem_cartId_idx'),
    '"CartItem_cartId_idx" is gone — the unique index starts with "cartId" and serves those lookups (plan decision P2)',
  )
  assert(
    !indexes.some((i) => i.indexname === 'Cart_userId_idx'),
    '"Cart_userId_idx" is gone with its column',
  )
  assert(
    indexes.some((i) => i.indexname === 'CartItem_itemId_idx'),
    '"CartItem_itemId_idx" is still there — shared_carts must not drop the other index',
  )

  // ── The unique index refuses a second row ──
  //
  // A new item in the same cart is accepted FIRST, so the refusal below
  // cannot pass because every write fails.
  await prisma.cartItem.create({
    data: { id: 'sc-new', cartId: SC_CART_DUP, itemId: 'item-sc-3', quantity: 1, userId: 'user-b' },
  })
  let duplicateCode: string | undefined
  try {
    await prisma.cartItem.create({
      data: { cartId: SC_CART_DUP, itemId: 'item-sc-1', quantity: 1, userId: 'user-b' },
    })
  } catch (err) {
    duplicateCode = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined
  }
  assert(
    duplicateCode === 'P2002',
    `a second CartItem row for (sc:cart-dup, item-sc-1) is refused with P2002, while a new item in the same cart was accepted (read: ${duplicateCode ?? 'no error'})`,
  )

  // ── A cart is written with no "userId" now ──
  await prisma.cart.create({ data: { id: `${SC_LOCATION}:cart-new`, locationId: SC_LOCATION } })
  assert(
    (await prisma.cart.findUnique({ where: { id: `${SC_LOCATION}:cart-new` } }))?.locationId === SC_LOCATION,
    'a Cart row is created with no "userId", the way the H3b server writes it',
  )
}

// ══════════════════════════════════════════════════════════════════════
// 20261118000000 — add_household_invites (households H5b, task G.1)
// ══════════════════════════════════════════════════════════════════════
//
// Additive only: a new, empty "HouseholdInvite" table and a nullable
// "User"."activeHouseholdId" (decisions T14 and T26 of
// docs/global/permissions/2026-11-18-households-plan-h5b.md). What is checked:
//
//   1. the table has the design's eleven columns, with the right type and
//      nullability for each;
//   2. "token" is unique: a second row with a NEW token is accepted first,
//      then a row with a token already used fails with 23505;
//   3. "User"."activeHouseholdId" is nullable text, every "User" row that
//      existed before reads NULL, and the column refuses a household id that
//      does not exist (so the foreign key is really there);
//   4. the column is NOT on "HouseholdMember" (the "two halves" rule in
//      apps/server/prisma/CLAUDE.md: a migration aimed at the wrong table must
//      fail here);
//   5. deleting a household sets "activeHouseholdId" to NULL (SetNull) and
//      deletes its invites (Cascade), while another household's person and
//      invite are untouched;
//   6. deleting a "User" that "usedById" names sets it to NULL and keeps the
//      invite; deleting a "User" that "createdById" names FAILS with 23503.
//
// Raw SQL for the writes, so a refused write reports the Postgres code. Every
// row this block writes has an id starting with "hi-", and the block deletes
// them all at the end.

// The Postgres error code of a failed write, or undefined when it did not
// fail. Prisma reports a failed raw query as P2010 with the Postgres code in
// `meta.code`. If that shape ever changes, the code is looked for in the
// message, so the FAIL line still says what happened.
async function postgresCodeOf(write: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await write()
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      const metaCode = (err.meta as { code?: unknown } | undefined)?.code
      if (typeof metaCode === 'string') return metaCode
    }
    const message = err instanceof Error ? err.message : String(err)
    return /\b(23\d{3})\b/.exec(message)?.[1] ?? `unexpected error: ${message.slice(0, 200)}`
  }
  return undefined
}

async function insertInvite(
  id: string,
  householdId: string,
  token: string,
  createdById: string,
  usedById: string | null,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "HouseholdInvite"
      ("id","householdId","token","householdRole","locationRoles","createdById","expiresAt","usedAt","usedById")
    VALUES (${id}, ${householdId}, ${token}, 'member'::"HouseholdRole",
            '[{"locationId":"hi-loc","role":"viewer"}]'::jsonb, ${createdById},
            NOW() + INTERVAL '7 days',
            CASE WHEN ${usedById}::text IS NULL THEN NULL ELSE NOW() END, ${usedById})
  `
}

async function assertHouseholdInvites(): Promise<void> {
  console.log('add_household_invites — the shape:')

  // ── 1. The table and its columns ──
  const expected: Record<string, { type: string; nullable: 'YES' | 'NO' }> = {
    id: { type: 'text', nullable: 'NO' },
    householdId: { type: 'text', nullable: 'NO' },
    token: { type: 'text', nullable: 'NO' },
    householdRole: { type: 'USER-DEFINED', nullable: 'NO' },
    locationRoles: { type: 'jsonb', nullable: 'NO' },
    createdById: { type: 'text', nullable: 'NO' },
    createdAt: { type: 'timestamp without time zone', nullable: 'NO' },
    expiresAt: { type: 'timestamp without time zone', nullable: 'NO' },
    usedAt: { type: 'timestamp without time zone', nullable: 'YES' },
    usedById: { type: 'text', nullable: 'YES' },
    revokedAt: { type: 'timestamp without time zone', nullable: 'YES' },
  }
  const inviteColumns = await columnNamesOf('HouseholdInvite')
  assert(
    inviteColumns.size === Object.keys(expected).length,
    `"HouseholdInvite" has exactly ${Object.keys(expected).length} columns (read: ${[...inviteColumns].sort().join(', ') || 'no table'})`,
  )
  for (const [column, want] of Object.entries(expected)) {
    const meta = await columnMetaOf('HouseholdInvite', column)
    assert(
      meta?.dataType === want.type && meta.isNullable === want.nullable,
      `"HouseholdInvite"."${column}" is ${want.type}, nullable=${want.nullable} (read: ${meta ? `${meta.dataType}, nullable=${meta.isNullable}` : 'column missing'})`,
    )
  }

  // `data_type` says only USER-DEFINED for an enum. `udt_name` names the type,
  // so a column of the wrong enum (LocationRole) fails here.
  const roleType = await prisma.$queryRaw<{ udt_name: string }[]>`
    SELECT udt_name::text AS udt_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name::text = 'HouseholdInvite'
      AND column_name::text = 'householdRole'
  `
  assert(
    roleType[0]?.udt_name === 'HouseholdRole',
    `"HouseholdInvite"."householdRole" is of the type "HouseholdRole" (read: ${roleType[0]?.udt_name ?? 'column missing'})`,
  )

  // ── The three indexes ──
  const inviteIndexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname::text AS indexname, indexdef
    FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('HouseholdInvite', 'User')
  `
  const indexDef = (name: string) => inviteIndexes.find((i) => i.indexname === name)?.indexdef
  const tokenIndex = indexDef('HouseholdInvite_token_key')
  // Postgres quotes a column name in `indexdef` only when it must. "token" is
  // all lower case, so it reads `(token)` with no quotes. The two camelCase
  // columns below read with quotes. (The first run against the test database,
  // 2026-11-18, failed here on `("token")`.)
  assert(
    !!tokenIndex && tokenIndex.includes('UNIQUE') && tokenIndex.includes('(token)'),
    `"HouseholdInvite_token_key" is a UNIQUE index on (token) (read: ${tokenIndex ?? 'missing'})`,
  )
  const householdIndex = indexDef('HouseholdInvite_householdId_idx')
  assert(
    !!householdIndex && !householdIndex.includes('UNIQUE') && householdIndex.includes('("householdId")'),
    `"HouseholdInvite_householdId_idx" is a plain index on ("householdId") — it lists a household's invites and serves the ON DELETE CASCADE (read: ${householdIndex ?? 'missing'})`,
  )
  const activeIndex = indexDef('User_activeHouseholdId_idx')
  assert(
    !!activeIndex && !activeIndex.includes('UNIQUE') && activeIndex.includes('("activeHouseholdId")'),
    `"User_activeHouseholdId_idx" is a plain index on ("activeHouseholdId") — it serves the ON DELETE SET NULL (read: ${activeIndex ?? 'missing'})`,
  )

  // ── 3 (first half). Every existing person reads NULL ──
  //
  // Runs before this block writes anything. The earlier blocks left many
  // "User" rows, so a count of 0 cannot pass on an empty table.
  const userRows = await prisma.user.count()
  const withActive = await prisma.user.count({ where: { activeHouseholdId: { not: null } } })
  assert(
    userRows > 0 && withActive === 0,
    `every "User" row that existed before reads "activeHouseholdId" NULL — no backfill, the server falls back to the oldest membership (read: ${withActive} of ${userRows} set)`,
  )
  const activeMeta = await columnMetaOf('User', 'activeHouseholdId')
  assert(
    activeMeta?.dataType === 'text' && activeMeta.isNullable === 'YES',
    `"User"."activeHouseholdId" is nullable text (read: ${activeMeta ? `${activeMeta.dataType}, nullable=${activeMeta.isNullable}` : 'column missing'})`,
  )

  // ── 4. Not on the other table ──
  assert(
    !(await columnNamesOf('HouseholdMember')).has('activeHouseholdId'),
    '"activeHouseholdId" is NOT on "HouseholdMember" — it belongs to the person, not to one membership',
  )

  // ── Fixture: two households, four people ──
  await prisma.$executeRaw`
    INSERT INTO "Household" ("id","name","createdAt","updatedAt") VALUES
      ('hi-house-1','Invites One',NOW(),NOW()),
      ('hi-house-2','Invites Two',NOW(),NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "User" ("id","displayName","createdAt","updatedAt") VALUES
      ('hi-creator','Creator',NOW(),NOW()),
      ('hi-joiner','Joiner',NOW(),NOW()),
      ('hi-other','Other',NOW(),NOW()),
      ('hi-gone','Gone',NOW(),NOW())
  `

  // ── 3 (second half). The foreign key on "activeHouseholdId" ──
  //
  // A real household first, so the refusal below cannot pass because every
  // write fails.
  await prisma.$executeRaw`UPDATE "User" SET "activeHouseholdId" = 'hi-house-1' WHERE "id" = 'hi-joiner'`
  await prisma.$executeRaw`UPDATE "User" SET "activeHouseholdId" = 'hi-house-2' WHERE "id" = 'hi-other'`
  const unknownHousehold = await postgresCodeOf(
    () => prisma.$executeRaw`UPDATE "User" SET "activeHouseholdId" = 'hi-no-such-house' WHERE "id" = 'hi-gone'`,
  )
  assert(
    unknownHousehold === '23503',
    `"activeHouseholdId" accepts a real household and refuses one that does not exist with 23503 (read: ${unknownHousehold ?? 'no error'})`,
  )

  // ── 2. "token" is unique ──
  await insertInvite('hi-inv-1', 'hi-house-1', 'hi-token-1', 'hi-creator', null)
  await insertInvite('hi-inv-2', 'hi-house-1', 'hi-token-2', 'hi-creator', null)
  await insertInvite('hi-inv-3', 'hi-house-2', 'hi-token-3', 'hi-creator', 'hi-gone')
  const duplicateToken = await postgresCodeOf(() =>
    insertInvite('hi-inv-dup', 'hi-house-2', 'hi-token-1', 'hi-creator', null),
  )
  assert(
    duplicateToken === '23505',
    `a second invite with the token of another is refused with 23505, after two invites with new tokens were accepted (read: ${duplicateToken ?? 'no error'})`,
  )
  const roles = await prisma.$queryRaw<{ locationRoles: unknown }[]>`
    SELECT "locationRoles" FROM "HouseholdInvite" WHERE "id" = 'hi-inv-1'
  `
  assert(
    JSON.stringify(roles[0]?.locationRoles) === '[{"role":"viewer","locationId":"hi-loc"}]' ||
      JSON.stringify(roles[0]?.locationRoles) === '[{"locationId":"hi-loc","role":"viewer"}]',
    `"locationRoles" stores and returns a JSON list (read: ${JSON.stringify(roles[0]?.locationRoles)})`,
  )

  console.log('add_household_invites — the deletes:')

  // ── 5. Deleting a household: SetNull on the person, Cascade on invites ──
  await prisma.$executeRaw`DELETE FROM "Household" WHERE "id" = 'hi-house-1'`
  const people = await prisma.$queryRaw<{ id: string; activeHouseholdId: string | null }[]>`
    SELECT "id", "activeHouseholdId" FROM "User" WHERE "id" IN ('hi-joiner','hi-other')
  `
  const joiner = people.find((p) => p.id === 'hi-joiner')
  const other = people.find((p) => p.id === 'hi-other')
  assert(
    joiner !== undefined && joiner.activeHouseholdId === null,
    `deleting a household sets "activeHouseholdId" to NULL and keeps the person (read: ${JSON.stringify(joiner)})`,
  )
  assert(
    other?.activeHouseholdId === 'hi-house-2',
    `a person whose active household is ANOTHER household is untouched (read: ${JSON.stringify(other)})`,
  )
  const invitesLeft = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "HouseholdInvite" WHERE "id" LIKE 'hi-%' ORDER BY "id"
  `
  assert(
    invitesLeft.map((r) => r.id).join(',') === 'hi-inv-3',
    `deleting a household deletes its invites and keeps another household's (read: ${invitesLeft.map((r) => r.id).join(', ') || 'none'})`,
  )

  // ── 6. Deleting a "User": SetNull on usedById, Restrict on createdById ──
  await prisma.$executeRaw`DELETE FROM "User" WHERE "id" = 'hi-gone'`
  const used = await prisma.$queryRaw<{ usedById: string | null; createdById: string }[]>`
    SELECT "usedById", "createdById" FROM "HouseholdInvite" WHERE "id" = 'hi-inv-3'
  `
  assert(
    used.length === 1 && used[0]?.usedById === null && used[0]?.createdById === 'hi-creator',
    `deleting the person who used an invite sets "usedById" to NULL and keeps the invite (read: ${JSON.stringify(used)})`,
  )
  const creatorDelete = await postgresCodeOf(
    () => prisma.$executeRaw`DELETE FROM "User" WHERE "id" = 'hi-creator'`,
  )
  const creatorLeft = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "User" WHERE "id" = 'hi-creator'
  `
  assert(
    creatorDelete === '23503' && Number(creatorLeft[0]?.n) === 1,
    `deleting a person who created an invite fails with 23503 and the person stays (read: ${creatorDelete ?? 'no error'}, rows left: ${creatorLeft[0]?.n})`,
  )

  // ── Clean up every row this block wrote ──
  await prisma.$executeRaw`DELETE FROM "HouseholdInvite" WHERE "id" LIKE 'hi-%'`
  await prisma.$executeRaw`UPDATE "User" SET "activeHouseholdId" = NULL WHERE "id" LIKE 'hi-%'`
  await prisma.$executeRaw`DELETE FROM "Household" WHERE "id" LIKE 'hi-%'`
  await prisma.$executeRaw`DELETE FROM "User" WHERE "id" LIKE 'hi-%'`
}

// The 19 values of "ActivityAction", in the order the migration creates them
// (households H6, decision T51). The H6b values are in it from the start.
const ACTIVITY_ACTIONS = [
  'LOCATION_ROLE_SET',
  'LOCATION_ROLE_REMOVED',
  'LOCATION_LEFT',
  'HOUSEHOLD_ROLE_CHANGED',
  'INVITE_CREATED',
  'INVITE_REVOKED',
  'MEMBER_JOINED',
  'MEMBER_LEFT',
  'MEMBER_REMOVED',
  'HOUSEHOLD_CLEARED',
  'LOCATIONS_DELETED',
  'LOCATION_ITEMS_REMOVED',
  'IMPORT',
  'OWNERSHIP_OFFERED',
  'OWNERSHIP_OFFER_CANCELLED',
  'OWNERSHIP_DECLINED',
  'OWNERSHIP_ACCEPTED',
  'HANDOVER_STARTED',
  'ACCOUNT_DELETED',
] as const

// add_household_activity (households H6, task J.1, decision T46). Written on
// 2026-11-20 and NOT run yet when it was written: no subagent may reach a
// database. The main session runs it with the owner's consent.
async function assertHouseholdActivity(): Promise<void> {
  console.log('add_household_activity — the shape:')

  // ── 1. The table, its columns, types and nullability ──
  const expected: Record<string, { type: string; nullable: 'YES' | 'NO' }> = {
    id: { type: 'text', nullable: 'NO' },
    householdId: { type: 'text', nullable: 'NO' },
    actorId: { type: 'text', nullable: 'NO' },
    action: { type: 'USER-DEFINED', nullable: 'NO' },
    targetUserId: { type: 'text', nullable: 'YES' },
    locationId: { type: 'text', nullable: 'YES' },
    details: { type: 'jsonb', nullable: 'YES' },
    createdAt: { type: 'timestamp without time zone', nullable: 'NO' },
  }
  const columns = await columnNamesOf('HouseholdActivity')
  assert(
    columns.size === Object.keys(expected).length,
    `"HouseholdActivity" has exactly ${Object.keys(expected).length} columns (read: ${[...columns].sort().join(', ') || 'no table'})`,
  )
  for (const [column, want] of Object.entries(expected)) {
    const meta = await columnMetaOf('HouseholdActivity', column)
    assert(
      meta?.dataType === want.type && meta.isNullable === want.nullable,
      `"HouseholdActivity"."${column}" is ${want.type}, nullable=${want.nullable} (read: ${meta ? `${meta.dataType}, nullable=${meta.isNullable}` : 'column missing'})`,
    )
  }

  // `data_type` says only USER-DEFINED for an enum; `udt_name` names it.
  const actionType = await prisma.$queryRaw<{ udt_name: string }[]>`
    SELECT udt_name::text AS udt_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name::text = 'HouseholdActivity'
      AND column_name::text = 'action'
  `
  assert(
    actionType[0]?.udt_name === 'ActivityAction',
    `"HouseholdActivity"."action" is of the type "ActivityAction" (read: ${actionType[0]?.udt_name ?? 'column missing'})`,
  )

  // ── 2. The enum holds the 19 values of decision T51, in order ──
  const enumValues = await prisma.$queryRaw<{ value: string }[]>`
    SELECT e.enumlabel::text AS value
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ActivityAction'
    ORDER BY e.enumsortorder
  `
  assert(
    enumValues.map((v) => v.value).join(',') === ACTIVITY_ACTIONS.join(','),
    `"ActivityAction" holds exactly the ${ACTIVITY_ACTIONS.length} values of decision T51, H6b's included (read: ${enumValues.map((v) => v.value).join(', ') || 'no type'})`,
  )

  // ── 3. Foreign keys: ONE, on "householdId", to "Household", CASCADE ──
  //
  // Read from information_schema by COLUMN NAME, never with
  // `LIKE '%Id%'`: the H3a rehearsal matched an unrelated foreign key that
  // way and reported a false FAIL (apps/server/prisma/CLAUDE.md).
  const foreignKeys = await prisma.$queryRaw<
    { column_name: string; foreign_table: string; delete_rule: string }[]
  >`
    SELECT kcu.column_name::text AS column_name,
           ccu.table_name::text AS foreign_table,
           rc.delete_rule::text AS delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name::text = 'HouseholdActivity'
      AND tc.constraint_type = 'FOREIGN KEY'
  `
  const fkText = foreignKeys.map((f) => `${f.column_name}->${f.foreign_table} ${f.delete_rule}`).join(', ')
  assert(
    foreignKeys.length === 1 &&
      foreignKeys[0]?.column_name === 'householdId' &&
      foreignKeys[0]?.foreign_table === 'Household' &&
      foreignKeys[0]?.delete_rule === 'CASCADE',
    `"HouseholdActivity" has exactly one foreign key: "householdId" to "Household", ON DELETE CASCADE (read: ${fkText || 'none'})`,
  )
  for (const column of ['actorId', 'targetUserId', 'locationId']) {
    assert(
      !foreignKeys.some((f) => f.column_name === column),
      `"HouseholdActivity"."${column}" has NO foreign key — a log outlives the person and the location it names (read: ${fkText || 'none'})`,
    )
  }

  // ── 4. The index the Activity page reads ──
  const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname::text AS indexname, indexdef
    FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'HouseholdActivity'
  `
  const pageIndex = indexes.find(
    (i) => i.indexname === 'HouseholdActivity_householdId_createdAt_id_idx',
  )?.indexdef
  // "id" is lower case, so Postgres prints it with no quotes (the H5b run
  // found the same for "token").
  assert(
    !!pageIndex &&
      !pageIndex.includes('UNIQUE') &&
      pageIndex.includes('("householdId", "createdAt" DESC, id)'),
    `"HouseholdActivity_householdId_createdAt_id_idx" is a plain index on ("householdId", "createdAt" DESC, id) (read: ${pageIndex ?? 'missing'})`,
  )

  // ── Fixture: two households, no "User" rows at all ──
  await prisma.$executeRaw`
    INSERT INTO "Household" ("id","name","createdAt","updatedAt") VALUES
      ('ha-house-1','Activity One',NOW(),NOW()),
      ('ha-house-2','Activity Two',NOW(),NOW())
  `

  console.log('add_household_activity — the writes and the deletes:')

  // ── 5. Ids that name no row are accepted: no hidden foreign key ──
  //
  // Neither "ha-nobody" nor "ha-no-location" is a row anywhere. A foreign key
  // on any of the three columns would refuse this insert with 23503.
  const plainIds = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "HouseholdActivity" ("id","householdId","actorId","action","targetUserId","locationId","details")
      VALUES ('ha-act-1','ha-house-1','ha-nobody','LOCATION_ROLE_SET'::"ActivityAction",
              'ha-nobody-else','ha-no-location','{"locationName":"Gone","from":null,"to":"viewer"}'::jsonb)
    `,
  )
  assert(
    plainIds === undefined,
    `a row whose actor, target and location name no row is accepted (read: ${plainIds ?? 'no error'})`,
  )

  // ── 6. Defaults, and NULL for the optional columns ──
  await prisma.$executeRaw`
    INSERT INTO "HouseholdActivity" ("id","householdId","actorId","action")
    VALUES ('ha-act-2','ha-house-1','ha-nobody','HOUSEHOLD_CLEARED'::"ActivityAction"),
           ('ha-act-3','ha-house-2','ha-nobody','MEMBER_JOINED'::"ActivityAction")
  `
  const bare = await prisma.$queryRaw<
    { targetUserId: string | null; locationId: string | null; details: unknown; createdAt: Date | null }[]
  >`
    SELECT "targetUserId", "locationId", "details", "createdAt" FROM "HouseholdActivity" WHERE "id" = 'ha-act-2'
  `
  assert(
    bare.length === 1 &&
      bare[0]?.targetUserId === null &&
      bare[0]?.locationId === null &&
      bare[0]?.details === null &&
      bare[0]?.createdAt instanceof Date,
    `a row with no optional column reads them back NULL, and "createdAt" is filled in (read: ${JSON.stringify(bare)})`,
  )

  // ── 7. The enum refuses a value it does not hold ──
  const badAction = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "HouseholdActivity" ("id","householdId","actorId","action")
      VALUES ('ha-act-bad','ha-house-1','ha-nobody','NOT_AN_ACTION'::"ActivityAction")
    `,
  )
  assert(
    badAction !== undefined,
    `an action outside "ActivityAction" is refused (read: ${badAction ?? 'no error'})`,
  )

  // ── 8. A household that does not exist is refused ──
  const unknownHousehold = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "HouseholdActivity" ("id","householdId","actorId","action")
      VALUES ('ha-act-orphan','ha-no-such-house','ha-nobody','MEMBER_LEFT'::"ActivityAction")
    `,
  )
  assert(
    unknownHousehold === '23503',
    `a row for a household that does not exist is refused with 23503 (read: ${unknownHousehold ?? 'no error'})`,
  )

  // ── 9. Deleting a household deletes its rows, and no others ──
  await prisma.$executeRaw`DELETE FROM "Household" WHERE "id" = 'ha-house-1'`
  const left = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "HouseholdActivity" WHERE "id" LIKE 'ha-%' ORDER BY "id"
  `
  assert(
    left.map((r) => r.id).join(',') === 'ha-act-3',
    `deleting a household deletes its activity rows and keeps another household's (read: ${left.map((r) => r.id).join(', ') || 'none'})`,
  )

  // ── Clean up every row this block wrote ──
  await prisma.$executeRaw`DELETE FROM "HouseholdActivity" WHERE "id" LIKE 'ha-%'`
  await prisma.$executeRaw`DELETE FROM "Household" WHERE "id" LIKE 'ha-%'`
}

// add_ownership_offers (households H6b, task K.1, decision T58). Written on
// 2026-11-20 and NOT run yet when it was written: no subagent may reach a
// database. The main session runs it with the owner's consent.
async function assertOwnershipOffers(): Promise<void> {
  console.log('add_ownership_offers — the shape:')

  // ── 1. The table, its columns, types and nullability ──
  const expected: Record<string, { type: string; nullable: 'YES' | 'NO' }> = {
    id: { type: 'text', nullable: 'NO' },
    householdId: { type: 'text', nullable: 'NO' },
    toUserId: { type: 'text', nullable: 'NO' },
    fromUserId: { type: 'text', nullable: 'YES' },
    kind: { type: 'USER-DEFINED', nullable: 'NO' },
    createdAt: { type: 'timestamp without time zone', nullable: 'NO' },
    dismissedAt: { type: 'timestamp without time zone', nullable: 'YES' },
  }
  const columns = await columnNamesOf('OwnershipOffer')
  assert(
    columns.size === Object.keys(expected).length,
    `"OwnershipOffer" has exactly ${Object.keys(expected).length} columns (read: ${[...columns].sort().join(', ') || 'no table'})`,
  )
  for (const [column, want] of Object.entries(expected)) {
    const meta = await columnMetaOf('OwnershipOffer', column)
    assert(
      meta?.dataType === want.type && meta.isNullable === want.nullable,
      `"OwnershipOffer"."${column}" is ${want.type}, nullable=${want.nullable} (read: ${meta ? `${meta.dataType}, nullable=${meta.isNullable}` : 'column missing'})`,
    )
  }

  // `data_type` says only USER-DEFINED for an enum; `udt_name` names it.
  const kindType = await prisma.$queryRaw<{ udt_name: string }[]>`
    SELECT udt_name::text AS udt_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name::text = 'OwnershipOffer'
      AND column_name::text = 'kind'
  `
  assert(
    kindType[0]?.udt_name === 'OfferKind',
    `"OwnershipOffer"."kind" is of the type "OfferKind" (read: ${kindType[0]?.udt_name ?? 'column missing'})`,
  )

  // ── 2. The enum holds exactly transfer and handover, in that order ──
  const enumValues = await prisma.$queryRaw<{ value: string }[]>`
    SELECT e.enumlabel::text AS value
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OfferKind'
    ORDER BY e.enumsortorder
  `
  assert(
    enumValues.map((v) => v.value).join(',') === 'transfer,handover',
    `"OfferKind" holds exactly transfer, handover (read: ${enumValues.map((v) => v.value).join(', ') || 'no type'})`,
  )

  // ── 3. Foreign keys: TWO, both CASCADE, and none on "fromUserId" ──
  //
  // Read from information_schema by COLUMN NAME, never with `LIKE '%Id%'`:
  // the H3a rehearsal matched an unrelated foreign key that way and reported
  // a false FAIL (apps/server/prisma/CLAUDE.md).
  const foreignKeys = await prisma.$queryRaw<
    { column_name: string; foreign_table: string; delete_rule: string }[]
  >`
    SELECT kcu.column_name::text AS column_name,
           ccu.table_name::text AS foreign_table,
           rc.delete_rule::text AS delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name::text = 'OwnershipOffer'
      AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY kcu.column_name
  `
  const fkText = foreignKeys.map((f) => `${f.column_name}->${f.foreign_table} ${f.delete_rule}`).join(', ')
  assert(
    fkText === 'householdId->Household CASCADE, toUserId->User CASCADE',
    `"OwnershipOffer" has exactly two foreign keys: "householdId" to "Household" and "toUserId" to "User", both ON DELETE CASCADE (read: ${fkText || 'none'})`,
  )
  assert(
    !foreignKeys.some((f) => f.column_name === 'fromUserId'),
    `"OwnershipOffer"."fromUserId" has NO foreign key — it only names who offered (read: ${fkText || 'none'})`,
  )

  // ── 4. The unique pair and the index by person ──
  const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname::text AS indexname, indexdef
    FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'OwnershipOffer'
  `
  const pairIndex = indexes.find((i) => i.indexname === 'OwnershipOffer_householdId_toUserId_key')?.indexdef
  assert(
    !!pairIndex &&
      pairIndex.includes('UNIQUE') &&
      pairIndex.includes('("householdId", "toUserId")'),
    `"OwnershipOffer_householdId_toUserId_key" is a UNIQUE index on ("householdId", "toUserId") (read: ${pairIndex ?? 'missing'})`,
  )
  const personIndex = indexes.find((i) => i.indexname === 'OwnershipOffer_toUserId_idx')?.indexdef
  assert(
    !!personIndex && !personIndex.includes('UNIQUE') && personIndex.includes('("toUserId")'),
    `"OwnershipOffer_toUserId_idx" is a plain index on ("toUserId") (read: ${personIndex ?? 'missing'})`,
  )

  // ── Fixture: two households, three people ──
  await prisma.$executeRaw`
    INSERT INTO "Household" ("id","name","createdAt","updatedAt") VALUES
      ('oo-house-1','Offers One',NOW(),NOW()),
      ('oo-house-2','Offers Two',NOW(),NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "User" ("id","displayName","createdAt","updatedAt") VALUES
      ('oo-owner','Owner',NOW(),NOW()),
      ('oo-taker','Taker',NOW(),NOW()),
      ('oo-other','Other',NOW(),NOW())
  `

  console.log('add_ownership_offers — the writes and the deletes:')

  // ── 5. Defaults, and a "fromUserId" that names no row is accepted ──
  const plainFrom = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "OwnershipOffer" ("id","householdId","toUserId","fromUserId","kind")
      VALUES ('oo-offer-1','oo-house-1','oo-taker','oo-nobody','transfer'::"OfferKind")
    `,
  )
  assert(
    plainFrom === undefined,
    `an offer whose "fromUserId" names no row is accepted (read: ${plainFrom ?? 'no error'})`,
  )
  const bare = await prisma.$queryRaw<{ dismissedAt: Date | null; createdAt: Date | null }[]>`
    SELECT "dismissedAt", "createdAt" FROM "OwnershipOffer" WHERE "id" = 'oo-offer-1'
  `
  assert(
    bare.length === 1 && bare[0]?.dismissedAt === null && bare[0]?.createdAt instanceof Date,
    `a new offer reads "dismissedAt" NULL and "createdAt" filled in (read: ${JSON.stringify(bare)})`,
  )

  // ── 6. One offer per person per household ──
  const samePair = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "OwnershipOffer" ("id","householdId","toUserId","kind")
      VALUES ('oo-offer-dup','oo-house-1','oo-taker','handover'::"OfferKind")
    `,
  )
  assert(
    samePair === '23505',
    `a second offer to the same person in the same household is refused with 23505, whatever its kind (read: ${samePair ?? 'no error'})`,
  )
  const otherPairs = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "OwnershipOffer" ("id","householdId","toUserId","fromUserId","kind") VALUES
        ('oo-offer-2','oo-house-2','oo-taker','oo-owner','transfer'::"OfferKind"),
        ('oo-offer-3','oo-house-1','oo-other',NULL,'handover'::"OfferKind"),
        ('oo-offer-4','oo-house-2','oo-other','oo-owner','transfer'::"OfferKind")
    `,
  )
  assert(
    otherPairs === undefined,
    `the same person in another household, and another person in the same household, are accepted (read: ${otherPairs ?? 'no error'})`,
  )

  // ── 7. The enum and the two foreign keys refuse what they must ──
  const badKind = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "OwnershipOffer" ("id","householdId","toUserId","kind")
      VALUES ('oo-offer-bad','oo-house-2','oo-owner','owner'::"OfferKind")
    `,
  )
  assert(badKind !== undefined, `a kind outside "OfferKind" is refused (read: ${badKind ?? 'no error'})`)
  const noHousehold = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "OwnershipOffer" ("id","householdId","toUserId","kind")
      VALUES ('oo-offer-orphan','oo-no-such-house','oo-taker','transfer'::"OfferKind")
    `,
  )
  assert(
    noHousehold === '23503',
    `an offer in a household that does not exist is refused with 23503 (read: ${noHousehold ?? 'no error'})`,
  )
  const noPerson = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "OwnershipOffer" ("id","householdId","toUserId","kind")
      VALUES ('oo-offer-nobody','oo-house-2','oo-no-such-user','transfer'::"OfferKind")
    `,
  )
  assert(
    noPerson === '23503',
    `an offer to a person with no "User" row is refused with 23503 (read: ${noPerson ?? 'no error'})`,
  )

  // ── 8. The cascades, and the absence of one ──
  const offerIds = async () =>
    (
      await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "OwnershipOffer" WHERE "id" LIKE 'oo-%' ORDER BY "id"
      `
    )
      .map((r) => r.id)
      .join(',')

  // The person who MADE two offers goes: both offers stay (no foreign key).
  await prisma.$executeRaw`DELETE FROM "User" WHERE "id" = 'oo-owner'`
  const afterFrom = await offerIds()
  assert(
    afterFrom === 'oo-offer-1,oo-offer-2,oo-offer-3,oo-offer-4',
    `deleting the "User" who made an offer keeps the offer (read: ${afterFrom || 'none'})`,
  )

  // The person an offer is made TO goes: their offers go, in both households.
  await prisma.$executeRaw`DELETE FROM "User" WHERE "id" = 'oo-taker'`
  const afterTo = await offerIds()
  assert(
    afterTo === 'oo-offer-3,oo-offer-4',
    `deleting the "User" an offer is made to deletes their offers in every household, and no other (read: ${afterTo || 'none'})`,
  )

  // A household goes: its offers go, the other household's stay.
  await prisma.$executeRaw`DELETE FROM "Household" WHERE "id" = 'oo-house-1'`
  const afterHousehold = await offerIds()
  assert(
    afterHousehold === 'oo-offer-4',
    `deleting a household deletes its offers and keeps another household's (read: ${afterHousehold || 'none'})`,
  )

  // ── Clean up every row this block wrote ──
  await prisma.$executeRaw`DELETE FROM "OwnershipOffer" WHERE "id" LIKE 'oo-%'`
  await prisma.$executeRaw`DELETE FROM "Household" WHERE "id" LIKE 'oo-%'`
  await prisma.$executeRaw`DELETE FROM "User" WHERE "id" LIKE 'oo-%'`
}

// ══════════════════════════════════════════════════════════════════════
// 20261122000000_add_location_preferences (households H7b, task M.1,
// decisions T74, T75 and T79). Written on 2026-11-22 and NOT run yet when it
// was written: no subagent may reach a database. The main session runs it
// with the owner's consent.
// ══════════════════════════════════════════════════════════════════════
//
// The migration has ONE backfill: "Location"."dataUpdatedAt" gets the newest
// "ItemStock"."updatedAt" of the location, and a location with no stock row
// keeps NULL. To prove that, the database needs, BEFORE the deploy, a
// location with several stock rows of different times, a second location
// with a stock row of its own (so the newest time must be read per
// location, not over the whole table), and a location with no stock row.
// seedLocationPreferenceBackfill writes them, with fixed times.
const LP_HOUSEHOLD_OWNER = 'user-a'
const LP_LOC_STOCK = 'lp-loc-stock'
const LP_LOC_OTHER = 'lp-loc-other'
const LP_LOC_EMPTY = 'lp-loc-empty'
// The newest of lp-loc-stock's two rows, and lp-loc-other's only row.
// lp-loc-other's row is NEWER than both of lp-loc-stock's, so a backfill that
// took the newest time of the whole table, or of the wrong location, gives
// lp-loc-stock the wrong value. A backfill that took the OLDEST time gives
// 2026-01-02, which is wrong too.
// The same times are written as SQL literals in seedLocationPreferenceBackfill.
const LP_STOCK_NEWEST = new Date('2026-03-04T05:06:07.123Z')
const LP_OTHER_ONLY = new Date('2026-05-06T00:00:00.000Z')

async function seedLocationPreferenceBackfill(): Promise<void> {
  console.log('Seeding stock rows for the add_location_preferences backfill...')
  const household = await prisma.household.findFirstOrThrow({
    where: { ownerId: LP_HOUSEHOLD_OWNER },
    select: { id: true },
  })
  // Raw SQL: the Prisma client knows "dataUpdatedAt", which is not there yet.
  await prisma.$executeRaw`
    INSERT INTO "Location" ("id","name","order","householdId","createdAt","updatedAt") VALUES
      (${LP_LOC_STOCK}, 'LP stock', 20, ${household.id}, NOW(), NOW()),
      (${LP_LOC_OTHER}, 'LP other', 21, ${household.id}, NOW(), NOW()),
      (${LP_LOC_EMPTY}, 'LP empty', 22, ${household.id}, NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "Item" ("id","name","targetUnit","consumeAmount","expirationMode","householdId","createdAt","updatedAt") VALUES
      ('item-lp-1', 'LP one', 'package', 1, 'disabled', ${household.id}, NOW(), NOW()),
      ('item-lp-2', 'LP two', 'package', 1, 'disabled', ${household.id}, NOW(), NOW())
  `
  // The times are SQL literals, not `Date` parameters, so the session's time
  // zone cannot shift them. A "timestamp without time zone" reads back as
  // that time in UTC, which is what the three constants above say.
  await prisma.$executeRaw`
    INSERT INTO "ItemStock" ("id","itemId","locationId","createdAt","updatedAt") VALUES
      ('lp-stock-1', 'item-lp-1', ${LP_LOC_STOCK}, '2026-01-02 00:00:00', '2026-03-04 05:06:07.123'),
      ('lp-stock-2', 'item-lp-2', ${LP_LOC_STOCK}, '2026-01-02 00:00:00', '2026-01-02 00:00:00'),
      ('lp-stock-3', 'item-lp-1', ${LP_LOC_OTHER}, '2026-01-02 00:00:00', '2026-05-06 00:00:00')
  `
}

// Runs right after the last deploy, BEFORE every other block, so no later
// write has moved an "ItemStock"."updatedAt" yet.
async function assertLocationDataUpdatedAtBackfill(): Promise<void> {
  console.log('add_location_preferences — the backfill of "dataUpdatedAt":')
  const rows = await prisma.$queryRaw<{ id: string; dataUpdatedAt: Date | null }[]>`
    SELECT "id", "dataUpdatedAt" FROM "Location"
    WHERE "id" IN (${LP_LOC_STOCK}, ${LP_LOC_OTHER}, ${LP_LOC_EMPTY})
  `
  const at = (id: string) => rows.find((r) => r.id === id)?.dataUpdatedAt
  const show = (value: Date | null | undefined) =>
    value === undefined ? 'row missing' : value === null ? 'NULL' : value.toISOString()
  assert(
    at(LP_LOC_STOCK)?.getTime() === LP_STOCK_NEWEST.getTime(),
    `a location with two stock rows gets the NEWER "updatedAt" of its own rows, ${LP_STOCK_NEWEST.toISOString()} (read: ${show(at(LP_LOC_STOCK))})`,
  )
  assert(
    at(LP_LOC_OTHER)?.getTime() === LP_OTHER_ONLY.getTime(),
    `a second location gets the time of its own stock row, ${LP_OTHER_ONLY.toISOString()} (read: ${show(at(LP_LOC_OTHER))})`,
  )
  assert(
    at(LP_LOC_EMPTY) === null,
    `a location with no stock row keeps NULL (read: ${show(at(LP_LOC_EMPTY))})`,
  )

  // And the same rule for EVERY location of the fixture, not only the three
  // seeded above. IS DISTINCT FROM treats NULL = NULL as equal, so a location
  // with no stock row passes only when it reads NULL.
  const wrong = await prisma.$queryRaw<{ id: string }[]>`
    SELECT l."id" FROM "Location" l
    WHERE l."dataUpdatedAt" IS DISTINCT FROM (
      SELECT max(s."updatedAt") FROM "ItemStock" s WHERE s."locationId" = l."id"
    )
  `
  const total = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Location"`
  assert(
    wrong.length === 0,
    `every one of the ${total[0]?.n ?? '?'} locations reads the newest "updatedAt" of its own stock rows, or NULL when it has none (wrong: ${wrong.map((r) => r.id).join(', ') || 'none'})`,
  )

  // Clean up the seeded rows, so no later block counts them.
  await prisma.$executeRaw`DELETE FROM "ItemStock" WHERE "id" LIKE 'lp-stock-%'`
  await prisma.$executeRaw`DELETE FROM "Item" WHERE "id" LIKE 'item-lp-%'`
  await prisma.$executeRaw`DELETE FROM "Location" WHERE "id" LIKE 'lp-loc-%'`
}

async function assertLocationPreferences(): Promise<void> {
  console.log('add_location_preferences — the shape:')

  // ── 1. The enum holds exactly the four sorts, in that order ──
  const enumValues = await prisma.$queryRaw<{ value: string }[]>`
    SELECT e.enumlabel::text AS value
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'LocationSort'
    ORDER BY e.enumsortorder
  `
  const enumText = enumValues.map((v) => v.value).join(',')
  assert(
    enumText === 'name,lastUpdated,lastVisited,custom',
    `"LocationSort" holds exactly name, lastUpdated, lastVisited, custom (read: ${enumText || 'no type'})`,
  )

  // ── 2. The two new columns on existing tables are nullable, and on the
  //       right table ──
  const sortMeta = await columnMetaOf('User', 'locationSort')
  const sortType = await prisma.$queryRaw<{ udt_name: string }[]>`
    SELECT udt_name::text AS udt_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name::text = 'User' AND column_name::text = 'locationSort'
  `
  assert(
    sortMeta?.dataType === 'USER-DEFINED' &&
      sortMeta.isNullable === 'YES' &&
      sortType[0]?.udt_name === 'LocationSort',
    `"User"."locationSort" is a nullable "LocationSort" (read: ${sortMeta ? `${sortMeta.dataType} ${sortType[0]?.udt_name ?? '?'}, nullable=${sortMeta.isNullable}` : 'column missing'})`,
  )
  const userRows = await prisma.user.count()
  const withSort = await prisma.user.count({ where: { locationSort: { not: null } } })
  assert(
    withSort === 0,
    `every existing "User" row reads "locationSort" NULL — no backfill, the server fills in the default (read: ${withSort} of ${userRows} set)`,
  )
  const dataMeta = await columnMetaOf('Location', 'dataUpdatedAt')
  assert(
    dataMeta?.dataType === 'timestamp without time zone' && dataMeta.isNullable === 'YES',
    `"Location"."dataUpdatedAt" is a nullable timestamp (read: ${dataMeta ? `${dataMeta.dataType}, nullable=${dataMeta.isNullable}` : 'column missing'})`,
  )
  assert(
    !(await columnNamesOf('ItemStock')).has('dataUpdatedAt') &&
      !(await columnNamesOf('Household')).has('locationSort'),
    '"dataUpdatedAt" is NOT on "ItemStock" and "locationSort" is NOT on "Household" — each is on its own table only',
  )

  // ── 3. The table, its columns, types and nullability ──
  const expected: Record<string, { type: string; nullable: 'YES' | 'NO' }> = {
    userId: { type: 'text', nullable: 'NO' },
    locationId: { type: 'text', nullable: 'NO' },
    customOrder: { type: 'integer', nullable: 'YES' },
    lastVisitedAt: { type: 'timestamp without time zone', nullable: 'YES' },
    updatedAt: { type: 'timestamp without time zone', nullable: 'NO' },
  }
  const columns = await columnNamesOf('LocationPreference')
  assert(
    columns.size === Object.keys(expected).length,
    `"LocationPreference" has exactly ${Object.keys(expected).length} columns (read: ${[...columns].sort().join(', ') || 'no table'})`,
  )
  for (const [column, want] of Object.entries(expected)) {
    const meta = await columnMetaOf('LocationPreference', column)
    assert(
      meta?.dataType === want.type && meta.isNullable === want.nullable,
      `"LocationPreference"."${column}" is ${want.type}, nullable=${want.nullable} (read: ${meta ? `${meta.dataType}, nullable=${meta.isNullable}` : 'column missing'})`,
    )
  }

  // ── 4. The primary key and the index on "locationId" ──
  const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname::text AS indexname, indexdef
    FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'LocationPreference'
  `
  const pkey = indexes.find((i) => i.indexname === 'LocationPreference_pkey')?.indexdef
  assert(
    !!pkey && pkey.includes('UNIQUE') && pkey.includes('("userId", "locationId")'),
    `"LocationPreference_pkey" is the primary key on ("userId", "locationId") (read: ${pkey ?? 'missing'})`,
  )
  const byLocation = indexes.find((i) => i.indexname === 'LocationPreference_locationId_idx')?.indexdef
  assert(
    !!byLocation && !byLocation.includes('UNIQUE') && byLocation.includes('("locationId")'),
    `"LocationPreference_locationId_idx" is a plain index on ("locationId") (read: ${byLocation ?? 'missing'})`,
  )
  assert(
    indexes.length === 2,
    `"LocationPreference" has exactly two indexes (read: ${indexes.map((i) => i.indexname).join(', ') || 'none'})`,
  )

  // ── 5. Foreign keys: exactly TWO, both CASCADE ──
  //
  // Read from information_schema by COLUMN NAME, never with `LIKE '%Id%'`:
  // the H3a rehearsal matched an unrelated foreign key that way and reported
  // a false FAIL (apps/server/prisma/CLAUDE.md).
  const foreignKeys = await prisma.$queryRaw<
    { column_name: string; foreign_table: string; delete_rule: string }[]
  >`
    SELECT kcu.column_name::text AS column_name,
           ccu.table_name::text AS foreign_table,
           rc.delete_rule::text AS delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name::text = 'LocationPreference'
      AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY kcu.column_name
  `
  const fkText = foreignKeys.map((f) => `${f.column_name}->${f.foreign_table} ${f.delete_rule}`).join(', ')
  assert(
    fkText === 'locationId->Location CASCADE, userId->User CASCADE',
    `"LocationPreference" has exactly two foreign keys: "locationId" to "Location" and "userId" to "User", both ON DELETE CASCADE (read: ${fkText || 'none'})`,
  )

  // ── Fixture: one household, two locations, two people ──
  await prisma.$executeRaw`
    INSERT INTO "Household" ("id","name","createdAt","updatedAt")
    VALUES ('lp-house','Preferences',NOW(),NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "Location" ("id","name","order","householdId","createdAt","updatedAt") VALUES
      ('lp-loc-1','One',0,'lp-house',NOW(),NOW()),
      ('lp-loc-2','Two',1,'lp-house',NOW(),NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "User" ("id","displayName","createdAt","updatedAt") VALUES
      ('lp-mia','Mia',NOW(),NOW()),
      ('lp-bea','Bea',NOW(),NOW())
  `

  console.log('add_location_preferences — the writes and the deletes:')

  // ── 6. A new row: NULL order and visit; one row per person per location ──
  const first = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "LocationPreference" ("userId","locationId","updatedAt") VALUES
        ('lp-mia','lp-loc-1',NOW()),
        ('lp-mia','lp-loc-2',NOW()),
        ('lp-bea','lp-loc-1',NOW()),
        ('lp-bea','lp-loc-2',NOW())
    `,
  )
  assert(first === undefined, `four preference rows, two people x two locations, are accepted (read: ${first ?? 'no error'})`)
  const bare = await prisma.$queryRaw<{ customOrder: number | null; lastVisitedAt: Date | null }[]>`
    SELECT "customOrder", "lastVisitedAt" FROM "LocationPreference"
    WHERE "userId" = 'lp-mia' AND "locationId" = 'lp-loc-1'
  `
  assert(
    bare.length === 1 && bare[0]?.customOrder === null && bare[0]?.lastVisitedAt === null,
    `a new row reads "customOrder" and "lastVisitedAt" NULL (read: ${JSON.stringify(bare)})`,
  )
  const samePair = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "LocationPreference" ("userId","locationId","customOrder","updatedAt")
      VALUES ('lp-mia','lp-loc-1',3,NOW())
    `,
  )
  assert(
    samePair === '23505',
    `a second row for the same person and location is refused with 23505 (read: ${samePair ?? 'no error'})`,
  )
  const noLocation = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "LocationPreference" ("userId","locationId","updatedAt")
      VALUES ('lp-mia','lp-no-such-location',NOW())
    `,
  )
  assert(
    noLocation === '23503',
    `a row for a location that does not exist is refused with 23503 (read: ${noLocation ?? 'no error'})`,
  )
  const noPerson = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "LocationPreference" ("userId","locationId","updatedAt")
      VALUES ('lp-no-such-user','lp-loc-1',NOW())
    `,
  )
  assert(
    noPerson === '23503',
    `a row for a person with no "User" row is refused with 23503 (read: ${noPerson ?? 'no error'})`,
  )

  // ── 7. The two cascades ──
  const prefKeys = async () =>
    (
      await prisma.$queryRaw<{ k: string }[]>`
        SELECT "userId" || '@' || "locationId" AS k FROM "LocationPreference"
        WHERE "userId" LIKE 'lp-%' ORDER BY 1
      `
    )
      .map((r) => r.k)
      .join(',')

  // A location goes: its rows go, the other location's stay.
  await prisma.$executeRaw`DELETE FROM "Location" WHERE "id" = 'lp-loc-1'`
  const afterLocation = await prefKeys()
  assert(
    afterLocation === 'lp-bea@lp-loc-2,lp-mia@lp-loc-2',
    `deleting a location deletes its preference rows and keeps another location's (read: ${afterLocation || 'none'})`,
  )

  // A person goes: their rows go, the other person's stay.
  await prisma.$executeRaw`DELETE FROM "User" WHERE "id" = 'lp-mia'`
  const afterUser = await prefKeys()
  assert(
    afterUser === 'lp-bea@lp-loc-2',
    `deleting a "User" deletes their preference rows and keeps another person's (read: ${afterUser || 'none'})`,
  )

  // ── Clean up every row this block wrote ──
  await prisma.$executeRaw`DELETE FROM "LocationPreference" WHERE "userId" LIKE 'lp-%'`
  await prisma.$executeRaw`DELETE FROM "Location" WHERE "id" LIKE 'lp-loc-%'`
  await prisma.$executeRaw`DELETE FROM "Household" WHERE "id" = 'lp-house'`
  await prisma.$executeRaw`DELETE FROM "User" WHERE "id" LIKE 'lp-%'`
}

// ══════════════════════════════════════════════════════════════════════
// 20261125000000 — "Item"."consumable"
// ══════════════════════════════════════════════════════════════════════
//
// One NOT NULL column with DEFAULT true and no backfill: Postgres fills every
// existing row with the default while it adds the column. So the checks are:
//
//   1. the column is on "Item" and NOT on "ItemStock" (the two tables share
//      field names, so "present on Item" alone cannot catch the wrong table)
//   2. it is a NOT NULL boolean with DEFAULT true
//   3. every "Item" row written BEFORE the migration reads true. The ids are
//      read before the last deploy, in `itemIdsBeforeConsumable`
//   4. a row inserted without the column reads true, an explicit NULL is
//      refused (23502), and false is stored as false, so check 3 cannot pass
//      by the column being unwritable

// Read in the pre-deploy phase. Raw SQL: the Prisma client knows
// "consumable", which is not there yet.
async function itemIdsBeforeConsumable(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Item"`
  return rows.map((r) => r.id)
}

async function assertItemConsumable(idsBefore: readonly string[]): Promise<void> {
  console.log('add_item_consumable:')

  // ── 1. On the right table ──
  assert((await columnNamesOf('Item')).has('consumable'), '"Item"."consumable" exists')
  assert(
    !(await columnNamesOf('ItemStock')).has('consumable'),
    '"consumable" is NOT on "ItemStock" — it is global item configuration, not per-location state',
  )

  // ── 2. NOT NULL boolean, DEFAULT true ──
  const meta = await columnMetaOf('Item', 'consumable')
  const defaults = await prisma.$queryRaw<{ column_default: string | null }[]>`
    SELECT column_default::text AS column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name::text = 'Item' AND column_name::text = 'consumable'
  `
  const columnDefault = defaults[0]?.column_default ?? null
  assert(
    meta?.dataType === 'boolean' && meta.isNullable === 'NO',
    `"Item"."consumable" is a NOT NULL boolean (read: ${meta ? `${meta.dataType}, nullable=${meta.isNullable}` : 'column missing'})`,
  )
  assert(columnDefault === 'true', `"Item"."consumable" defaults to true (read: ${columnDefault ?? 'no default'})`)

  // ── 3. Every row written before the migration reads true ──
  // Some of those rows were deleted by later checks, so read the ones left.
  const before = await prisma.$queryRaw<{ id: string; consumable: boolean | null }[]>`
    SELECT "id", "consumable" FROM "Item" WHERE "id" = ANY(${[...idsBefore]})
  `
  assert(
    before.length > 0,
    `at least one "Item" row written before the migration is still there to check (read: ${before.length} of ${idsBefore.length})`,
  )
  const notTrue = before.filter((r) => r.consumable !== true).map((r) => `${r.id}=${String(r.consumable)}`)
  assert(
    notTrue.length === 0,
    `every "Item" row written before the migration reads consumable = true (${before.length} rows; not true: ${notTrue.join(', ') || 'none'})`,
  )

  // ── 4. Writes after the migration ──
  const householdId = (
    await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Household" WHERE "ownerId" = 'user-a'`
  )[0]?.id
  assert(householdId !== undefined, "user-a's household exists, for the consumable write checks")
  await prisma.$executeRaw`
    INSERT INTO "Item" ("id","name","targetUnit","consumeAmount","expirationMode","householdId","createdAt","updatedAt")
    VALUES ('item-consumable-default','Rice','package',1,'disabled',${householdId},NOW(),NOW())
  `
  const omitted = await prisma.$queryRaw<{ consumable: boolean | null }[]>`
    SELECT "consumable" FROM "Item" WHERE "id" = 'item-consumable-default'
  `
  assert(
    omitted[0]?.consumable === true,
    `an "Item" inserted without "consumable" reads true (read: ${String(omitted[0]?.consumable)})`,
  )
  const nullCode = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "Item" ("id","name","targetUnit","consumeAmount","expirationMode","consumable","householdId","createdAt","updatedAt")
      VALUES ('item-consumable-null','Cup','package',1,'disabled',NULL,${householdId},NOW(),NOW())
    `,
  )
  assert(nullCode === '23502', `an explicit NULL "consumable" is refused with 23502 (read: ${nullCode ?? 'no error'})`)
  await prisma.$executeRaw`
    INSERT INTO "Item" ("id","name","targetUnit","consumeAmount","expirationMode","consumable","householdId","createdAt","updatedAt")
    VALUES ('item-consumable-false','Cup','package',1,'disabled',false,${householdId},NOW(),NOW())
  `
  const stored = await prisma.item.findUnique({ where: { id: 'item-consumable-false' }, select: { consumable: true } })
  assert(stored?.consumable === false, `an "Item" written with consumable = false reads false (read: ${String(stored?.consumable)})`)

  // Clean up, so no later block counts these rows.
  await prisma.$executeRaw`DELETE FROM "Item" WHERE "id" LIKE 'item-consumable-%'`
}

// ══════════════════════════════════════════════════════════════════════
// 20261126000000 — "ItemStock"."isActive"
// ══════════════════════════════════════════════════════════════════════
//
// Design: docs/features/items/2026-11-26-item-stock-active-design.md. Written
// on 2026-11-27 and NOT run yet when it was written: no subagent may reach a
// database. The main session runs it with the owner's consent.
//
// One NOT NULL column with DEFAULT true, then ONE backfill UPDATE: a row with
// target 0 gets false, because "target 0" meant "inactive here" until now.
// So the checks are:
//
//   1. the column is on "ItemStock" and NOT on "Item" (the two tables share
//      field names, so "present on ItemStock" alone cannot catch the wrong
//      table)
//   2. it is a NOT NULL boolean with DEFAULT true
//   3. the three rows seeded BEFORE the deploy, read back by id: target 0
//      reads false, target 5 and target 0.5 read true. 0.5 is there so a
//      backfill that compared with `< 1` or rounded the target is caught
//   4. every "ItemStock" row of the fixture follows the old rule, not only
//      the three seeded ones
//   5. a row inserted without the column reads true, even with target 0 (the
//      default is the constant true, not the old rule), and an explicit NULL
//      is refused (23502)
//
// Removing the UPDATE from the migration must make check 3 fail on the
// target 0 row (it would read true). That mutation needs a database, so the
// main session runs it.
const IA_LOC = 'ia-loc'
const IA_STOCK_ZERO = 'ia-stock-0'
const IA_STOCK_FIVE = 'ia-stock-5'
const IA_STOCK_HALF = 'ia-stock-half'

// Runs in the pre-deploy phase. Raw SQL: the Prisma client knows "isActive",
// which is not there yet.
async function seedItemStockIsActiveBackfill(): Promise<void> {
  console.log('Seeding stock rows for the add_item_stock_is_active backfill...')
  const household = await prisma.household.findFirstOrThrow({
    where: { ownerId: 'user-a' },
    select: { id: true },
  })
  await prisma.$executeRaw`
    INSERT INTO "Location" ("id","name","order","householdId","createdAt","updatedAt")
    VALUES (${IA_LOC}, 'IA location', 30, ${household.id}, NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "Item" ("id","name","targetUnit","consumeAmount","expirationMode","householdId","createdAt","updatedAt") VALUES
      ('item-ia-0', 'IA zero', 'package', 1, 'disabled', ${household.id}, NOW(), NOW()),
      ('item-ia-5', 'IA five', 'package', 1, 'disabled', ${household.id}, NOW(), NOW()),
      ('item-ia-half', 'IA half', 'package', 1, 'disabled', ${household.id}, NOW(), NOW()),
      ('item-ia-new', 'IA new', 'package', 1, 'disabled', ${household.id}, NOW(), NOW())
  `
  await prisma.$executeRaw`
    INSERT INTO "ItemStock" ("id","itemId","locationId","targetQuantity","createdAt","updatedAt") VALUES
      (${IA_STOCK_ZERO}, 'item-ia-0', ${IA_LOC}, 0, NOW(), NOW()),
      (${IA_STOCK_FIVE}, 'item-ia-5', ${IA_LOC}, 5, NOW(), NOW()),
      (${IA_STOCK_HALF}, 'item-ia-half', ${IA_LOC}, 0.5, NOW(), NOW())
  `
}

// Runs right after the last deploy, after assertLocationDataUpdatedAtBackfill
// (which must be first) and before every other block, so no later write has
// changed a stock row yet.
async function assertItemStockIsActive(): Promise<void> {
  console.log('add_item_stock_is_active:')

  // ── 1. On the right table ──
  assert((await columnNamesOf('ItemStock')).has('isActive'), '"ItemStock"."isActive" exists')
  assert(
    !(await columnNamesOf('Item')).has('isActive'),
    '"isActive" is NOT on "Item" — it is per-location state, not global item configuration',
  )

  // ── 2. NOT NULL boolean, DEFAULT true ──
  const meta = await columnMetaOf('ItemStock', 'isActive')
  const defaults = await prisma.$queryRaw<{ column_default: string | null }[]>`
    SELECT column_default::text AS column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name::text = 'ItemStock' AND column_name::text = 'isActive'
  `
  const columnDefault = defaults[0]?.column_default ?? null
  assert(
    meta?.dataType === 'boolean' && meta.isNullable === 'NO',
    `"ItemStock"."isActive" is a NOT NULL boolean (read: ${meta ? `${meta.dataType}, nullable=${meta.isNullable}` : 'column missing'})`,
  )
  assert(columnDefault === 'true', `"ItemStock"."isActive" defaults to true (read: ${columnDefault ?? 'no default'})`)

  // ── 3. The three seeded rows, read back by id ──
  const seeded = await prisma.$queryRaw<{ id: string; isActive: boolean | null }[]>`
    SELECT "id", "isActive" FROM "ItemStock"
    WHERE "id" IN (${IA_STOCK_ZERO}, ${IA_STOCK_FIVE}, ${IA_STOCK_HALF})
  `
  const activeOf = (id: string) => {
    const row = seeded.find((r) => r.id === id)
    return row === undefined ? 'row missing' : String(row.isActive)
  }
  assert(
    activeOf(IA_STOCK_ZERO) === 'false',
    `a stock row with target 0 before the migration reads isActive = false (read: ${activeOf(IA_STOCK_ZERO)})`,
  )
  assert(
    activeOf(IA_STOCK_FIVE) === 'true',
    `a stock row with target 5 before the migration reads isActive = true (read: ${activeOf(IA_STOCK_FIVE)})`,
  )
  assert(
    activeOf(IA_STOCK_HALF) === 'true',
    `a stock row with target 0.5 before the migration reads isActive = true (read: ${activeOf(IA_STOCK_HALF)})`,
  )

  // ── 4. Every stock row of the fixture follows the old rule ──
  const wrong = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "ItemStock" WHERE "isActive" IS DISTINCT FROM ("targetQuantity" <> 0)
  `
  const total = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "ItemStock"`
  assert(
    wrong.length === 0,
    `every one of the ${total[0]?.n ?? '?'} stock rows reads isActive = (targetQuantity <> 0) (wrong: ${wrong.map((r) => r.id).join(', ') || 'none'})`,
  )

  // ── 5. Writes after the migration ──
  await prisma.$executeRaw`
    INSERT INTO "ItemStock" ("id","itemId","locationId","targetQuantity","createdAt","updatedAt")
    VALUES ('ia-stock-default', 'item-ia-new', ${IA_LOC}, 0, NOW(), NOW())
  `
  const omitted = await prisma.$queryRaw<{ isActive: boolean | null }[]>`
    SELECT "isActive" FROM "ItemStock" WHERE "id" = 'ia-stock-default'
  `
  assert(
    omitted[0]?.isActive === true,
    `a stock row inserted without "isActive", with target 0, reads true (read: ${String(omitted[0]?.isActive)})`,
  )
  await prisma.$executeRaw`DELETE FROM "ItemStock" WHERE "id" = 'ia-stock-default'`
  const nullCode = await postgresCodeOf(
    () => prisma.$executeRaw`
      INSERT INTO "ItemStock" ("id","itemId","locationId","isActive","createdAt","updatedAt")
      VALUES ('ia-stock-null', 'item-ia-new', ${IA_LOC}, NULL, NOW(), NOW())
    `,
  )
  assert(nullCode === '23502', `an explicit NULL "isActive" is refused with 23502 (read: ${nullCode ?? 'no error'})`)

  // Clean up, so no later block counts these rows.
  await prisma.$executeRaw`DELETE FROM "ItemStock" WHERE "id" LIKE 'ia-stock-%'`
  await prisma.$executeRaw`DELETE FROM "Item" WHERE "id" LIKE 'item-ia-%'`
  await prisma.$executeRaw`DELETE FROM "Location" WHERE "id" = ${IA_LOC}`
}

async function main(): Promise<void> {
  // Self-heal: if a previous run was killed between parking and restoring,
  // recover instead of throwing on the renameSync below.
  restoreIfParked()

  let itemIdsBeforeLastDeploy: string[] = []

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

    // Apply migrations 1-6 first, then seed the "User" rows that only exist
    // once add_user has run. See seedUsersBeforeHouseholds for why.
    //
    // Only the names of the "first" group. Until H5b task G.1 this loop put
    // back "every migration except three named ones", so add_household_invites
    // was put back here too and would have failed: its CREATE TABLE needs the
    // "HouseholdRole" type, which add_households creates in the next deploy.
    restoreDeploy('first')
    execSync('pnpm exec prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'inherit' })
    await seedUsersBeforeHouseholds()
    await seedCrossHouseholdReferences()

    restoreDeploy('households')
    execSync('pnpm exec prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'inherit' })

    console.log(`Asserting, before ${DROP_USER_SCOPE_MIGRATION}...`)

    // Runs FIRST, before the older blocks below, because those blocks delete
    // three locations and an item. Read now, the database is exactly what
    // add_households left.
    await assertHouseholdsBackfill()

    // Reads "Location"."userId" and "isDefault", and checks cart items and a
    // log that drop_user_scope's cleanup deletes, so it must run now.
    await assertLocationMigrationsBeforeDrop()

    // What the old server could write after add_households commits and
    // before the new server takes traffic, plus one row of each kind
    // drop_user_scope's cleanup handles.
    await seedBetweenDeploys()

    // Inside the `try` since H3b task B.3: shared_carts must stay parked
    // during this deploy, and `restoreIfParked` in `finally` restores every
    // parked migration. So drop_user_scope is restored on its own here.
    restoreDeploy('drop user scope')
    execSync('pnpm exec prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'inherit' })

    console.log(`Asserting, after ${DROP_USER_SCOPE_MIGRATION}...`)
    await assertDropUserScope()

    // Duplicate cart rows, which only a database before shared_carts can hold.
    await seedSharedCartDuplicates()

    // Stock rows with fixed times, which add_location_preferences' backfill
    // reads (households H7b task M.1). Raw SQL only: see the function.
    await seedLocationPreferenceBackfill()

    // Stock rows with target 0, 5 and 0.5, which add_item_stock_is_active's
    // backfill reads. Before itemIdsBeforeConsumable, so its items are also
    // checked by assertItemConsumable. Raw SQL only: see the function.
    await seedItemStockIsActiveBackfill()

    // The "Item" rows that exist before add_item_consumable, so its check can
    // prove each of them reads true after the deploy.
    itemIdsBeforeLastDeploy = await itemIdsBeforeConsumable()
  } finally {
    restoreIfParked()
    parked = false
  }

  // The "last" group: restoreIfParked put back every migration still parked,
  // and `migrationDeploys.ts` says those are exactly this group.
  console.log(`Applying the "last" deploy: ${migrationsOfDeploy('last').join(', ')}...`)
  execSync('pnpm exec prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'inherit' })

  // FIRST after the deploy: it compares "dataUpdatedAt" with the stock rows'
  // times, so it must run before any later block writes a stock row.
  console.log(`Asserting the backfill of ${LOCATION_PREFERENCES_MIGRATION}...`)
  await assertLocationDataUpdatedAtBackfill()

  // SECOND after the deploy: its "every stock row follows the old rule" check
  // must run before any later block writes a stock row. It reads no
  // "updatedAt" and writes its own rows only after that check, so it does not
  // disturb the block above.
  console.log(`Asserting the backfill of ${ITEM_STOCK_IS_ACTIVE_MIGRATION}...`)
  await assertItemStockIsActive()

  console.log(`Asserting, after ${SHARED_CARTS_MIGRATION}...`)
  await assertSharedCarts()

  // Before every later block: its check that every existing "User" row reads
  // NULL must run before anything writes "activeHouseholdId".
  console.log(`Asserting, after ${HOUSEHOLD_INVITES_MIGRATION}...`)
  await assertHouseholdInvites()

  console.log(`Asserting, after ${HOUSEHOLD_ACTIVITY_MIGRATION}...`)
  await assertHouseholdActivity()

  console.log(`Asserting, after ${OWNERSHIP_OFFERS_MIGRATION}...`)
  await assertOwnershipOffers()

  console.log(`Asserting, after ${LOCATION_PREFERENCES_MIGRATION}...`)
  await assertLocationPreferences()

  console.log(`Asserting, after ${ITEM_CONSUMABLE_MIGRATION}...`)
  await assertItemConsumable(itemIdsBeforeLastDeploy)

  // ══════════════════════════════════════════════════════════════════════
  // PR 5 — Item's five stock state columns are gone, ItemStock's are not
  // ══════════════════════════════════════════════════════════════════════
  //
  // BOTH halves are required, and the second is the one that earns its place.
  // "Item" and "ItemStock" declare the SAME five field names, so a migration
  // that dropped them from the wrong table is indistinguishable from the right
  // one when you only look at "Item". Checking "Item" alone would pass against
  //   ALTER TABLE "ItemStock" DROP COLUMN ...
  // as happily as against the real migration.
  //
  // Row deletions earlier in this script cannot affect either answer — these
  // read the catalog, not the data.
  const itemColumns = await columnNamesOf('Item')
  const itemStockColumns = await columnNamesOf('ItemStock')

  const leftOnItem = STOCK_STATE_COLUMNS.filter((c) => itemColumns.has(c))
  assert(
    leftOnItem.length === 0,
    `none of the five state columns is left on "Item"${leftOnItem.length ? ` (still present: ${leftOnItem.join(', ')})` : ''}`,
  )

  const missingOnItemStock = STOCK_STATE_COLUMNS.filter((c) => !itemStockColumns.has(c))
  assert(
    missingOnItemStock.length === 0,
    `all five state columns are still on "ItemStock", their real home — this is the half that catches a drop aimed at the wrong table${missingOnItemStock.length ? ` (missing: ${missingOnItemStock.join(', ')})` : ''}`,
  )

  // The inverse control inside "Item" itself. "consumeAmount" sits between
  // "unpackedQuantity" and "dueDate" in the model and looks like one of the
  // five, but it is global configuration — one step size per item, the same in
  // every location. A drop that took one column too many fails here.
  assert(
    itemColumns.has('consumeAmount'),
    '"Item"."consumeAmount" survives — it sits among the five in the model but is global configuration, not per-location state',
  )

  // ══════════════════════════════════════════════════════════════════════
  // 20261008000000 — Item."wikidataUrl" and Item."note" (issue #335)
  // ══════════════════════════════════════════════════════════════════════
  //
  // Additive, so the assertion is "present", the opposite of the PR 5 block
  // above. Three things are checked, because "the column exists" alone is a
  // weak claim:
  //
  //   1. both columns are on "Item" — and NOT on "ItemStock", because these
  //      two are global item configuration, not per-location state. A
  //      migration aimed at the wrong table would pass a presence-only check
  //      on the wrong half, exactly as PR 5's comment describes.
  //   2. both are nullable TEXT. A NOT NULL column would have failed the
  //      migration itself on this seeded fixture, but the type and the
  //      nullability are what the resolvers rely on, so name them.
  //   3. an INSERT that sets neither column reads back NULL, not ''. This is
  //      the one a `DEFAULT ''` on the column would fail. "No note" and "a
  //      note the user cleared" are different stored values, and local mode
  //      stores the first as an absent optional field.
  const itemColumnsAfterAdd = await columnNamesOf('Item')
  const itemStockColumnsAfterAdd = await columnNamesOf('ItemStock')

  for (const column of ['wikidataUrl', 'note'] as const) {
    assert(
      itemColumnsAfterAdd.has(column),
      `"Item"."${column}" is present — the Info tab field that had nowhere to go in cloud mode before issue #335`,
    )
    assert(
      !itemStockColumnsAfterAdd.has(column),
      `"${column}" is NOT on "ItemStock" — it is global item configuration, so a migration that added it to the per-location table would be wrong`,
    )
    const meta = await columnMetaOf('Item', column)
    assert(
      meta?.dataType === 'text' && meta?.isNullable === 'YES',
      `"Item"."${column}" is nullable text (read: ${meta ? `${meta.dataType}, nullable=${meta.isNullable}` : 'column missing'})`,
    )
  }

  // user-a still owns item-a1 (Milk); item-a2 was deleted by the cascade check
  // in assertLocationMigrationsBeforeDrop, so insert a fresh row rather than
  // reusing one. In user-a's household: "Item" has no "userId" since
  // drop_user_scope, and "householdId" is NOT NULL.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Item" ("id","name","targetUnit","consumeAmount","expirationMode","householdId","createdAt","updatedAt")
    VALUES ('item-note-none','Plain','package',1,'disabled',
            (SELECT "id" FROM "Household" WHERE "ownerId" = 'user-a'),NOW(),NOW())
  `)
  const plain = await prisma.item.findUnique({ where: { id: 'item-note-none' } })
  assert(
    plain?.note === null && plain?.wikidataUrl === null,
    'an Item inserted with neither column set reads back NULL for both — not the empty string, which would mean "the user cleared a note they had typed"',
  )

  // And a row that DOES set them keeps the exact strings, so the assertion
  // above cannot pass by the columns being unwritable.
  await prisma.item.update({
    where: { id: 'item-note-none' },
    data: { note: 'buy the 500g pack', wikidataUrl: 'https://www.wikidata.org/wiki/Q8495' },
  })
  const written = await prisma.item.findUnique({ where: { id: 'item-note-none' } })
  assert(
    written?.note === 'buy the 500g pack' &&
      written?.wikidataUrl === 'https://www.wikidata.org/wiki/Q8495',
    'both columns store and return the exact strings they were given',
  )

  // ══════════════════════════════════════════════════════════════════════
  // 20261031000000 — the "User" table (households H2)
  // ══════════════════════════════════════════════════════════════════════
  //
  // A new table with no backfill, so the checks are about its shape:
  //
  //   1. the table exists with all seven columns. "User" is a reserved word in
  //      Postgres, so an unquoted name in the migration would fail or create
  //      something else.
  //   2. "email", "lastSeenAt" and "deletedAt" are nullable. A Clerk account
  //      may have no email, and user.deleted carries none (decision P10 in
  //      docs/global/permissions/2026-10-31-households-plan.md).
  //   3. "id" and "displayName" are NOT nullable. This is the other half of 2:
  //      a migration that made every column nullable would pass 2 alone.
  //   4. a second insert with the same "id" fails with P2002. This proves only
  //      that the id is unique. It is NOT the first sign-in race guard: since
  //      H2 the row exists before first sign-in, so H3a uses householdSetupAt
  //      instead (decision H1).
  const userColumns = await columnNamesOf('User')
  const expectedUserColumns = [
    'id',
    'displayName',
    'email',
    'lastSeenAt',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ] as const
  const missingOnUser = expectedUserColumns.filter((c) => !userColumns.has(c))
  assert(
    userColumns.size > 0 && missingOnUser.length === 0,
    `the "User" table exists with all seven columns${missingOnUser.length ? ` (missing: ${missingOnUser.join(', ')})` : ''}`,
  )

  for (const column of ['email', 'lastSeenAt', 'deletedAt'] as const) {
    const meta = await columnMetaOf('User', column)
    assert(
      meta?.isNullable === 'YES',
      `"User"."${column}" is nullable (read: ${meta ? `nullable=${meta.isNullable}` : 'column missing'})`,
    )
  }
  for (const column of ['id', 'displayName'] as const) {
    const meta = await columnMetaOf('User', column)
    assert(
      meta?.isNullable === 'NO',
      `"User"."${column}" is NOT nullable (read: ${meta ? `nullable=${meta.isNullable}` : 'column missing'})`,
    )
  }

  // The first insert must succeed, or the P2002 check below could pass for
  // the wrong reason. It sets no email, which the column must accept.
  await prisma.user.create({ data: { id: 'user_clerk_1', displayName: 'Ada' } })
  const ada = await prisma.user.findUnique({ where: { id: 'user_clerk_1' } })
  assert(
    ada?.displayName === 'Ada' && ada?.email === null && ada?.deletedAt === null,
    'a User inserted without an email reads back with email NULL and deletedAt NULL',
  )

  let duplicateUserCode: string | undefined
  try {
    await prisma.user.create({ data: { id: 'user_clerk_1', displayName: 'Someone Else' } })
  } catch (err) {
    duplicateUserCode = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined
  }
  assert(
    duplicateUserCode === 'P2002',
    'a second User with the same Clerk id is rejected with P2002 (User_pkey) — this proves only that the id is unique; the first sign-in race guard is householdSetupAt (decision H1), checked in assertHouseholdsConstraints',
  )

  await assertHouseholdsConstraints()

  // Last: it writes its own households and locations.
  await assertHouseholdLock()

  console.log('\nMigration verified.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
