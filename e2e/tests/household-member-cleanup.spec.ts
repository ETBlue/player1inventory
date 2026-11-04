import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { addHouseholdMember, readCloudUser } from '../helpers/cloudUsers'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// What `/e2e/cleanup` (apps/server/src/lib/e2eCleanup.ts) does when two people
// share one household, against real Postgres (households H3a, task 3.11; owed
// by the review of task 3.10). Until now only a unit test pinned it.
//
// The rule, both halves:
//
// - **A member's cleanup never deletes a household the member only belongs
//   to.** Only the member's own role rows and `User` row go. Every two-user
//   spec runs cleanup once per person, so if the member's call emptied the
//   household, the owner's data would be gone before the owner's own test
//   step read it.
// - **The owner's cleanup deletes the whole household, every member's role
//   rows included.** So after it, the member is in no household at all.
//
// Both orders are run: member first, then owner first.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - **Nothing about carts.** Until H3b, `bootstrapCarts` gives a second member
//   an empty cart list (plan H3a, "Owed to H3b"). No cart is made here.
// - **Nothing about `clearAllData`** with two members. That leaves the member
//   with no location role (owner question Q1 in the plan), and
//   `purge-two-households.spec.ts` covers its filters.
//
// No browser, for the same reason as `cloud-roles.spec.ts`. In the `cloud`
// project's `testMatch` and the `local` project's `testIgnore`.

const OWNER = `${E2E_SECOND_USER_ID}-cleanup-owner`
const MEMBER = `${E2E_SECOND_USER_ID}-cleanup-member`

type Row = { id: string }
type Gql = ReturnType<typeof makeGql>

const LOCATIONS = `query { locations { id } }`
const TAG_TYPES = `query { tagTypes { id } }`
const CREATE_TAG_TYPE = `mutation ($name: String!, $color: String!) {
  createTagType(name: $name, color: $color) { id }
}`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`
const ADD_LOG = `mutation ($itemId: ID!, $delta: Float!, $quantity: Float!, $occurredAt: String!, $locationId: ID!) {
  addInventoryLog(itemId: $itemId, delta: $delta, quantity: $quantity, occurredAt: $occurredAt, locationId: $locationId) { id }
}`
// Everything the owner can see, sorted by id below so two reads compare equal
const SNAPSHOT = `query ($locationId: ID!) {
  locations { id name }
  tagTypes { id name }
  items { id name }
  inventoryLogs { id delta }
  itemStocks(locationId: $locationId) { id itemId packedQuantity }
}`

type Snapshot = {
  locations: { id: string; name: string }[]
  tagTypes: { id: string; name: string }[]
  items: { id: string; name: string }[]
  inventoryLogs: { id: string; delta: number }[]
  itemStocks: { id: string; itemId: string; packedQuantity: number }[]
}

/**
 * The owner's household with one tag type, one item stocked 3 at Home, and
 * the member added as a household `member` and Home `participant`. Then the
 * member writes: the stock goes to 5, and one log is added. So the household
 * holds rows the MEMBER wrote, which a cleanup by "who wrote it" would take.
 */
async function seedShared(
  request: Parameters<typeof makeGql>[0],
  gqlOwner: Gql,
  gqlMember: Gql,
): Promise<{ home: string }> {
  const { locations } = await gqlOwner<{ locations: Row[] }>(LOCATIONS)
  const home = locations[0]?.id
  if (!home) throw new Error('owner: no location after first sign-in')
  await gqlOwner(CREATE_TAG_TYPE, { name: 'Category', color: 'orange' })
  const itemId = (
    await gqlOwner<{ createItem: Row }>(CREATE_ITEM, {
      input: { name: 'Milk' },
    })
  ).createItem.id
  await gqlOwner(UPSERT_STOCK, {
    itemId,
    locationId: home,
    input: { packedQuantity: 3, unpackedQuantity: 0 },
  })

  await addHouseholdMember(request, {
    ownerUserId: OWNER,
    memberUserId: MEMBER,
    householdRole: 'member',
    locations: [{ locationId: home, role: 'participant' }],
  })

  await gqlMember(UPSERT_STOCK, {
    itemId,
    locationId: home,
    input: { packedQuantity: 5 },
  })
  await gqlMember(ADD_LOG, {
    itemId,
    delta: 2,
    quantity: 5,
    occurredAt: new Date().toISOString(),
    locationId: home,
  })
  return { home }
}

async function snapshot(gql: Gql, home: string): Promise<Snapshot> {
  const data = await gql<Snapshot>(SNAPSHOT, { locationId: home })
  const byId = <T extends { id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id))
  return {
    locations: byId(data.locations),
    tagTypes: byId(data.tagTypes),
    items: byId(data.items),
    inventoryLogs: byId(data.inventoryLogs),
    itemStocks: byId(data.itemStocks),
  }
}

test.beforeEach(async ({ request }) => {
  // Guards against a previous run that crashed before its teardown
  await cleanupCloudData(request, MEMBER)
  await cleanupCloudData(request, OWNER)
})

test.afterEach(async ({ request }) => {
  await cleanupCloudData(request, MEMBER)
  await cleanupCloudData(request, OWNER)
})

test.describe('/e2e/cleanup with two people in one household', () => {
  test("member cleanup first: the owner's household and every row in it survive", async ({
    request,
  }) => {
    const gqlOwner = makeGql(request, OWNER)
    const gqlMember = makeGql(request, MEMBER)

    // Given a shared household with rows the owner and the member wrote
    const { home } = await seedShared(request, gqlOwner, gqlMember)
    const before = await snapshot(gqlOwner, home)
    // The data is really there, so "it survives" below means something
    expect(before.items).toHaveLength(1)
    expect(before.tagTypes).toHaveLength(1)
    expect(before.inventoryLogs).toHaveLength(1)
    expect(before.itemStocks).toEqual([
      expect.objectContaining({ packedQuantity: 5 }),
    ])

    // When the member's cleanup runs
    const memberCleanup = await cleanupCloudData(request, MEMBER)

    // Then only the member's own rows went: one member row, one location
    // role, the User row. No household data, not even the log they wrote.
    expect(memberCleanup.deleted).toMatchObject({
      households: 0,
      locations: 0,
      items: 0,
      tagTypes: 0,
      itemStocks: 0,
      inventoryLogs: 0,
      householdMembers: 1,
      locationMembers: 1,
      users: 1,
    })
    // And the owner still sees every row, unchanged
    expect(await snapshot(gqlOwner, home)).toEqual(before)

    // And the owner's cleanup then deletes the household, with only the
    // owner's own member row left in it
    const ownerCleanup = await cleanupCloudData(request, OWNER)
    expect(ownerCleanup.deleted).toMatchObject({
      households: 1,
      householdMembers: 1,
      locationMembers: 1,
      inventoryLogs: 1,
      users: 1,
    })
  })

  test("owner cleanup first: the member's role rows go with the household", async ({
    request,
  }) => {
    const gqlOwner = makeGql(request, OWNER)
    const gqlMember = makeGql(request, MEMBER)

    // Given a shared household with rows the owner and the member wrote
    await seedShared(request, gqlOwner, gqlMember)

    // When the owner's cleanup runs
    const ownerCleanup = await cleanupCloudData(request, OWNER)

    // Then the household goes, with BOTH member rows and BOTH location roles,
    // and the log the member wrote
    expect(ownerCleanup.deleted).toMatchObject({
      households: 1,
      locations: 1,
      householdMembers: 2,
      locationMembers: 2,
      inventoryLogs: 1,
      users: 1,
    })

    // And the member is now in no household. Their first sign-in claim is
    // set (POST /e2e/household-members sets it), so a request does not make
    // them a new household: it is refused.
    await expect(gqlMember(TAG_TYPES)).rejects.toThrow(/"code":"NO_HOUSEHOLD"/)

    // And the member's User row is still there: the owner's cleanup deletes
    // only the owner's own User row
    expect(await readCloudUser(request, MEMBER)).not.toBeNull()

    // And the member's own cleanup then finds no role row left, only the
    // User row
    const memberCleanup = await cleanupCloudData(request, MEMBER)
    expect(memberCleanup.deleted).toMatchObject({
      householdMembers: 0,
      locationMembers: 0,
      users: 1,
    })
  })
})
