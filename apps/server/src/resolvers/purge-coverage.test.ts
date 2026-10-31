/**
 * Schema-coverage guard for the three purge paths (issue #250).
 *
 * WHY THIS FILE EXISTS
 *
 * `purgeUserData` (purge.resolver.ts), `clearAllData` (import.resolver.ts) and the
 * E2E-only `DELETE /e2e/cleanup` endpoint (lib/e2eCleanup.ts) each hand-maintain a list of
 * `prisma.<model>.deleteMany(...)` calls. Nothing links those
 * lists to `prisma/schema.prisma`, so adding a user-owned model is a three-place
 * edit that no compiler checks — and the two resolvers' unit tests hand-maintain
 * yet another duplicate, the mocked Prisma client. When `Shelf` was added, the resolvers were updated but
 * the mocks were not: `prisma.shelf` was `undefined` and all three purge tests blew
 * up with "Cannot read properties of undefined (reading 'deleteMany')". Worse, had
 * the mock happened to be permissive, the resolvers could have silently *skipped* a
 * table and left user rows behind after a purge.
 *
 * This guard reads the Prisma schema from disk and asserts the invariant directly
 * against the resolver *source*, so it cannot be satisfied by a mock:
 *
 *   Every model in prisma/schema.prisma that owns a `userId` field must be deleted
 *   by ALL THREE purge paths.
 *
 * ItemTag, ItemVendor and RecipeItem are junction models with no `userId` of their
 * own. ItemStock also has no `userId` — despite carrying real per-location state
 * (targetQuantity, refillThreshold, packedQuantity, unpackedQuantity, dueDate), it
 * is scoped through its parent Location, not a row a user owns directly. All four
 * are deleted through a parent relation filter and are deliberately out of scope
 * here.
 *
 * `User` (households H2) is out of scope too, for a different reason: it has
 * no `userId` field. Its key is `id`, because the row IS the user. Only
 * `/e2e/cleanup` deletes it, with `where: { id: userId }`, and
 * `lib/e2eCleanup.test.ts` pins that line. `purgeUserData` and `clearAllData`
 * delete a user's DATA and leave the account, so they must not delete it.
 * The last three tests in this file check both halves of that.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))

function read(relativePath: string): string {
  return readFileSync(resolve(HERE, relativePath), 'utf8')
}

/**
 * Extracts the names of every `model X { ... }` block whose body declares a
 * `userId` scalar field.
 */
function parseUserOwnedModels(schema: string): string[] {
  const models: string[] = []
  const blockPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm
  for (const match of schema.matchAll(blockPattern)) {
    const [, name, body] = match
    if (/^\s*userId\s+\S/m.test(body)) models.push(name)
  }
  return models
}

/** Prisma client property name for a model: `InventoryLog` → `inventoryLog`. */
function clientProperty(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

const schemaSource = read('../../prisma/schema.prisma')
const userOwnedModels = parseUserOwnedModels(schemaSource)

const PURGE_PATHS = [
  { label: 'purgeUserData', source: read('./purge.resolver.ts') },
  { label: 'clearAllData', source: read('./import.resolver.ts') },
  // The E2E-only DELETE /e2e/cleanup endpoint is a THIRD hand-maintained copy of
  // the same delete list. It is not a resolver, so no resolver test reads it.
  // This guard is what keeps the three lists from drifting apart. Its handler
  // moved from index.ts to lib/e2eCleanup.ts in households task 2.6.
  { label: 'e2eCleanup', source: read('../lib/e2eCleanup.ts') },
]

describe('purge coverage against prisma/schema.prisma', () => {
  it('parses the user-owned models out of the schema', () => {
    // Given the Prisma schema on disk
    // Then the parser finds every model carrying a userId — a broken parser or a
    // moved schema file must fail HERE rather than making the loops below vacuous
    expect(userOwnedModels).toEqual([
      'TagType',
      'Tag',
      'Vendor',
      'Item',
      'Recipe',
      'Cart',
      'CartItem',
      'InventoryLog',
      'Shelf',
      'Location',
    ])
    expect(userOwnedModels.length).toBe(10)
  })

  it('knows about all three purge paths', () => {
    expect(PURGE_PATHS).toHaveLength(3)
    for (const path of PURGE_PATHS) expect(path.source.length).toBeGreaterThan(0)
  })

  for (const { label, source } of PURGE_PATHS) {
    it(`${label} deletes every user-owned model`, () => {
      // Given the models that own a userId in prisma/schema.prisma
      expect(userOwnedModels.length).toBeGreaterThan(0)

      // When checking which of them the resolver deletes
      const missing = userOwnedModels.filter(
        (model) => !source.includes(`prisma.${clientProperty(model)}.deleteMany(`),
      )

      // Then none are missing — a new user-owned model must be added to this
      // purge path (and to its test's Prisma mock)
      expect(missing).toEqual([])
    })
  }

  // `purgeUserData` and `clearAllData` delete a user's DATA. The account
  // stays, so its `User` row must stay too. Only `/e2e/cleanup` deletes it.
  //
  // The pattern matches `.user.delete(` and `.user.deleteMany(` on any
  // client name, so `prisma.user.…` and a transaction's `tx.user.…` both
  // count. It does not match a client held under another name for the
  // model, such as `const users = prisma.user` and then `users.delete(`.
  const DELETES_USER_ROW = /\.user\.delete(Many)?\(/
  for (const { label, source } of PURGE_PATHS.filter((p) => p.label !== 'e2eCleanup')) {
    it(`${label} does not delete the User row`, () => {
      expect(source).not.toMatch(DELETES_USER_ROW)
    })
  }

  it('e2eCleanup does delete the User row', () => {
    // The positive control for the two tests above: the pattern they look
    // for matches the call the cleanup really uses. If it did not, the two
    // `not.toMatch` checks would pass for any source.
    const cleanup = PURGE_PATHS.find((p) => p.label === 'e2eCleanup')
    expect(cleanup?.source).toMatch(DELETES_USER_ROW)
    expect(cleanup?.source).toContain('prisma.user.deleteMany(')
  })
})
