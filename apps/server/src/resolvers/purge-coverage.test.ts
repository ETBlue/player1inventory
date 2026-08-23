/**
 * Schema-coverage guard for the two purge paths (issue #250).
 *
 * WHY THIS FILE EXISTS
 *
 * `purgeUserData` (purge.resolver.ts) and `clearAllData` (import.resolver.ts) each
 * hand-maintain a list of `prisma.<model>.deleteMany(...)` calls. Nothing links that
 * list to `prisma/schema.prisma`, so adding a user-owned model is a two-place edit
 * that no compiler checks — and their unit tests hand-maintain a *third* duplicate,
 * the mocked Prisma client. When `Shelf` was added, the resolvers were updated but
 * the mocks were not: `prisma.shelf` was `undefined` and all three purge tests blew
 * up with "Cannot read properties of undefined (reading 'deleteMany')". Worse, had
 * the mock happened to be permissive, the resolvers could have silently *skipped* a
 * table and left user rows behind after a purge.
 *
 * This guard reads the Prisma schema from disk and asserts the invariant directly
 * against the resolver *source*, so it cannot be satisfied by a mock:
 *
 *   Every model in prisma/schema.prisma that owns a `userId` field must be deleted
 *   by BOTH purge paths.
 *
 * Junction models (ItemTag, ItemVendor, RecipeItem) have no `userId` — they are
 * deleted through a parent relation filter and are deliberately out of scope here.
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
    ])
    expect(userOwnedModels.length).toBe(9)
  })

  it('knows about both purge paths', () => {
    expect(PURGE_PATHS).toHaveLength(2)
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
})
