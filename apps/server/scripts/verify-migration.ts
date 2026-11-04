// Verifies the migrations listed in MIGRATIONS below against a REAL Postgres, because the
// resolver test suite runs entirely against a hand-written Prisma fake and
// cannot exercise SQL at all.
//
// Seven migrations are under test, applied in order:
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
// This count and the MIGRATIONS array below must agree. The comment said "Four"
// for a while after entry 5 was added, so check the array rather than trusting
// this line.
// Migration 7 reads the "User" table that 6 creates. So it is applied in a
// second `migrate deploy`, after a second seed step writes two "User" rows.
// See seedUsersBeforeHouseholds below for why.
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
//                 tag-a1 (user-a) -> tt-c (user-c)
//   Tag.parentId  tag-c1 (user-c) -> tag-g (user-g)      tag-c2 -> tag-c1 (both user-c)
//   ItemTag       item-a1 (user-a) + tag-g (user-g)      item-a1 + tag-a1 (both user-a)
//   ItemVendor    item-b1 (user-b) + vendor-d (user-d)   item-a1 + vendor-a (both user-a)
//   RecipeItem    recipe-e (user-e) + item-b1 (user-b)   recipe-a + item-a1 (both user-a)
//
// Tag.typeId counts 2 and every other kind 1, so a query that put one kind's
// count under another kind's label fails too.
//
// Only existing users, on purpose. A new user would add a "User" row, a
// household and a 'Home' location, and the backfill checks count those. And
// item-a2 gets no reference: the PR 1 block deletes it to test ONE cascade.
// No check deletes the households of user-a, -b, -c, -d, -e or -g, so these
// rows block nothing (a crossing Tag.typeId blocks deleting tt-c's household).
const EXPECTED_CROSS_HOUSEHOLD_COUNTS: Record<string, number> = {
  'Tag.typeId': 2,
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
// Read-only. main() calls this right after the last deploy, before any other
// block writes a row. Fourteen users exist at this point: the thirteen
// seedFixture users, all with data, and user-empty, with a "User" row and no
// data. Of the thirteen, only user-a had a "User" row before the migration.
async function assertHouseholdsBackfill(): Promise<void> {
  console.log('add_households — the backfill:')
  const allUserIds = [...EXPECTED_USER_IDS, NO_DATA_USER_ID]

  // ── Step 2: a "User" row for every userId in the data ──
  const users = await prisma.user.findMany()
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
  const homes = await prisma.location.findMany({ where: { userId: NO_DATA_USER_ID } })
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
  const locations = await prisma.location.findMany({ include: { members: true } })
  const badLocations = locations.filter(
    (l) =>
      l.members.length !== 1 ||
      l.members[0]?.userId !== l.userId ||
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
// These write rows, so main() calls this at the end. Each check uses users
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
  // statement. Nothing deletes a household until H3a task 3.10 (/e2e/cleanup)
  // and H6, so this is the first place it runs.
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
  const scope = { userId: cascadeUser, householdId: doomed.id }
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
    data: { id: `${location.id}:no-vendor`, userId: cascadeUser, locationId: location.id },
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

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url))

// In apply order. Adding a later migration under test means adding it here.
const MIGRATIONS = [
  '20260830000000_add_location_and_item_stock',
  '20260916000000_add_location_to_log_and_cart',
  '20260917000000_rekey_cart_to_location_vendor',
  '20261004000000_drop_item_stock_state_columns',
  '20261008000000_add_item_note_and_wikidata_url',
  '20261031000000_add_user',
  '20261104000000_add_households',
] as const

// Applied on its own, in a second `migrate deploy`, after
// seedUsersBeforeHouseholds. It must be the LAST entry above: every entry
// before it is applied in the first deploy.
const HOUSEHOLDS_MIGRATION = '20261104000000_add_households'

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

    // Apply migrations 1-6 first, then seed the "User" rows that only exist
    // once add_user has run. See seedUsersBeforeHouseholds for why.
    console.log(`Applying every migration under test except ${HOUSEHOLDS_MIGRATION}...`)
    for (const name of MIGRATIONS) {
      if (name !== HOUSEHOLDS_MIGRATION) renameSync(parkedDir(name), migrationDir(name))
    }
    execSync('pnpm exec prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'inherit' })
    await seedUsersBeforeHouseholds()
    await seedCrossHouseholdReferences()
  } finally {
    restoreIfParked()
    parked = false
  }

  console.log(`Applying ${HOUSEHOLDS_MIGRATION}...`)
  execSync('pnpm exec prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'inherit' })

  console.log('Asserting...')

  // Runs FIRST, before the older blocks below, because those blocks write rows
  // the backfill never saw: a 'Garage' location and an "Item" with no
  // householdId, and they delete three locations. Read now, the database is
  // exactly what add_households left.
  await assertHouseholdsBackfill()

  // add_households (H3a) adds exactly ONE location: user-empty's 'Home', for
  // the "User" row with no data. That row is not PR 1's work, so it is set
  // aside here, and the block below checks PR 1's backfill as before. The
  // count check first makes sure it is the only row set aside: a stray extra
  // location for any of the thirteen would still fail the assertions below.
  // assertHouseholdsBackfill checks the 'Home' row itself.
  const allLocations = await prisma.location.findMany({ orderBy: { userId: 'asc' } })
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

  // There used to be an assertion here that "Item"."targetQuantity" still read
  // 3 — "dropped in PR 5, not here". PR 5 is now in this script's MIGRATIONS
  // list, so the column is gone by the time the assertions run and that
  // SELECT would throw 42703. It is replaced, inverted, by the PR 5 block at
  // the end of this function. The `milk` assertion above is what proves the
  // five values survived the drop: they are read off "ItemStock", their new
  // home, after PR 5 has removed "Item"'s copy.

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
  // Row deletions earlier in this function cannot affect either answer — these
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
  // above, so insert a fresh row rather than reusing one.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Item" ("id","name","targetUnit","consumeAmount","expirationMode","userId","createdAt","updatedAt")
    VALUES ('item-note-none','Plain','package',1,'disabled','user-a',NOW(),NOW())
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

  console.log('\nMigration verified.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
