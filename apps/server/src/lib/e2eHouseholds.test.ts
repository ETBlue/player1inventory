import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdWorld } from '../test/householdWorld.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import type { UserRow } from '../test/userFake.js'

// `POST /e2e/household-members` (households H3a, task 3.11, decision H9).
//
// It runs on `householdWorld` (src/test/householdWorld.ts): `User`,
// `Household`, `HouseholdMember`, `LocationMember` and `Location` are real
// stores with one `$transaction` that rolls back. So a refusal can be checked
// by reading the stores: nothing written. The real-SQL check is
// e2e/tests/cloud-roles.spec.ts, which uses this route.

vi.mock('./prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, $world: world } }
})

import { prisma } from './prisma.js'
import { e2eAddHouseholdMemberHandler, parseHouseholdMemberBody } from './e2eHouseholds.js'
import { ensureHousehold } from './household.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const T = new Date('2026-11-01T00:00:00.000Z')

function userRow(id: string, extra: Partial<UserRow> = {}): UserRow {
  return {
    id,
    displayName: `${id} name`,
    email: null,
    lastSeenAt: null,
    deletedAt: null,
    householdSetupAt: null,
    createdAt: T,
    updatedAt: T,
    ...extra,
  }
}

// ── The fixture ──
//
// | Person   | Household | Household role | Location roles           |
// |----------|-----------|----------------|--------------------------|
// | owner    | hh-1      | owner          | loc-home: organizer      |
// | stranger | hh-2      | owner          | loc-theirs: organizer    |
//
// hh-1 has two locations, so a test can give the member a role on one and not
// the other. hh-2 has a location of its own, so "a location of another
// household" is a real row, not only a made-up id.
function seed() {
  world.reset()
  world.users.reset([
    userRow('owner', { householdSetupAt: T }),
    userRow('stranger', { householdSetupAt: T }),
  ])
  world.stock.reset([
    { id: 'loc-home', householdId: 'hh-1', name: 'Home', order: 0 },
    { id: 'loc-office', householdId: 'hh-1', name: 'Office', order: 1 },
    { id: 'loc-theirs', householdId: 'hh-2', name: 'Theirs', order: 0 },
  ])
  world.seedHouseholds({
    households: [householdRow('hh-1', 'owner'), householdRow('hh-2', 'stranger')],
    householdMembers: [
      householdMemberRow('hh-1', 'owner', 'owner'),
      householdMemberRow('hh-2', 'stranger', 'owner'),
    ],
    locationMembers: [
      locationMemberRow('loc-home', 'owner', 'organizer'),
      locationMemberRow('loc-theirs', 'stranger', 'organizer'),
    ],
  })
}

/** The rows the route may write, for "nothing was written" checks. */
function snapshot() {
  return structuredClone({
    users: world.users.state.rows,
    households: world.households.state.households,
    householdMembers: world.households.state.householdMembers,
    locationMembers: world.households.state.locationMembers,
  })
}

const VALID = {
  ownerUserId: 'owner',
  memberUserId: 'member',
  householdRole: 'member',
  locations: [
    { locationId: 'loc-home', role: 'viewer' },
    { locationId: 'loc-office', role: 'participant' },
  ],
}

describe('parseHouseholdMemberBody', () => {
  it('accepts a full body', () => {
    expect(parseHouseholdMemberBody(VALID)).toEqual({ ok: true, value: VALID })
  })

  it('accepts an empty location list', () => {
    const body = { ...VALID, householdRole: 'manager', locations: [] }
    expect(parseHouseholdMemberBody(body)).toEqual({ ok: true, value: body })
  })

  it.each([
    ['no body', undefined],
    ['null', null],
    ['an array', [VALID]],
    ['no owner', { ...VALID, ownerUserId: undefined }],
    ['an empty owner', { ...VALID, ownerUserId: '' }],
    ['no member', { ...VALID, memberUserId: undefined }],
    ['a number member', { ...VALID, memberUserId: 7 }],
    ['the owner as the member', { ...VALID, memberUserId: 'owner' }],
    ['the household role owner', { ...VALID, householdRole: 'owner' }],
    ['an unknown household role', { ...VALID, householdRole: 'admin' }],
    ['no household role', { ...VALID, householdRole: undefined }],
    ['no location list', { ...VALID, locations: undefined }],
    ['a location with no id', { ...VALID, locations: [{ role: 'viewer' }] }],
    ['an unknown location role', { ...VALID, locations: [{ locationId: 'loc-home', role: 'guest' }] }],
    [
      'a household role used as a location role',
      { ...VALID, locations: [{ locationId: 'loc-home', role: 'manager' }] },
    ],
    [
      'one location listed twice',
      {
        ...VALID,
        locations: [
          { locationId: 'loc-home', role: 'viewer' },
          { locationId: 'loc-home', role: 'participant' },
        ],
      },
    ],
  ])('refuses %s', (_label, body) => {
    expect(parseHouseholdMemberBody(body).ok).toBe(false)
  })

  it('names the one-owner rule when the role is owner', () => {
    const result = parseHouseholdMemberBody({ ...VALID, householdRole: 'owner' })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('one owner') })
  })
})

describe('POST /e2e/household-members', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    // The same two lines index.ts uses: the app-wide JSON parser, then the route
    const app = express()
    app.use(express.json())
    app.post('/e2e/household-members', e2eAddHouseholdMemberHandler)
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s))
    })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  beforeEach(() => {
    seed()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function post(body: unknown) {
    const res = await fetch(`${base}/e2e/household-members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }

  it("adds the member to the owner's household, with the location roles asked for", async () => {
    // Given the member has no User row yet
    // When the member is added as a household member, viewer at Home and
    // participant at the Office
    const res = await post(VALID)

    // Then the answer names the owner's household
    expect(res).toEqual({ status: 200, body: { ok: true, householdId: 'hh-1' } })
    // And the member holds exactly the roles asked for, and nothing at hh-2
    expect(world.households.state.householdMembers.filter((m) => m.userId === 'member')).toEqual([
      expect.objectContaining({ householdId: 'hh-1', role: 'member' }),
    ])
    expect(
      world.households.state.locationMembers
        .filter((m) => m.userId === 'member')
        .map((m) => [m.locationId, m.role]),
    ).toEqual([
      ['loc-home', 'viewer'],
      ['loc-office', 'participant'],
    ])
    // And the member's User row exists, named by its id, with the first
    // sign-in claim already set
    const user = world.users.state.rows.find((u) => u.id === 'member')
    expect(user?.displayName).toBe('member')
    expect(user?.householdSetupAt).toBeInstanceOf(Date)
  })

  it('makes no location and no household', async () => {
    // Given the stores before
    const before = snapshot()

    // When a member is added
    await post(VALID)

    // Then the location and household counts are unchanged (no "Home", so no
    // second isDefault row for anyone)
    expect(world.stock.state.locations).toHaveLength(3)
    expect(world.households.state.households).toEqual(before.households)
  })

  it('sets the first sign-in claim on an existing User row, and keeps its name', async () => {
    // Given the member has a User row (from a webhook, say) but no claim
    world.users.reset([...world.users.state.rows, userRow('member')])

    // When the member is added
    const res = await post(VALID)

    // Then the claim is set and the name is the stored one
    expect(res.status).toBe(200)
    const user = world.users.state.rows.find((u) => u.id === 'member')
    expect(user?.householdSetupAt).toBeInstanceOf(Date)
    expect(user?.displayName).toBe('member name')
  })

  it("lets the member's first request find the owner's household, and makes none of its own", async () => {
    // Given the member was added before sending any request
    await post(VALID)

    // When the member's first request works out their household
    const householdId = await ensureHousehold('member', 'en')

    // Then it is the owner's, and no household was made
    expect(householdId).toBe('hh-1')
    expect(world.households.state.households).toHaveLength(2)
  })

  it('leaves a member removed by the owner\'s cleanup with NO household, not a new one of their own', async () => {
    // Given the member was added, and then their member row was removed
    // (the owner's /e2e/cleanup does this, e2e/tests/household-member-cleanup.spec.ts)
    await post(VALID)
    world.households.state.householdMembers = world.households.state.householdMembers.filter(
      (m) => m.userId !== 'member',
    )

    // When the member sends a request
    // Then it is refused with NO_HOUSEHOLD, because the claim is set
    await expect(ensureHousehold('member', 'en')).rejects.toMatchObject({
      extensions: { code: 'NO_HOUSEHOLD' },
    })
    expect(world.households.state.households).toHaveLength(2)
  })

  it('refuses the household role owner, and writes nothing', async () => {
    const before = snapshot()
    const res = await post({ ...VALID, householdRole: 'owner' })
    expect(res.status).toBe(400)
    expect(snapshot()).toEqual(before)
  })

  it('refuses an owner who has no household (409), and writes nothing', async () => {
    // Given 'nobody' owns no household
    const before = snapshot()

    // When a member is added to nobody's household
    const res = await post({ ...VALID, ownerUserId: 'nobody', locations: [] })

    // Then it is refused, and not even the member's User row is written
    expect(res.status).toBe(409)
    expect(snapshot()).toEqual(before)
  })

  it('refuses an owner who is only a manager somewhere (409)', async () => {
    // Given 'helper' is a manager of hh-1, not an owner
    world.users.reset([...world.users.state.rows, userRow('helper', { householdSetupAt: T })])
    world.households.state.householdMembers.push(householdMemberRow('hh-1', 'helper', 'manager'))
    const before = snapshot()

    // When a member is added with 'helper' as the owner
    const res = await post({ ...VALID, ownerUserId: 'helper', locations: [] })

    // Then it is refused
    expect(res.status).toBe(409)
    expect(snapshot()).toEqual(before)
  })

  it.each([
    ['a location of another household', 'loc-theirs'],
    ['a location that does not exist', 'loc-made-up'],
  ])('refuses %s (400), and writes nothing', async (_label, locationId) => {
    // Given the stores before
    const before = snapshot()

    // When one of the listed locations is not in the owner's household
    const res = await post({
      ...VALID,
      locations: [
        { locationId: 'loc-home', role: 'viewer' },
        { locationId, role: 'participant' },
      ],
    })

    // Then it is refused, naming that location, and no row is written, not
    // even the role on the good location
    expect(res.status).toBe(400)
    expect(res.body.error).toContain(locationId)
    expect(snapshot()).toEqual(before)
  })

  it('refuses a member who is already in a household (409), and writes nothing', async () => {
    // Given 'stranger' already owns hh-2
    const before = snapshot()

    // When 'stranger' is added to hh-1
    const res = await post({ ...VALID, memberUserId: 'stranger' })

    // Then it is refused, because a person in two households would get one of
    // them at random from ensureHousehold
    expect(res.status).toBe(409)
    expect(snapshot()).toEqual(before)
  })

  it('refuses a member added twice (409), and keeps the first roles', async () => {
    // Given the member was added once
    await post(VALID)
    const before = snapshot()

    // When the member is added again, as a manager
    const res = await post({ ...VALID, householdRole: 'manager', locations: [] })

    // Then it is refused, and the first roles stay
    expect(res.status).toBe(409)
    expect(snapshot()).toEqual(before)
  })
})
