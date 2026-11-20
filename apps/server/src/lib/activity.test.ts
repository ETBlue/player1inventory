import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdWorld } from '../test/householdWorld.js'

// `recordActivity(tx, entry)` (households H6, task J.1, decisions T46 and T47
// of docs/global/permissions/2026-11-20-households-plan-h6.md).
//
// The rule it exists for: a log row is written INSIDE the transaction of the
// change it describes. So it must use the `tx` it is given, never the global
// `prisma`. The global client here has its OWN `householdActivity` object, a
// spy over the same store, so a write through it is seen.

vi.mock('./prisma.js', async () => {
  const { vi: v } = await import('vitest')
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  const real = world.client.householdActivity
  return {
    prisma: {
      ...world.client,
      householdActivity: { ...real, create: v.fn(real.create) },
      $world: world,
    },
  }
})

import { prisma } from './prisma.js'
import { recordActivity } from './activity.js'
import { householdMemberRow, householdRow } from '../test/householdRows.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world
const globalCreate = vi.mocked(prisma.householdActivity.create)

const OWNER = 'user_owner'
const STRANGER = 'user_stranger'
const NOW = new Date('2026-11-20T10:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  world.reset()
  world.seedHouseholds({
    households: [householdRow('hh_ours', OWNER), householdRow('hh_theirs', STRANGER)],
    householdMembers: [
      householdMemberRow('hh_ours', OWNER, 'owner'),
      householdMemberRow('hh_theirs', STRANGER, 'owner'),
    ],
  })
  globalCreate.mockClear()
})

function rows() {
  return world.households.state.householdActivities
}

describe('recordActivity', () => {
  it('writes one row through the transaction it was given, never through the global client', async () => {
    // When a change logs itself inside its transaction
    await prisma.$transaction(async (tx) => {
      await recordActivity(tx, {
        householdId: 'hh_ours',
        actorId: OWNER,
        action: 'LOCATION_ROLE_SET',
        targetUserId: STRANGER,
        locationId: 'loc_kitchen',
        details: { locationName: 'Kitchen', from: null, to: 'viewer' },
      })
    })

    // Then one row is stored, with every column it was given
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({
      householdId: 'hh_ours',
      actorId: OWNER,
      action: 'LOCATION_ROLE_SET',
      targetUserId: STRANGER,
      locationId: 'loc_kitchen',
      details: { locationName: 'Kitchen', from: null, to: 'viewer' },
      createdAt: NOW,
    })
    // And the global client was never used for it
    expect(globalCreate).not.toHaveBeenCalled()
  })

  it('leaves the optional columns null when they are not given', async () => {
    await prisma.$transaction(async (tx) => {
      await recordActivity(tx, { householdId: 'hh_ours', actorId: OWNER, action: 'HOUSEHOLD_CLEARED' })
    })
    expect(rows()[0]).toMatchObject({ targetUserId: null, locationId: null, details: null })
  })

  it('its row rolls back with the change when a later step throws', async () => {
    // When the step after the log row fails
    await expect(
      prisma.$transaction(async (tx) => {
        await recordActivity(tx, { householdId: 'hh_ours', actorId: OWNER, action: 'MEMBER_LEFT' })
        throw new Error('a later step failed')
      }),
    ).rejects.toThrow('a later step failed')

    // Then no log row is left behind
    expect(rows()).toEqual([])
  })

  it.each([
    ['no householdId', { actorId: OWNER }],
    ['an empty householdId', { householdId: '', actorId: OWNER }],
    ['no actorId', { householdId: 'hh_ours' }],
    ['an empty actorId', { householdId: 'hh_ours', actorId: '' }],
  ])('refuses an entry with %s, and writes nothing', async (_, partial) => {
    // `undefined` reads as "no filter" in a Prisma where, and here it would
    // be a missing column. So the helper throws its own error first.
    await expect(
      prisma.$transaction(async (tx) =>
        recordActivity(tx, { action: 'MEMBER_LEFT', ...partial } as Parameters<typeof recordActivity>[1]),
      ),
    ).rejects.toThrow(/recordActivity/)
    expect(rows()).toEqual([])
  })
})
