import { readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  type DocumentNode,
  type OperationDefinitionNode,
  Kind,
  NoDeprecatedCustomRule,
  Source,
  buildSchema,
  findBreakingChanges,
  findDangerousChanges,
  getVariableValues,
  parse,
  validate,
} from 'graphql'
import { describe, expect, it } from 'vitest'
import { typeDefs } from '../schema/index.js'

// ── OLD-BUNDLE SHIM: the server must still accept `main`'s web bundle ──
//
// The households release (H3a to H5a) reaches `main` in ONE release. The owner
// chose to deploy the SERVER FIRST (2026-11-17, option 4 in section 8.3 of
// docs/global/backend/2026-11-17-deploy-runbook-households-h4.md). Between the
// two deploys, and on every device that has not accepted the update prompt,
// `main`'s OLD web bundle talks to the NEW server. GraphQL validation fails a
// whole document when one field is unknown, so every field and input field
// that bundle sends must still exist here.
//
// The shim, all `@deprecated`, all to be deleted in the release after
// households:
//
// | Field                                       | File                 |
// |---------------------------------------------|----------------------|
// | `Location.isDefault`                        | `location.graphql`   |
// | `CheckoutItemInput.itemId` (and `cartItemId` made optional) | `cart.graphql` |
// | `ConsumeRecipesItemInput.packedQuantity`, `.unpackedQuantity`, `.quantity` | `recipe.graphql` |
//
// The old documents are COPIED into `fixtures/main-web-operations/`, and
// `main`'s server schema into `fixtures/main-server-schema.graphql`, so this
// test does not change when `main` changes. Each file's header says where it
// came from. When the shim goes, delete that folder, that file, this file and
// the five fields above together.
//
// What each check sees:
//
// | Check                              | Catches                                         |
// |------------------------------------|-------------------------------------------------|
// | document validation                | a field or argument the old documents name that is gone or changed |
// | the two variable tests             | a change to `CheckoutItemInput` or `ConsumeRecipesItemInput` that refuses the old VALUES |
// | `findBreakingChanges` against `main` | any other breaking change: a removed or renamed type or field, an input field made required or removed, an argument type changed. This covers the input types that only reach the server as variables (for example `ItemInput` and `TagInput` from `main`'s `importData.ts`), which validation does not look inside. |
// | `findDangerousChanges` against `main` | an added optional input field or argument, an enum value added, a default value changed |
//
// Document validation alone did NOT see an input type change: a variable's
// type is only checked by name, and the fields inside are checked only when
// values are given. A reviewer made `ItemInput.estimatedDueDays` `Int!` and
// deleted `TagInput.parentId` (both sent by `main`'s import) and the first
// version of this file stayed green.
//
// What this file does NOT prove: the VALUES the shim fields give. Those are
// tested with the resolvers (`location-roles.resolver.test.ts`,
// `cart-checkout.resolver.test.ts`, `recipe-consume.resolver.test.ts`).

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(here, 'fixtures', 'main-web-operations')
const WEB_OPERATIONS = join(here, '..', '..', '..', 'web', 'src', 'apollo', 'operations')

const schema = buildSchema(typeDefs.join('\n'))
const mainSchema = buildSchema(readFileSync(join(here, 'fixtures', 'main-server-schema.graphql'), 'utf-8'))

function readDocuments(dir: string): Array<{ file: string; doc: DocumentNode }> {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.graphql'))
    .sort()
    .map((file) => ({ file, doc: parse(new Source(readFileSync(join(dir, file), 'utf-8'), file)) }))
}

/** Every operation as its own document: that is what the browser sends. */
function operations(dir: string): Array<{ file: string; op: OperationDefinitionNode }> {
  return readDocuments(dir).flatMap(({ file, doc }) =>
    doc.definitions
      .filter((d): d is OperationDefinitionNode => d.kind === 'OperationDefinition')
      .map((op) => ({ file, op })),
  )
}

function oldOperation(name: string): OperationDefinitionNode {
  const found = operations(FIXTURES).find(({ op }) => op.name?.value === name)
  if (!found) throw new Error(`no operation ${name} in the fixtures`)
  return found.op
}

describe("main's old web bundle against the current schema", () => {
  it('the fixture folder holds the 11 operation files of main', () => {
    // A folder that lost its files would make the next test pass on nothing.
    expect(readDocuments(FIXTURES).map((d) => d.file)).toHaveLength(11)
    expect(operations(FIXTURES).length).toBeGreaterThan(80)
  })

  it('every operation of the old bundle passes GraphQL validation', () => {
    const errors = operations(FIXTURES).flatMap(({ file, op }) =>
      validate(schema, { kind: Kind.DOCUMENT, definitions: [op] }).map(
        (e) => `${file} ${op.name?.value ?? '(anonymous)'}: ${e.message}`,
      ),
    )
    expect(errors).toEqual([])
  })

  it("the old bundle's checkout variables are accepted: { itemId, quantity }", () => {
    // What `main`'s `useCheckout` sends: one entry per bought item, with the
    // client's stock total as `quantity`.
    const op = oldOperation('Checkout')
    const res = getVariableValues(schema, op.variableDefinitions ?? [], {
      cartId: 'loc_1:no-vendor',
      items: [{ itemId: 'item_milk', quantity: 3.5 }],
    })
    expect(res.errors).toBeUndefined()
  })

  it("the old bundle's cooking variables are accepted: the three final numbers beside delta", () => {
    // What `main`'s `useConsumeRecipes` sends for one item.
    const op = oldOperation('ConsumeRecipes')
    const res = getVariableValues(schema, op.variableDefinitions ?? [], {
      input: {
        occurredAt: '2026-11-17T12:00:00.000Z',
        locationId: 'loc_1',
        recipeIds: ['recipe_1'],
        items: [
          {
            itemId: 'item_milk',
            packedQuantity: 2,
            unpackedQuantity: 0,
            delta: -1,
            quantity: 2,
            note: 'consumed via Pasta',
            logKey: 'cooking.log.consumedVia',
            logParams: { recipes: 'Pasta' },
          },
        ],
      },
    })
    expect(res.errors).toBeUndefined()
  })
})

describe("the current schema against main's schema", () => {
  it('the breaking changes are exactly the ones the old bundle never sends', () => {
    // Each of these is gone ON PURPOSE, and `main`'s web bundle selects none
    // of them (the six `userId` fields left its documents in issue #359 step
    // one; `purgeUserData` was never called by the web). Any other breaking
    // change can fail a request from an old device: add a shim for it, or
    // add it here only after checking that no old document or variable uses
    // it.
    const breaking = findBreakingChanges(mainSchema, schema)
      .map((c) => `${c.type}: ${c.description}`)
      .sort()
    expect(breaking).toEqual(
      [
        'FIELD_REMOVED: Item.userId was removed.',
        'FIELD_REMOVED: Mutation.purgeUserData was removed.',
        'FIELD_REMOVED: Recipe.userId was removed.',
        'FIELD_REMOVED: Shelf.userId was removed.',
        'FIELD_REMOVED: Tag.userId was removed.',
        'FIELD_REMOVED: TagType.userId was removed.',
        'FIELD_REMOVED: Vendor.userId was removed.',
        'TYPE_REMOVED: PurgeResult was removed.',
      ].sort(),
    )
  })

  it('the only dangerous change is the new optional cartItemId on CheckoutItemInput', () => {
    // A "dangerous" change cannot fail an old request on its own, but it can
    // change what the request means. `cartItemId` is the new checkout shape,
    // and the old bundle never sends it (see `cart.graphql`).
    const dangerous = findDangerousChanges(mainSchema, schema).map((c) => `${c.type}: ${c.description}`)
    expect(dangerous).toEqual([
      'OPTIONAL_INPUT_FIELD_ADDED: An optional field cartItemId on input type CheckoutItemInput was added.',
    ])
  })
})

describe('the current web bundle', () => {
  it('selects no deprecated field, so the shim can be deleted without a web change', () => {
    const docs = readDocuments(WEB_OPERATIONS)
    // A wrong path would read nothing and pass.
    expect(docs.length).toBeGreaterThan(5)
    const errors = docs.flatMap(({ file, doc }) =>
      validate(schema, doc, [NoDeprecatedCustomRule]).map((e) => `${file}: ${e.message}`),
    )
    expect(errors).toEqual([])
  })
})
