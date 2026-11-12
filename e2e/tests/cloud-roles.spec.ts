import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { addHouseholdMember } from '../helpers/cloudUsers'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// That the household role and the location role are checked against real
// Postgres, with a second and a third person in one household (households
// H3a, task 3.11; plan rule 10). With one person, "check the role" and
// "ignore the role" give the same answer, so these are the first real-SQL role
// tests.
//
// | Person  | Household role | Home   | Office      | Garage |
// |---------|----------------|--------|-------------|--------|
// | owner   | owner          | organizer | organizer | organizer |
// | member  | member         | viewer | participant | none   |
// | manager | manager        | none   | none        | none   |
//
// - the catalog: a `member` cannot create a tag, a `manager` can
//   (`requireCatalogRole`, apps/server/src/lib/authz.ts);
// - a location: a `viewer` can read its stock but not change it, a
//   `participant` can change it (`requireLocationRole`);
// - a location with no role: `Forbidden` for both read and write.
//
// The second and third person are put into the household by the E2E-only
// route `POST /e2e/household-members` (`addHouseholdMember`), because invites
// are H5.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - **Nothing about carts.** Until H3b, `bootstrapCarts` gives a second member
//   an empty cart list where the first member already made carts (plan H3a,
//   "Owed to H3b"). This file creates no vendor and calls no cart operation.
// - **Not every resolver.** One read and one write per level. The unit tests
//   cover the role of each resolver against a fake.
// - **`organizer`-only writes** (rename or delete a location) are not here.
//
// ── WHY THERE IS NO BROWSER ──────────────────────────────────────────────────
//
// The browser can only ever be `E2E_USER_ID`, and this file needs three
// people. Everything goes through GraphQL with `makeGql`, like
// `purge-two-households.spec.ts`. It is in the `cloud` project's `testMatch`
// and the `local` project's `testIgnore` (e2e/playwright.config.ts).

const OWNER = `${E2E_SECOND_USER_ID}-roles-owner`
const MEMBER = `${E2E_SECOND_USER_ID}-roles-member`
const MANAGER = `${E2E_SECOND_USER_ID}-roles-manager`

type Row = { id: string }
type Stock = { itemId: string; packedQuantity: number }
type Gql = ReturnType<typeof makeGql>

const LOCATIONS = `query { locations { id name } }`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id } }`
const TAG_TYPES = `query { tagTypes { id name } }`
const TAGS = `query { tags { id name } }`
const CREATE_TAG_TYPE = `mutation ($name: String!, $color: String!) {
  createTagType(name: $name, color: $color) { id }
}`
const CREATE_TAG = `mutation ($name: String!, $typeId: String!) {
  createTag(name: $name, typeId: $typeId) { id name }
}`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const ITEM_STOCKS = `query ($locationId: ID!) {
  itemStocks(locationId: $locationId) { itemId packedQuantity }
}`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id packedQuantity }
}`

/** `makeGql` throws the GraphQL errors as JSON text. This matches a refusal. */
const FORBIDDEN = /"code":"FORBIDDEN"/

type Seed = {
  itemId: string
  typeId: string
  home: string
  office: string
  garage: string
}

/**
 * The owner's household: three locations, one tag type, one item stocked 3 at
 * each location. Then the member and the manager are added, as in the table
 * at the top. The two are added BEFORE they send any request, as
 * `addHouseholdMember` requires.
 */
async function seedHousehold(
  request: Parameters<typeof makeGql>[0],
  gqlOwner: Gql,
): Promise<Seed> {
  // The first request makes the household and "Home" (first sign-in)
  const { locations } = await gqlOwner<{ locations: Row[] }>(LOCATIONS)
  const home = locations[0]?.id
  if (!home) throw new Error('owner: no location after first sign-in')
  const office = (
    await gqlOwner<{ createLocation: Row }>(CREATE_LOCATION, { name: 'Office' })
  ).createLocation.id
  const garage = (
    await gqlOwner<{ createLocation: Row }>(CREATE_LOCATION, { name: 'Garage' })
  ).createLocation.id

  const typeId = (
    await gqlOwner<{ createTagType: Row }>(CREATE_TAG_TYPE, {
      name: 'Category',
      color: 'orange',
    })
  ).createTagType.id
  const itemId = (
    await gqlOwner<{ createItem: Row }>(CREATE_ITEM, {
      input: { name: 'Milk' },
    })
  ).createItem.id
  for (const locationId of [home, office, garage]) {
    await gqlOwner(UPSERT_STOCK, {
      itemId,
      locationId,
      input: { packedQuantity: 3, unpackedQuantity: 0 },
    })
  }

  await addHouseholdMember(request, {
    ownerUserId: OWNER,
    memberUserId: MEMBER,
    householdRole: 'member',
    locations: [
      { locationId: home, role: 'viewer' },
      { locationId: office, role: 'participant' },
    ],
  })
  await addHouseholdMember(request, {
    ownerUserId: OWNER,
    memberUserId: MANAGER,
    householdRole: 'manager',
    locations: [],
  })
  return { itemId, typeId, home, office, garage }
}

/** The packed quantity of the item at a location, read as the owner. */
async function packedAt(gqlOwner: Gql, locationId: string, itemId: string) {
  const { itemStocks } = await gqlOwner<{ itemStocks: Stock[] }>(ITEM_STOCKS, {
    locationId,
  })
  return itemStocks.find((s) => s.itemId === itemId)?.packedQuantity
}

async function cleanupAll(request: Parameters<typeof makeGql>[0]) {
  // The two members first, then the owner, whose cleanup deletes the
  // household. Any order works; this one leaves no member row behind even
  // when a run crashed half way.
  await cleanupCloudData(request, MEMBER)
  await cleanupCloudData(request, MANAGER)
  await cleanupCloudData(request, OWNER)
}

test.beforeEach(async ({ request }) => {
  // Guards against a previous run that crashed before its teardown
  await cleanupAll(request)
})

test.afterEach(async ({ request }) => {
  await cleanupAll(request)
})

test.describe('roles in a shared household', () => {
  test('household member cannot create a tag, and a household manager can', async ({
    request,
  }) => {
    const gqlOwner = makeGql(request, OWNER)
    const gqlMember = makeGql(request, MEMBER)
    const gqlManager = makeGql(request, MANAGER)

    // Given a household with a member and a manager
    const seed = await seedHousehold(request, gqlOwner)

    // And the member really is in that household: they can read its tag type.
    // Without this, a member in no household (or the wrong one) would also be
    // refused below, and the refusal would prove nothing about the role.
    const { tagTypes } = await gqlMember<{ tagTypes: Row[] }>(TAG_TYPES)
    expect(tagTypes.map((t) => t.id)).toEqual([seed.typeId])

    // When the member creates a tag
    // Then it is refused
    await expect(
      gqlMember(CREATE_TAG, { name: 'Dairy', typeId: seed.typeId }),
    ).rejects.toThrow(FORBIDDEN)
    // And nothing was written
    expect((await gqlOwner<{ tags: Row[] }>(TAGS)).tags).toEqual([])

    // When the manager creates the same tag
    const { createTag } = await gqlManager<{
      createTag: { id: string; name: string }
    }>(CREATE_TAG, { name: 'Dairy', typeId: seed.typeId })

    // Then it is written in the household, and the owner sees it
    const { tags } = await gqlOwner<{ tags: { id: string; name: string }[] }>(
      TAGS,
    )
    expect(tags).toEqual([{ id: createTag.id, name: 'Dairy' }])
  })

  test('location viewer can read stock but cannot change it, and a location participant can', async ({
    request,
  }) => {
    const gqlOwner = makeGql(request, OWNER)
    const gqlMember = makeGql(request, MEMBER)

    // Given the member is a viewer at Home and a participant at the Office,
    // and the item is stocked 3 at both
    const seed = await seedHousehold(request, gqlOwner)

    // When the member reads Home's stock
    const { itemStocks } = await gqlMember<{ itemStocks: Stock[] }>(
      ITEM_STOCKS,
      { locationId: seed.home },
    )
    // Then they see it
    expect(itemStocks).toEqual([{ itemId: seed.itemId, packedQuantity: 3 }])

    // When the member changes Home's stock
    // Then it is refused, and the stock is still 3
    await expect(
      gqlMember(UPSERT_STOCK, {
        itemId: seed.itemId,
        locationId: seed.home,
        input: { packedQuantity: 9 },
      }),
    ).rejects.toThrow(FORBIDDEN)
    expect(await packedAt(gqlOwner, seed.home, seed.itemId)).toBe(3)

    // When the member changes the Office's stock
    await gqlMember(UPSERT_STOCK, {
      itemId: seed.itemId,
      locationId: seed.office,
      input: { packedQuantity: 7 },
    })
    // Then it is written, and the owner reads the new value
    expect(await packedAt(gqlOwner, seed.office, seed.itemId)).toBe(7)
  })

  test('household member with no role on a location is refused both read and write there', async ({
    request,
  }) => {
    const gqlOwner = makeGql(request, OWNER)
    const gqlMember = makeGql(request, MEMBER)

    // Given the member has no role at the Garage, and the item is stocked 3
    // there (the owner can read it, so the location and the row exist)
    const seed = await seedHousehold(request, gqlOwner)
    expect(await packedAt(gqlOwner, seed.garage, seed.itemId)).toBe(3)

    // Then the member's location list holds Home and the Office only
    const { locations } = await gqlMember<{ locations: Row[] }>(LOCATIONS)
    expect(locations.map((l) => l.id).sort()).toEqual(
      [seed.home, seed.office].sort(),
    )

    // And reading the Garage's stock is refused
    await expect(
      gqlMember(ITEM_STOCKS, { locationId: seed.garage }),
    ).rejects.toThrow(FORBIDDEN)

    // And writing it is refused, and the stock is still 3
    await expect(
      gqlMember(UPSERT_STOCK, {
        itemId: seed.itemId,
        locationId: seed.garage,
        input: { packedQuantity: 9 },
      }),
    ).rejects.toThrow(FORBIDDEN)
    expect(await packedAt(gqlOwner, seed.garage, seed.itemId)).toBe(3)
  })
})
