import { describe, expect, it } from 'vitest'
import {
  createHouseholdFake,
  type HouseholdContents,
  HouseholdFakeForeignKeyError,
  HouseholdFakeMissingColumnError,
  HouseholdFakeUniqueError,
  HouseholdFakeUnsupportedError,
  type HouseholdMemberRow,
  type HouseholdRow,
  InvalidRoleError,
  type LocationMemberRow,
  type LocationRef,
  UnknownWhereKeyError,
  UnsupportedWhereFilterError,
} from './householdFake.js'
import { runInTransaction } from './stockFake.js'

// The double's OWN contract.
//
// Task 3.5's helpers are tested on top of `householdFake`. If the fake is
// wrong, those tests pass against wrong code, so each rule it claims is pinned
// here.
//
// The fixture has THREE people and TWO households (rule 10 of the H3a plan):
// the caller (owner of ours), a second member of ours with a different role
// (manager), and a stranger (owner of theirs). With one person, "check the
// role" and "ignore the role" give the same answer.

const CALLER = 'user_caller'
const SECOND = 'user_second'
const STRANGER = 'user_stranger'

const OURS = 'household_ours'
const THEIRS = 'household_theirs'

const KITCHEN = 'loc_kitchen' // ours; caller is organizer, second is viewer
const GARAGE = 'loc_garage' // ours; caller has NO location role
const SHED = 'loc_shed' // theirs

const T0 = new Date('2026-11-01T00:00:00.000Z')

function household(id: string, ownerId: string | null): HouseholdRow {
  return {
    id,
    name: `${id} name`,
    ownerId,
    ownerGoneAt: null,
    createdAt: T0,
    updatedAt: T0,
  }
}

function member(
  householdId: string,
  userId: string,
  role: HouseholdMemberRow['role'],
): HouseholdMemberRow {
  return { householdId, userId, role, joinedAt: T0 }
}

function locMember(
  locationId: string,
  userId: string,
  role: LocationMemberRow['role'],
): LocationMemberRow {
  return { locationId, userId, role, createdAt: T0 }
}

const LOCATIONS: LocationRef[] = [
  { id: KITCHEN, householdId: OURS },
  { id: GARAGE, householdId: OURS },
  { id: SHED, householdId: THEIRS },
]

function fixture(locations: LocationRef[] = LOCATIONS) {
  return createHouseholdFake({
    households: [household(OURS, CALLER), household(THEIRS, STRANGER)],
    householdMembers: [
      member(OURS, CALLER, 'owner'),
      member(OURS, SECOND, 'manager'),
      member(THEIRS, STRANGER, 'owner'),
    ],
    locationMembers: [
      locMember(KITCHEN, CALLER, 'organizer'),
      locMember(KITCHEN, SECOND, 'viewer'),
      locMember(SHED, STRANGER, 'organizer'),
    ],
    locations: () => locations,
  })
}

describe('householdFake applies where key by key', () => {
  it('householdMember.findMany by householdId returns only that household', async () => {
    // Given members in two households
    const fake = fixture()

    // When the members of ours are read
    const rows = await fake.client.householdMember.findMany({ where: { householdId: OURS } })

    // Then the stranger is not among them
    expect(rows.map((r) => r.userId).sort()).toEqual([CALLER, SECOND])
  })

  it('a key set to undefined filters nothing', async () => {
    // Given members in two households
    const fake = fixture()

    // When the where names householdId as undefined
    const rows = await fake.client.householdMember.findMany({
      where: { householdId: undefined },
    })

    // Then every row comes back (Prisma's rule)
    expect(rows).toHaveLength(3)
  })
})

describe('householdFake throws on a where key it does not model, once per call', () => {
  it('each store refuses an unknown key even when it is EMPTY', async () => {
    // Given an empty fake. A per-row check never runs on an empty store.
    const fake = createHouseholdFake({ locations: () => [] })

    // When each store is read with a key it does not model
    // Then each one throws, and names the store
    await expect(fake.client.household.findMany({ where: { name: 'X' } })).rejects.toThrow(
      /householdFake\(Household\).*'name'/,
    )
    await expect(
      fake.client.householdMember.findFirst({ where: { joinedAt: T0 } }),
    ).rejects.toThrow(UnknownWhereKeyError)
    await expect(
      fake.client.locationMember.findMany({ where: { householdId: OURS } }),
    ).rejects.toThrow(/householdFake\(LocationMember\).*'householdId'/)
  })

  it('a relation filter it does not model throws, even when the outer keys match nothing', async () => {
    // Given the fixture. The outer `userId` matches no row, so a per-row
    // matcher would return early and never reach the nested key.
    const fake = fixture()

    // When the nested filter uses `none`, or a key on location not modelled
    // Then both throw, and name the path to the key. (This used `every` until
    // households H5b task G.4, which models `members: { every }` for the
    // "is it empty" check.)
    await expect(
      fake.client.household.findFirst({
        where: { id: 'nobody', members: { none: { userId: CALLER } } },
      }),
    ).rejects.toThrow(/'members\.none'/)
    await expect(
      fake.client.locationMember.findFirst({
        where: { userId: 'nobody', location: { userId: CALLER } },
      }),
    ).rejects.toThrow(/'location\.userId'/)
  })

  it('a filter shape it does not model throws instead of matching everything', async () => {
    // Given the fixture
    const fake = fixture()

    // When role carries `{ not }`, which is not modelled
    // Then it throws
    await expect(
      fake.client.householdMember.findMany({ where: { role: { not: 'member' } } }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
  })
})

describe('householdFake matches role as a value or { in: [...] }', () => {
  it('a role value matches only rows with that role', async () => {
    // Given an owner and a manager in our household
    const fake = fixture()

    // When the managers of ours are read
    const rows = await fake.client.householdMember.findMany({
      where: { householdId: OURS, role: 'manager' },
    })

    // Then only the manager comes back. A fake that ignored role would also
    // return the owner, and a role check would pass against code that skips it.
    expect(rows.map((r) => r.userId)).toEqual([SECOND])
  })

  it('role { in: [...] } matches any listed role', async () => {
    // Given an owner and a manager in ours
    const fake = fixture()

    // When the caller's row is read with role in [manager, member]
    const asManagerOrMember = await fake.client.householdMember.findFirst({
      where: { householdId: OURS, userId: CALLER, role: { in: ['manager', 'member'] } },
    })
    // And with role in [owner, manager]
    const asOwnerOrManager = await fake.client.householdMember.findFirst({
      where: { householdId: OURS, userId: CALLER, role: { in: ['owner', 'manager'] } },
    })

    // Then only the list holding 'owner' finds the caller
    expect(asManagerOrMember).toBeNull()
    expect(asOwnerOrManager?.role).toBe('owner')
  })

  it('a location role filter tells a viewer from an organizer', async () => {
    // Given the second member is only a viewer of the kitchen
    const fake = fixture()

    // When the kitchen is read for someone who may write (organizer or participant)
    const row = await fake.client.locationMember.findFirst({
      where: {
        locationId: KITCHEN,
        userId: SECOND,
        role: { in: ['organizer', 'participant'] },
      },
    })

    // Then nothing: a viewer cannot write
    expect(row).toBeNull()
  })

  it('a role outside the enum throws, in a where and in a write', async () => {
    // Given the fixture
    const fake = fixture()

    // When a LocationMember is read or written with an old role string
    // ('member' was a location role before task 3.5 renamed it)
    // Then both throw rather than matching nothing
    await expect(
      fake.client.locationMember.findFirst({ where: { role: 'member' } }),
    ).rejects.toThrow(InvalidRoleError)
    await expect(
      fake.client.locationMember.create({
        data: { locationId: GARAGE, userId: CALLER, role: 'owner' },
      }),
    ).rejects.toThrow(InvalidRoleError)
    await expect(
      fake.client.householdMember.findMany({ where: { role: { in: ['organizer'] } } }),
    ).rejects.toThrow(InvalidRoleError)
    expect(fake.state.locationMembers).toHaveLength(3)
  })
})

describe('householdFake honours both composite primary keys', () => {
  it('a second HouseholdMember row for one household and person raises P2002', async () => {
    // Given the second person is a manager of ours
    const fake = fixture()

    // When a second row is created for the same pair
    // Then it fails with P2002 and nothing is written
    await expect(
      fake.client.householdMember.create({
        data: { householdId: OURS, userId: SECOND, role: 'member' },
      }),
    ).rejects.toMatchObject({ code: 'P2002', constraint: 'HouseholdMember_pkey' })
    expect(fake.state.householdMembers).toHaveLength(3)
  })

  it('the same person may be a member of two households', async () => {
    // Given the second person is in ours
    const fake = fixture()

    // When they are added to theirs
    await fake.client.householdMember.create({
      data: { householdId: THEIRS, userId: SECOND, role: 'member' },
    })

    // Then both rows exist: the key is the PAIR, not the person
    expect(fake.state.householdMembers.filter((m) => m.userId === SECOND)).toHaveLength(2)
  })

  it('an update that moves a member onto a taken key raises P2002', async () => {
    // Given the stranger in theirs, and the second person in ours and theirs
    const fake = fixture()
    await fake.client.householdMember.create({
      data: { householdId: THEIRS, userId: SECOND, role: 'member' },
    })

    // When the second person's row in theirs is moved to ours
    // Then it fails: (ours, second) is taken
    await expect(
      fake.client.householdMember.update({
        where: { householdId_userId: { householdId: THEIRS, userId: SECOND } },
        data: { householdId: OURS },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('a second LocationMember row for one location and person raises P2002', async () => {
    // Given the caller is organizer of the kitchen
    const fake = fixture()

    // When a second row is created for the same pair
    // Then it fails with P2002 and nothing is written
    await expect(
      fake.client.locationMember.create({
        data: { locationId: KITCHEN, userId: CALLER, role: 'viewer' },
      }),
    ).rejects.toMatchObject({ code: 'P2002', constraint: 'LocationMember_pkey' })
    expect(fake.state.locationMembers).toHaveLength(3)
  })

  it('findUnique by a compound key finds exactly that pair', async () => {
    // Given the fixture
    const fake = fixture()

    // When the caller's row in ours and in theirs is read
    const mine = await fake.client.householdMember.findUnique({
      where: { householdId_userId: { householdId: OURS, userId: CALLER } },
    })
    const none = await fake.client.householdMember.findUnique({
      where: { householdId_userId: { householdId: THEIRS, userId: CALLER } },
    })
    const kitchen = await fake.client.locationMember.findUnique({
      where: { locationId_userId: { locationId: KITCHEN, userId: SECOND } },
    })

    // Then only the real pairs come back
    expect(mine?.role).toBe('owner')
    expect(none).toBeNull()
    expect(kitchen?.role).toBe('viewer')
  })

  it('a compound key that leaves out a field throws', async () => {
    // Given the fixture
    const fake = fixture()

    // When findUnique names only half of the key
    // Then it throws instead of matching on one field
    await expect(
      fake.client.householdMember.findUnique({
        where: { householdId_userId: { householdId: OURS } },
      }),
    ).rejects.toThrow(HouseholdFakeUnsupportedError)
    await expect(
      fake.client.locationMember.findUnique({ where: { userId: CALLER } }),
    ).rejects.toThrow(/no 'locationId_userId'/)
  })
})

describe('householdFake models HouseholdMember_one_owner_key', () => {
  it('a second owner row in one household raises P2002', async () => {
    // Given the caller owns ours
    const fake = fixture()

    // When a new owner row is created in ours, for a person not yet in it
    // Then it fails, the way the partial unique index does in Postgres
    await expect(
      fake.client.householdMember.create({
        data: { householdId: OURS, userId: 'user_third', role: 'owner' },
      }),
    ).rejects.toMatchObject({ code: 'P2002', constraint: 'HouseholdMember_one_owner_key' })
    expect(fake.state.householdMembers.filter((m) => m.role === 'owner')).toHaveLength(2)
  })

  it('promoting a manager to owner by update raises P2002 while an owner exists', async () => {
    // Given the caller owns ours and the second person is a manager
    const fake = fixture()

    // When the manager is promoted without demoting the owner first
    // Then it fails, and the manager keeps their role
    await expect(
      fake.client.householdMember.update({
        where: { householdId_userId: { householdId: OURS, userId: SECOND } },
        data: { role: 'owner' },
      }),
    ).rejects.toMatchObject({ code: 'P2002', constraint: 'HouseholdMember_one_owner_key' })
    expect(fake.state.householdMembers.find((m) => m.userId === SECOND)?.role).toBe('manager')
  })

  it('a hand-over that demotes the owner first is allowed', async () => {
    // Given the caller owns ours and the second person is a manager
    const fake = fixture()

    // When the owner is demoted, then the manager promoted
    await fake.client.householdMember.update({
      where: { householdId_userId: { householdId: OURS, userId: CALLER } },
      data: { role: 'manager' },
    })
    await fake.client.householdMember.update({
      where: { householdId_userId: { householdId: OURS, userId: SECOND } },
      data: { role: 'owner' },
    })

    // Then ours has exactly one owner, the second person
    const owners = fake.state.householdMembers.filter(
      (m) => m.householdId === OURS && m.role === 'owner',
    )
    expect(owners.map((m) => m.userId)).toEqual([SECOND])
  })

  it('an owner in another household does not count', async () => {
    // Given a new household with no members
    const fake = fixture()
    await fake.client.household.create({ data: { id: 'household_new', name: 'New' } })

    // When its first owner row is created
    await fake.client.householdMember.create({
      data: { householdId: 'household_new', userId: SECOND, role: 'owner' },
    })

    // Then it is stored: the index is per household
    expect(fake.state.householdMembers.filter((m) => m.role === 'owner')).toHaveLength(3)
  })
})

describe('householdFake enforces foreign keys and NOT NULL columns', () => {
  it('a HouseholdMember for a household that does not exist raises P2003', async () => {
    // Given the fixture
    const fake = fixture()

    // When a member row names a household id no row holds — for example, a
    // helper that writes the member row before the household
    // Then it fails and nothing is written
    await expect(
      fake.client.householdMember.create({
        data: { householdId: 'household_none', userId: CALLER, role: 'owner' },
      }),
    ).rejects.toThrow(HouseholdFakeForeignKeyError)
    expect(fake.state.householdMembers).toHaveLength(3)
  })

  it('a LocationMember for a location that does not exist raises P2003', async () => {
    // Given the fixture
    const fake = fixture()

    // When a location member row names a location id no row holds
    // Then it fails with P2003
    await expect(
      fake.client.locationMember.create({
        data: { locationId: 'loc_none', userId: CALLER, role: 'organizer' },
      }),
    ).rejects.toMatchObject({ code: 'P2003' })
  })

  it('the locations option is read on every call, so a location created later counts', async () => {
    // Given a location list the test can grow
    const locations: LocationRef[] = [...LOCATIONS]
    const fake = fixture(locations)

    // When a location is added after the fake was built, then given a member
    locations.push({ id: 'loc_new', householdId: OURS })
    await fake.client.locationMember.create({
      data: { locationId: 'loc_new', userId: CALLER, role: 'organizer' },
    })

    // Then the row is stored
    expect(fake.state.locationMembers.some((m) => m.locationId === 'loc_new')).toBe(true)
  })

  it('a LocationMember write with no locations option throws', async () => {
    // Given a fake built with no locations option
    const fake = createHouseholdFake()

    // When a location member is written
    // Then it throws instead of skipping the foreign key
    await expect(
      fake.client.locationMember.create({
        data: { locationId: KITCHEN, userId: CALLER, role: 'organizer' },
      }),
    ).rejects.toThrow(/no `locations` option/)
  })

  it('a write that leaves out a NOT NULL column throws', async () => {
    // Given the fixture
    const fake = fixture()

    // When a household has no name, a member has no role, a location member no userId
    // Then each throws
    await expect(fake.client.household.create({ data: {} })).rejects.toThrow(
      HouseholdFakeMissingColumnError,
    )
    await expect(
      fake.client.householdMember.create({ data: { householdId: OURS, userId: 'user_x' } }),
    ).rejects.toThrow(/no role/)
    await expect(
      fake.client.locationMember.create({ data: { locationId: GARAGE, role: 'viewer' } }),
    ).rejects.toThrow(/no userId/)
  })
})

describe('householdFake resolves the relation filters task 3.5 uses', () => {
  it("household.members.some finds the caller's household, not the stranger's", async () => {
    // Given two households
    const fake = fixture()

    // When the household the caller belongs to is read
    const mine = await fake.client.household.findFirst({
      where: { members: { some: { userId: CALLER } } },
    })
    const secondAsManager = await fake.client.household.findFirst({
      where: { members: { some: { userId: SECOND, role: 'manager' } } },
    })
    const nobody = await fake.client.household.findFirst({
      where: { members: { some: { userId: 'user_none' } } },
    })

    // Then each finds the right household, or none
    expect(mine?.id).toBe(OURS)
    expect(secondAsManager?.id).toBe(OURS)
    expect(nobody).toBeNull()
  })

  it('a location role counts only while the person is still a household member (H18)', async () => {
    // Given the second person is a viewer of the kitchen, then removed from
    // the household. Their LocationMember row is left behind, stale.
    const fake = fixture()
    await fake.client.householdMember.delete({
      where: { householdId_userId: { householdId: OURS, userId: SECOND } },
    })
    const stillCounts = (userId: string) =>
      fake.client.locationMember.findFirst({
        where: {
          locationId: KITCHEN,
          userId,
          location: { household: { members: { some: { userId } } } },
        },
      })

    // When the kitchen role is read with the H18 filter
    const caller = await stillCounts(CALLER)
    const removed = await stillCounts(SECOND)

    // Then the caller's role counts and the removed person's does not.
    // Without the filter the stale row would still be found.
    expect(caller?.role).toBe('organizer')
    expect(removed).toBeNull()
    expect(
      await fake.client.locationMember.findFirst({ where: { locationId: KITCHEN, userId: SECOND } }),
    ).not.toBeNull()
  })

  it("the H18 filter refuses a role on another household's location", async () => {
    // Given the caller is made organizer of the stranger's shed, but is not a
    // member of the stranger's household
    const fake = fixture()
    await fake.client.locationMember.create({
      data: { locationId: SHED, userId: CALLER, role: 'organizer' },
    })

    // When the shed role is read with the H18 filter
    const row = await fake.client.locationMember.findFirst({
      where: {
        locationId: SHED,
        userId: CALLER,
        location: { household: { members: { some: { userId: CALLER } } } },
      },
    })

    // Then it does not count
    expect(row).toBeNull()
  })

  it('location.householdId lists the location rows of one household', async () => {
    // Given location roles in two households
    const fake = fixture()

    // When the rows of ours are read
    const rows = await fake.client.locationMember.findMany({
      where: { location: { householdId: OURS } },
    })

    // Then only the kitchen's two rows come back, not the shed's
    expect(rows.map((r) => `${r.locationId}:${r.userId}`).sort()).toEqual([
      `${KITCHEN}:${CALLER}`,
      `${KITCHEN}:${SECOND}`,
    ])
  })

  it('a location with no household does not match a household filter', async () => {
    // Given a location whose householdId is still null (before the backfill)
    const fake = fixture([...LOCATIONS, { id: 'loc_orphan', householdId: null }])
    await fake.client.locationMember.create({
      data: { locationId: 'loc_orphan', userId: CALLER, role: 'organizer' },
    })

    // When it is read with the H18 filter
    const row = await fake.client.locationMember.findFirst({
      where: {
        locationId: 'loc_orphan',
        location: { household: { members: { some: { userId: CALLER } } } },
      },
    })

    // Then nothing matches, as an inner join on a null key gives nothing
    expect(row).toBeNull()
  })

  it("user.householdMemberships matches the row's OWN person, not the caller", async () => {
    // Given the caller organizes the kitchen and the shed. The caller is in
    // ours only. The stranger also organizes the shed and is in theirs.
    const fake = fixture()
    await fake.client.locationMember.create({
      data: { locationId: SHED, userId: CALLER, role: 'organizer' },
    })

    // When the organizer rows are read whose person is in theirs
    const rows = await fake.client.locationMember.findMany({
      where: {
        role: 'organizer',
        user: { householdMemberships: { some: { householdId: THEIRS } } },
      },
    })

    // Then only the stranger's shed row comes back. The caller's shed row is
    // left out: the caller is not in theirs, and the filter reads each row's
    // own person.
    expect(rows.map((r) => `${r.locationId}:${r.userId}`)).toEqual([`${SHED}:${STRANGER}`])
  })

  it('user.householdMemberships drops a person who left the household', async () => {
    // Given the second person (viewer of the kitchen) is removed from ours
    const fake = fixture()
    await fake.client.householdMember.delete({
      where: { householdId_userId: { householdId: OURS, userId: SECOND } },
    })

    // When the kitchen rows are read whose person is still in ours
    const rows = await fake.client.locationMember.findMany({
      where: { locationId: KITCHEN, user: { householdMemberships: { some: { householdId: OURS } } } },
    })

    // Then the second person's stale row is left out
    expect(rows.map((r) => r.userId)).toEqual([CALLER])
  })

  it('user.householdMemberships refuses a key it does not model', async () => {
    const fake = fixture()
    await expect(
      fake.client.locationMember.findMany({
        where: { user: { householdMemberships: { some: { joinedAt: T0 } } } },
      }),
    ).rejects.toBeInstanceOf(UnknownWhereKeyError)
    await expect(
      fake.client.locationMember.findMany({ where: { user: { email: 'x' } } }),
    ).rejects.toBeInstanceOf(UnknownWhereKeyError)
  })
})

describe('householdFake writes: defaults, update, upsert, delete', () => {
  it('household.create generates an id, sets defaults and keeps the given columns', async () => {
    // Given an empty fake
    const fake = createHouseholdFake()

    // When a household is created with only a name and an owner
    const row = await fake.client.household.create({
      data: { name: "ET's Household", ownerId: CALLER },
    })

    // Then it has an id, the given columns, and null ownerGoneAt
    expect(row.id).toBe('household-1')
    expect(row.name).toBe("ET's Household")
    expect(row.ownerId).toBe(CALLER)
    expect(row.ownerGoneAt).toBeNull()
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it('household.create with a taken id raises P2002', async () => {
    // Given the fixture
    const fake = fixture()

    // When a household is created with an id already held
    // Then it fails
    await expect(
      fake.client.household.create({ data: { id: OURS, name: 'Again' } }),
    ).rejects.toMatchObject({ code: 'P2002', constraint: 'Household_pkey' })
  })

  it('household.update renames one row and moves updatedAt; a missing id raises P2025', async () => {
    // Given the fixture
    const fake = fixture()

    // When ours is renamed
    await fake.client.household.update({ where: { id: OURS }, data: { name: 'Renamed' } })

    // Then only ours changed, and updatedAt moved
    const ours = fake.state.households.find((h) => h.id === OURS)
    expect(ours?.name).toBe('Renamed')
    expect(ours?.updatedAt.getTime()).toBeGreaterThan(T0.getTime())
    expect(fake.state.households.find((h) => h.id === THEIRS)?.name).toBe(`${THEIRS} name`)
    await expect(
      fake.client.household.update({ where: { id: 'none' }, data: { name: 'X' } }),
    ).rejects.toMatchObject({ code: 'P2025' })
  })

  it('upsert keeps create and update apart', async () => {
    // Given the second person is a viewer of the kitchen
    const fake = fixture()

    // When an upsert runs for that pair, and for a new pair
    await fake.client.locationMember.upsert({
      where: { locationId_userId: { locationId: KITCHEN, userId: SECOND } },
      create: { locationId: KITCHEN, userId: SECOND, role: 'organizer' },
      update: { role: 'participant' },
    })
    await fake.client.locationMember.upsert({
      where: { locationId_userId: { locationId: GARAGE, userId: SECOND } },
      create: { locationId: GARAGE, userId: SECOND, role: 'viewer' },
      update: { role: 'organizer' },
    })

    // Then the existing row took the update, and the new row took the create
    const role = (locationId: string) =>
      fake.state.locationMembers.find((m) => m.locationId === locationId && m.userId === SECOND)
        ?.role
    expect(role(KITCHEN)).toBe('participant')
    expect(role(GARAGE)).toBe('viewer')
  })

  it('deleteMany removes only matching rows and returns the count', async () => {
    // Given the fixture
    const fake = fixture()

    // When the kitchen's location roles are deleted
    const result = await fake.client.locationMember.deleteMany({
      where: { locationId: KITCHEN },
    })

    // Then two went, and the shed's row is left
    expect(result).toEqual({ count: 2 })
    expect(fake.state.locationMembers.map((m) => m.locationId)).toEqual([SHED])
  })

  it('count counts matching rows', async () => {
    // Given the fixture
    const fake = fixture()

    // When the owners of ours are counted
    const owners = await fake.client.householdMember.count({
      where: { householdId: OURS, role: 'owner' },
    })

    // Then there is one
    expect(owners).toBe(1)
  })
})

describe('householdFake refuses what it does not model', () => {
  it('a nested write throws instead of being stored as a column', async () => {
    // Given an empty fake
    const fake = createHouseholdFake()

    // When a household is created with a nested members.create
    // Then it throws. Write each row with its own call.
    await expect(
      fake.client.household.create({
        data: { name: 'X', members: { create: { userId: CALLER, role: 'owner' } } },
      }),
    ).rejects.toThrow(/nested write/)
    expect(fake.state.households).toHaveLength(0)
  })

  it('include and orderBy throw as unknown options', async () => {
    // Given the fixture
    const fake = fixture()

    // When include or orderBy is passed
    // Then it throws, so no test rests on something the fake never applied
    await expect(
      fake.client.householdMember.findFirst({
        where: { userId: CALLER },
        include: { household: true },
      } as never),
    ).rejects.toThrow(/the option 'include'/)
    await expect(
      fake.client.household.findMany({ orderBy: { name: 'asc' } } as never),
    ).rejects.toThrow(/the option 'orderBy'/)
  })
})

describe('householdFake works with the shared helpers', () => {
  it('a returned row is a copy, so changing it does not change the store', async () => {
    // Given the fixture
    const fake = fixture()

    // When the caller changes a row it got back
    const row = await fake.client.household.findUnique({ where: { id: OURS } })
    if (row) row.name = 'Changed by caller'

    // Then the store is unchanged
    expect(fake.state.households.find((h) => h.id === OURS)?.name).toBe(`${OURS} name`)
  })

  it('runInTransaction rolls all three stores back when the callback throws', async () => {
    // Given the fixture, with its state registered as a rollback store
    const fake = fixture()

    // When a transaction writes to all three stores and then throws
    await expect(
      runInTransaction([fake.state as unknown as Record<string, unknown>], fake.client, async () => {
        const h = await fake.client.household.create({ data: { name: 'New' } })
        await fake.client.householdMember.create({
          data: { householdId: h.id, userId: 'user_new', role: 'owner' },
        })
        await fake.client.locationMember.create({
          data: { locationId: GARAGE, userId: CALLER, role: 'organizer' },
        })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    // Then every write is undone
    expect(fake.state.households).toHaveLength(2)
    expect(fake.state.householdMembers).toHaveLength(3)
    expect(fake.state.locationMembers).toHaveLength(3)
  })

  it('the unique error carries code P2002 and the constraint name', () => {
    // A guard on the error itself, because task 3.5 catches it by code.
    const err = new HouseholdFakeUniqueError('HouseholdMember', 'X', 'detail')
    expect(err.code).toBe('P2002')
    expect(err.constraint).toBe('X')
  })
})

// Rules a review found unpinned (task 3.4 review). Each test below goes red
// when its rule is removed from householdFake.ts.
describe('householdFake: rules pinned after review', () => {
  it('household.update that sets name to null throws and leaves the row as it was', async () => {
    // Given the fixture
    const fake = fixture()

    // When ours is updated with a null name (the column is NOT NULL)
    // Then it throws, and the stored name and updatedAt are unchanged
    await expect(
      fake.client.household.update({ where: { id: OURS }, data: { name: null } }),
    ).rejects.toThrow(HouseholdFakeMissingColumnError)
    const ours = fake.state.households.find((h) => h.id === OURS)
    expect(ours?.name).toBe(`${OURS} name`)
    expect(ours?.updatedAt).toEqual(T0)
  })

  it('a unique where with a filter instead of a plain value throws', async () => {
    // Given the fixture
    const fake = fixture()

    // When findUnique or update names id as { in: [...] }, or a compound key
    // field as { in: [...] }
    // Then each throws. Prisma refuses a filter in a unique where.
    await expect(
      fake.client.household.findUnique({ where: { id: { in: [OURS, THEIRS] } } }),
    ).rejects.toThrow(/'id' is not a plain string/)
    await expect(
      fake.client.household.update({ where: { id: { in: [OURS] } }, data: { name: 'X' } }),
    ).rejects.toThrow(HouseholdFakeUnsupportedError)
    await expect(
      fake.client.householdMember.findUnique({
        where: { householdId_userId: { householdId: OURS, userId: { in: [CALLER] } } },
      }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
    expect(fake.state.households.find((h) => h.id === OURS)?.name).toBe(`${OURS} name`)
  })

  it('a HouseholdMember write with a role outside the enum throws', async () => {
    // Given the fixture
    const fake = fixture()

    // When a member is created, or updated, with a LOCATION role
    // Then both throw, and nothing is written
    await expect(
      fake.client.householdMember.create({
        data: { householdId: OURS, userId: 'user_new', role: 'organizer' },
      }),
    ).rejects.toThrow(InvalidRoleError)
    await expect(
      fake.client.householdMember.update({
        where: { householdId_userId: { householdId: OURS, userId: SECOND } },
        data: { role: 'viewer' },
      }),
    ).rejects.toThrow(InvalidRoleError)
    expect(fake.state.householdMembers).toHaveLength(3)
    expect(
      fake.state.householdMembers.find((m) => m.householdId === OURS && m.userId === SECOND)
        ?.role,
    ).toBe('manager')
  })

  it('householdMember.upsert keeps create and update apart', async () => {
    // Given the second person is a manager of ours, and the caller is not a
    // member of theirs
    const fake = fixture()

    // When an upsert runs for the existing pair, and for a new pair. Each
    // call's create and update carry DIFFERENT roles.
    await fake.client.householdMember.upsert({
      where: { householdId_userId: { householdId: OURS, userId: SECOND } },
      create: { householdId: OURS, userId: SECOND, role: 'manager' },
      update: { role: 'member' },
    })
    await fake.client.householdMember.upsert({
      where: { householdId_userId: { householdId: THEIRS, userId: CALLER } },
      create: { householdId: THEIRS, userId: CALLER, role: 'member' },
      update: { role: 'manager' },
    })

    // Then the existing row took the update, and the new row took the create
    const role = (householdId: string, userId: string) =>
      fake.state.householdMembers.find((m) => m.householdId === householdId && m.userId === userId)
        ?.role
    expect(role(OURS, SECOND)).toBe('member')
    expect(role(THEIRS, CALLER)).toBe('member')
    expect(fake.state.householdMembers).toHaveLength(4)
  })

  it('a role outside the enum inside members.some throws, on Household and on the H18 path', async () => {
    // Given the fixture
    const fake = fixture()

    // When members.some names a LOCATION role, which a household member never
    // has. Without the check this matches nothing and returns null quietly.
    // Then it throws, on the Household filter and on the H18 filter
    await expect(
      fake.client.household.findFirst({
        where: { members: { some: { userId: CALLER, role: 'organizer' } } },
      }),
    ).rejects.toThrow(InvalidRoleError)
    await expect(
      fake.client.locationMember.findFirst({
        where: {
          locationId: KITCHEN,
          userId: CALLER,
          location: { household: { members: { some: { userId: CALLER, role: 'organizer' } } } },
        },
      }),
    ).rejects.toThrow(InvalidRoleError)
  })

  it('findFirst returns a copy on every store', async () => {
    // Given the fixture
    const fake = fixture()

    // When the caller changes the rows findFirst gave back
    const h = await fake.client.household.findFirst({ where: { id: OURS } })
    const m = await fake.client.householdMember.findFirst({ where: { userId: SECOND } })
    const l = await fake.client.locationMember.findFirst({ where: { userId: SECOND } })
    if (h) h.name = 'Changed'
    if (m) m.role = 'owner'
    if (l) l.role = 'organizer'

    // Then the stores are unchanged
    expect(fake.state.households.find((r) => r.id === OURS)?.name).toBe(`${OURS} name`)
    expect(fake.state.householdMembers.find((r) => r.userId === SECOND)?.role).toBe('manager')
    expect(fake.state.locationMembers.find((r) => r.userId === SECOND)?.role).toBe('viewer')
  })

  it('deleteMany with no where deletes every row (Prisma rule)', async () => {
    // Given the fixture
    const fake = fixture()

    // When deleteMany runs with no arguments on both member stores
    const members = await fake.client.householdMember.deleteMany()
    const locMembers = await fake.client.locationMember.deleteMany()

    // Then every row is gone, and the counts say so
    expect(members).toEqual({ count: 3 })
    expect(locMembers).toEqual({ count: 3 })
    expect(fake.state.householdMembers).toHaveLength(0)
    expect(fake.state.locationMembers).toHaveLength(0)
  })

  it('findUnique without the full compound key throws, on both member stores', async () => {
    // Given the fixture
    const fake = fixture()

    // When findUnique names half of the LocationMember key, or no
    // HouseholdMember key at all
    // Then each throws instead of matching on what it was given
    await expect(
      fake.client.locationMember.findUnique({
        where: { locationId_userId: { locationId: KITCHEN } },
      }),
    ).rejects.toThrow(/no string 'userId'/)
    await expect(
      fake.client.householdMember.findUnique({ where: { householdId: OURS, userId: CALLER } }),
    ).rejects.toThrow(/no 'householdId_userId'/)
  })
})

// ── Households H5b, task G.1: the HouseholdInvite store ──
//
// G.3 and G.4 test invites and the join on top of this store. The claim of
// decision T17 is one conditional updateMany:
//   where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }
// so each of those keys must really filter.

const NOW = new Date('2026-11-18T12:00:00.000Z')
const LATER = new Date('2026-11-25T12:00:00.000Z')

function inviteData(over: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    householdId: OURS,
    token: 'token_1',
    householdRole: 'member',
    locationRoles: [{ locationId: KITCHEN, role: 'viewer' }],
    createdById: CALLER,
    expiresAt: LATER,
    ...over,
  }
}

const CLAIM_WHERE = { id: 'inv_1', usedAt: null, revokedAt: null, expiresAt: { gt: NOW } }
const CLAIM_DATA = { usedAt: NOW, usedById: SECOND }

describe('householdFake models HouseholdInvite (households H5b, decision T26)', () => {
  it('create fills the defaults and keeps the columns it was given', async () => {
    // Given the fixture
    const fake = fixture()

    // When an invite is created
    const invite = await fake.client.householdInvite.create({ data: inviteData() })

    // Then it is stored with null used and revoked columns and its location roles
    expect(invite).toMatchObject({
      id: 'inv_1',
      householdId: OURS,
      token: 'token_1',
      householdRole: 'member',
      createdById: CALLER,
      expiresAt: LATER,
      usedAt: null,
      usedById: null,
      revokedAt: null,
      locationRoles: [{ locationId: KITCHEN, role: 'viewer' }],
    })
    expect(invite.createdAt).toBeInstanceOf(Date)
    expect(fake.state.householdInvites).toHaveLength(1)
  })

  it('a second invite with the same token raises P2002, after a new token was accepted', async () => {
    // Given one invite, and a second with a NEW token accepted
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })
    await fake.client.householdInvite.create({ data: inviteData({ id: 'inv_2', token: 'token_2' }) })

    // When a third reuses the first token
    // Then it is refused on the token's unique index, and nothing is added
    await expect(
      fake.client.householdInvite.create({ data: inviteData({ id: 'inv_3', token: 'token_1' }) }),
    ).rejects.toMatchObject({ code: 'P2002', constraint: 'HouseholdInvite_token_key' })
    expect(fake.state.householdInvites).toHaveLength(2)
  })

  it('a taken id raises P2002, a missing household P2003, a bad role and a missing column throw', async () => {
    // Given one invite
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })

    // Then each broken write is refused
    await expect(
      fake.client.householdInvite.create({ data: inviteData({ token: 'token_9' }) }),
    ).rejects.toMatchObject({ code: 'P2002', constraint: 'HouseholdInvite_pkey' })
    await expect(
      fake.client.householdInvite.create({
        data: inviteData({ id: 'inv_9', token: 'token_9', householdId: 'household_none' }),
      }),
    ).rejects.toBeInstanceOf(HouseholdFakeForeignKeyError)
    await expect(
      fake.client.householdInvite.create({
        data: inviteData({ id: 'inv_9', token: 'token_9', householdRole: 'organizer' }),
      }),
    ).rejects.toBeInstanceOf(InvalidRoleError)
    await expect(
      fake.client.householdInvite.create({
        data: inviteData({ id: 'inv_9', token: 'token_9', expiresAt: undefined }),
      }),
    ).rejects.toBeInstanceOf(HouseholdFakeMissingColumnError)
  })

  it('findUnique finds by id and by token, and needs exactly one of them', async () => {
    // Given two invites
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })
    await fake.client.householdInvite.create({ data: inviteData({ id: 'inv_2', token: 'token_2' }) })

    // When each is read by one unique key
    const byId = await fake.client.householdInvite.findUnique({ where: { id: 'inv_2' } })
    const byToken = await fake.client.householdInvite.findUnique({ where: { token: 'token_1' } })
    const none = await fake.client.householdInvite.findUnique({ where: { token: 'token_none' } })

    // Then the right row comes back, and nothing for a token no row holds
    expect(byId?.token).toBe('token_2')
    expect(byToken?.id).toBe('inv_1')
    expect(none).toBeNull()

    // And a where with no unique key, or both, throws
    await expect(
      fake.client.householdInvite.findUnique({ where: { householdId: OURS } }),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
    await expect(
      fake.client.householdInvite.findUnique({ where: { id: 'inv_1', token: 'token_1' } }),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
  })

  it('findMany filters by householdId, usedAt null and revokedAt null', async () => {
    // Given an open invite of ours, a used one, a revoked one, and one of theirs
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })
    await fake.client.householdInvite.create({
      data: inviteData({ id: 'inv_used', token: 't_used', usedAt: NOW, usedById: SECOND }),
    })
    await fake.client.householdInvite.create({
      data: inviteData({ id: 'inv_revoked', token: 't_revoked', revokedAt: NOW }),
    })
    await fake.client.householdInvite.create({
      data: inviteData({ id: 'inv_theirs', token: 't_theirs', householdId: THEIRS }),
    })

    // When the open invites of our household are listed
    const open = await fake.client.householdInvite.findMany({
      where: { householdId: OURS, usedAt: null, revokedAt: null },
    })

    // Then only the open one of ours comes back
    expect(open.map((i) => i.id)).toEqual(['inv_1'])
  })

  it('the claim matches an open invite once, and its count says so', async () => {
    // Given one open invite
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })

    // When the claim runs twice
    const first = await fake.client.householdInvite.updateMany({ where: CLAIM_WHERE, data: CLAIM_DATA })
    const second = await fake.client.householdInvite.updateMany({ where: CLAIM_WHERE, data: CLAIM_DATA })

    // Then the first claims it and the second finds it used
    expect(first).toEqual({ count: 1 })
    expect(second).toEqual({ count: 0 })
    expect(fake.state.householdInvites[0]).toMatchObject({ usedAt: NOW, usedById: SECOND })
  })

  it('the claim does not match an expired invite, nor one that expires exactly now', async () => {
    // Given an invite that expired, one that expires now, and one still open
    const fake = fixture()
    await fake.client.householdInvite.create({
      data: inviteData({ id: 'inv_old', token: 't_old', expiresAt: new Date(NOW.getTime() - 1) }),
    })
    await fake.client.householdInvite.create({
      data: inviteData({ id: 'inv_edge', token: 't_edge', expiresAt: NOW }),
    })
    await fake.client.householdInvite.create({ data: inviteData() })

    // When each is claimed
    const counts = []
    for (const id of ['inv_old', 'inv_edge', 'inv_1']) {
      counts.push(
        (
          await fake.client.householdInvite.updateMany({
            where: { ...CLAIM_WHERE, id },
            data: CLAIM_DATA,
          })
        ).count,
      )
    }

    // Then only the open one is claimed: `gt` is strict, as in SQL
    expect(counts).toEqual([0, 0, 1])
  })

  it('the claim does not match a revoked invite', async () => {
    // Given a revoked invite
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData({ revokedAt: NOW }) })

    // When it is claimed
    const result = await fake.client.householdInvite.updateMany({
      where: CLAIM_WHERE,
      data: CLAIM_DATA,
    })

    // Then nothing is claimed and the invite is unchanged
    expect(result).toEqual({ count: 0 })
    expect(fake.state.householdInvites[0]?.usedAt).toBeNull()
  })

  it('throws on a where key or filter shape it does not model, even on an empty store', async () => {
    // Given an EMPTY invite store
    const fake = fixture()

    // Then an unknown key, and expiresAt with an operator it does not model, each throw
    await expect(
      fake.client.householdInvite.findMany({ where: { usedById: CALLER } }),
    ).rejects.toBeInstanceOf(UnknownWhereKeyError)
    await expect(
      fake.client.householdInvite.updateMany({
        where: { id: 'inv_1', expiresAt: { gte: NOW } },
        data: CLAIM_DATA,
      }),
    ).rejects.toBeInstanceOf(UnsupportedWhereFilterError)
    await expect(
      fake.client.householdInvite.findMany({ where: { usedAt: { not: null } } }),
    ).rejects.toBeInstanceOf(UnsupportedWhereFilterError)
  })

  it('filters by createdById, for the revoke on removal (owner decision O20)', async () => {
    // Given one invite made by CALLER and one by SECOND
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })
    await fake.client.householdInvite.create({
      data: inviteData({ id: 'inv_2', token: 'token_2', createdById: SECOND }),
    })

    // When the invites CALLER made are revoked
    const result = await fake.client.householdInvite.updateMany({
      where: { householdId: OURS, createdById: CALLER, usedAt: null, revokedAt: null },
      data: { revokedAt: NOW },
    })

    // Then only CALLER's is revoked
    expect(result).toEqual({ count: 1 })
    expect(fake.state.householdInvites.map((i) => [i.id, i.revokedAt])).toEqual([
      ['inv_1', NOW],
      ['inv_2', null],
    ])
  })

  it('returns copies, locationRoles included', async () => {
    // Given one invite
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })

    // When a returned row and its location roles are changed
    const read = await fake.client.householdInvite.findUnique({ where: { id: 'inv_1' } })
    if (!read) throw new Error('the invite was not found')
    read.token = 'changed'
    ;(read.locationRoles as Array<{ role: string }>)[0]!.role = 'organizer'

    // Then the store is unchanged
    expect(fake.state.householdInvites[0]?.token).toBe('token_1')
    expect(fake.state.householdInvites[0]?.locationRoles).toEqual([
      { locationId: KITCHEN, role: 'viewer' },
    ])
  })

  it('a claim inside a transaction that throws is rolled back', async () => {
    // Given one open invite, and the fake's state registered with runInTransaction
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })

    // When a transaction claims it and then throws
    await expect(
      runInTransaction([fake.state as unknown as Record<string, unknown>], fake.client, async () => {
        await fake.client.householdInvite.updateMany({ where: CLAIM_WHERE, data: CLAIM_DATA })
        throw new Error('later step failed')
      }),
    ).rejects.toThrow('later step failed')

    // Then the invite is open again
    expect(fake.state.householdInvites[0]?.usedAt).toBeNull()
    expect(fake.state.householdInvites[0]?.usedById).toBeNull()
  })

  it('reset empties the invite store', async () => {
    // Given one invite
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })

    // When the fake is reset
    fake.reset()

    // Then no invite is left
    expect(fake.state.householdInvites).toHaveLength(0)
  })
})

describe('householdFake filters invites by householdRole (owner decision O15)', () => {
  it('a role value or { in } keeps only those invites, in findMany and updateMany', async () => {
    // Given a member invite and a manager invite in one household
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })
    await fake.client.householdInvite.create({
      data: inviteData({ id: 'inv_mgr', token: 't_mgr', householdRole: 'manager' }),
    })

    // When the member invites are listed, and both kinds by { in }
    const members = await fake.client.householdInvite.findMany({
      where: { householdId: OURS, householdRole: 'member' },
    })
    const both = await fake.client.householdInvite.findMany({
      where: { householdRole: { in: ['member', 'manager'] } },
    })
    // And a manager's revoke (member invites only) is aimed at the manager invite
    const revoked = await fake.client.householdInvite.updateMany({
      where: { id: 'inv_mgr', householdRole: 'member', revokedAt: null },
      data: { revokedAt: NOW },
    })

    // Then only the member invite is listed, both by { in }, and the revoke touches nothing
    expect(members.map((i) => i.id)).toEqual(['inv_1'])
    expect(both.map((i) => i.id).sort()).toEqual(['inv_1', 'inv_mgr'])
    expect(revoked).toEqual({ count: 0 })
    expect(fake.state.householdInvites.find((i) => i.id === 'inv_mgr')?.revokedAt).toBeNull()
  })

  it('a role outside the household enum throws', async () => {
    const fake = fixture()
    await expect(
      fake.client.householdInvite.findMany({ where: { householdRole: 'viewer' } }),
    ).rejects.toBeInstanceOf(InvalidRoleError)
  })
})

describe('householdFake applies select on invites (households H5b, review of G.3)', () => {
  // Before this, `select` was accepted and IGNORED, so a test got the token
  // back from a read that, in Prisma, would not return it.
  it('findUnique and findMany return only the selected columns', async () => {
    // Given one invite
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })

    // When it is read with a select that leaves out the token
    const one = await fake.client.householdInvite.findUnique({
      where: { token: 'token_1' },
      select: { householdId: true, expiresAt: true },
    })
    const many = await fake.client.householdInvite.findMany({
      where: { householdId: OURS },
      select: { id: true, token: false },
    })

    // Then only those keys come back, and `false` leaves a key out
    expect(one).toEqual({ householdId: OURS, expiresAt: LATER })
    expect(many).toEqual([{ id: 'inv_1' }])
  })

  it('create applies select too', async () => {
    const fake = fixture()
    const row = await fake.client.householdInvite.create({
      data: inviteData(),
      select: { id: true },
    })
    expect(row).toEqual({ id: 'inv_1' })
    // And the whole row is stored
    expect(fake.state.householdInvites[0]?.token).toBe('token_1')
  })

  it('a selected copy is a copy', async () => {
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })
    const one = await fake.client.householdInvite.findUnique({
      where: { id: 'inv_1' },
      select: { locationRoles: true },
    })
    ;(one?.locationRoles as unknown[]).push('changed')
    expect(fake.state.householdInvites[0]?.locationRoles).toEqual([
      { locationId: KITCHEN, role: 'viewer' },
    ])
  })

  it('throws on a select key it does not model, such as a relation', async () => {
    const fake = fixture()
    await fake.client.householdInvite.create({ data: inviteData() })
    await expect(
      fake.client.householdInvite.findMany({ select: { household: true } }),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
    await expect(
      fake.client.householdInvite.findUnique({ where: { id: 'inv_1' }, select: { nope: true } }),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
  })
})

describe('householdFake: household.deleteMany and the "is it empty" where (households H5b, decision T21)', () => {
  // OURS has two members (caller, second) and two locations. THEIRS has one
  // member (stranger) and one location, SHED. Each test puts ONE row into
  // `contents` and asks the empty check about THEIRS, so the answer depends
  // on that one key.
  function emptyContents(): HouseholdContents {
    return {
      items: [],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      shelves: [],
      itemStocks: [],
      inventoryLogs: [],
      carts: [],
      cartItems: [],
    }
  }

  function withContents(c: HouseholdContents) {
    return createHouseholdFake({
      households: [household(OURS, CALLER), household(THEIRS, STRANGER)],
      householdMembers: [
        member(OURS, CALLER, 'owner'),
        member(OURS, SECOND, 'manager'),
        member(THEIRS, STRANGER, 'owner'),
      ],
      locationMembers: [
        locMember(KITCHEN, CALLER, 'organizer'),
        locMember(SHED, STRANGER, 'organizer'),
      ],
      householdInvites: [],
      locations: () => LOCATIONS,
      contents: () => c,
    })
  }

  async function idsWhere(fake: ReturnType<typeof withContents>, where: Record<string, unknown>) {
    return (await fake.client.household.findMany({ where })).map((h) => h.id).sort()
  }

  it("members: { every: { userId } } is true only when that person is the only member", async () => {
    const fake = withContents(emptyContents())
    expect(await idsWhere(fake, { members: { every: { userId: STRANGER } } })).toEqual([THEIRS])
    expect(await idsWhere(fake, { members: { every: { userId: CALLER } } })).toEqual([])
  })

  for (const key of ['items', 'tags', 'tagTypes', 'vendors', 'recipes', 'shelves'] as const) {
    it(`${key}: { none: {} } is false for a household with one such row`, async () => {
      const c = emptyContents()
      c[key] = [{ householdId: THEIRS }]
      const fake = withContents(c)
      expect(await idsWhere(fake, { [key]: { none: {} } })).toEqual([OURS])
    })
  }

  it('locations.every.itemStocks none is false for a stock row at one of its locations', async () => {
    const c = emptyContents()
    c.itemStocks = [{ locationId: SHED }]
    const fake = withContents(c)
    expect(await idsWhere(fake, { locations: { every: { itemStocks: { none: {} } } } })).toEqual([
      OURS,
    ])
  })

  it('locations.every.inventoryLogs none is false for a log at one of its locations', async () => {
    const c = emptyContents()
    c.inventoryLogs = [{ locationId: SHED }]
    const fake = withContents(c)
    expect(
      await idsWhere(fake, { locations: { every: { inventoryLogs: { none: {} } } } }),
    ).toEqual([OURS])
  })

  it('locations.every.carts.every.items none: an empty cart passes, a cart with a row does not', async () => {
    const c = emptyContents()
    c.carts = [
      { id: 'cart-empty', locationId: KITCHEN },
      { id: 'cart-full', locationId: SHED },
    ]
    c.cartItems = [{ cartId: 'cart-full' }]
    const fake = withContents(c)
    const where = { locations: { every: { carts: { every: { items: { none: {} } } } } } }
    expect(await idsWhere(fake, where)).toEqual([OURS])
  })

  it('a household with no locations passes locations.every (Prisma: every of nothing is true)', async () => {
    const c = emptyContents()
    c.itemStocks = [{ locationId: SHED }]
    const fake = createHouseholdFake({
      households: [household(THEIRS, STRANGER)],
      householdMembers: [member(THEIRS, STRANGER, 'owner')],
      locations: () => [],
      contents: () => c,
    })
    expect(
      (await fake.client.household.findMany({
        where: { locations: { every: { itemStocks: { none: {} } } } },
      })).map((h) => h.id),
    ).toEqual([THEIRS])
  })

  it('throws on a shape it does not model, even on an EMPTY store', async () => {
    const empty = createHouseholdFake({ locations: () => [], contents: () => emptyContents() })
    const bad: Record<string, unknown>[] = [
      { items: { some: {} } },
      { items: { none: { name: 'x' } } },
      { members: { none: {} } },
      { locations: { some: {} } },
      { locations: { every: { members: { none: {} } } } },
      { locations: { every: { carts: { none: {} } } } },
      { locations: { every: { carts: { every: { lastPurchasedAt: null } } } } },
      { invites: { none: {} } },
    ]
    for (const where of bad) {
      await expect(empty.client.household.deleteMany({ where })).rejects.toBeInstanceOf(
        Error,
      )
      await expect(empty.client.household.findMany({ where })).rejects.toThrow(
        /does not model|models '/,
      )
    }
  })

  it('an "is it empty" key on a fake built with no contents throws, even on an EMPTY store', async () => {
    const fake = createHouseholdFake({ locations: () => [] })
    await expect(
      fake.client.household.deleteMany({ where: { items: { none: {} } } }),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
    await expect(
      fake.client.household.deleteMany({ where: { locations: { every: {} } } }),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
  })

  it('deleteMany deletes the matching households with their members, invites and location roles, and returns a count', async () => {
    const fake = withContents(emptyContents())
    fake.state.householdInvites.push({
      id: 'inv-theirs',
      householdId: THEIRS,
      token: 't',
      householdRole: 'member',
      locationRoles: [],
      createdById: STRANGER,
      createdAt: T0,
      expiresAt: T0,
      usedAt: null,
      usedById: null,
      revokedAt: null,
    })

    const result = await fake.client.household.deleteMany({
      where: { id: { in: [THEIRS] }, members: { every: { userId: STRANGER } } },
    })

    expect(result).toEqual({ count: 1 })
    expect(fake.state.households.map((h) => h.id)).toEqual([OURS])
    expect(fake.state.householdMembers.map((m) => m.householdId)).toEqual([OURS, OURS])
    expect(fake.state.householdInvites).toEqual([])
    expect(fake.state.locationMembers.map((m) => m.locationId)).toEqual([KITCHEN])
  })

  it('deleteMany that matches nothing changes nothing', async () => {
    const fake = withContents(emptyContents())
    const result = await fake.client.household.deleteMany({
      where: { id: { in: [OURS] }, members: { every: { userId: CALLER } } },
    })
    expect(result).toEqual({ count: 0 })
    expect(fake.state.households).toHaveLength(2)
    expect(fake.state.householdMembers).toHaveLength(3)
  })
})

describe('householdFake: household.updateMany (households H5b, task G.4)', () => {
  it('updates the matching households only, moves updatedAt, and returns a count', async () => {
    const fake = fixture()
    const result = await fake.client.household.updateMany({
      where: { id: OURS },
      data: { updatedAt: new Date('2026-11-18T00:00:00.000Z') },
    })
    expect(result).toEqual({ count: 1 })
    const [ours, theirs] = fake.state.households
    expect(ours?.updatedAt.getTime()).not.toBe(T0.getTime())
    expect(theirs?.updatedAt).toEqual(T0)
  })

  it('returns count 0, and throws nothing, when no row matches', async () => {
    const fake = fixture()
    await expect(
      fake.client.household.updateMany({ where: { id: 'nobody' }, data: { updatedAt: T0 } }),
    ).resolves.toEqual({ count: 0 })
  })

  it('throws on a where key it does not model, even on an EMPTY store', async () => {
    const fake = createHouseholdFake()
    await expect(
      fake.client.household.updateMany({ where: { name: 'x' }, data: { updatedAt: T0 } }),
    ).rejects.toBeInstanceOf(UnknownWhereKeyError)
  })
})

describe('householdFake applies distinct on locationMember.findMany (households H5c, task H.2)', () => {
  it('keeps one row per userId, and only rows the where matches', async () => {
    // Given the caller and SECOND on KITCHEN, the caller also on GARAGE, and
    // STRANGER on SHED
    const fake = fixture()
    await fake.client.locationMember.create({
      data: { locationId: GARAGE, userId: CALLER, role: 'viewer' },
    })

    // When the rows of OUR household are read with distinct userId
    const rows = await fake.client.locationMember.findMany({
      where: { location: { householdId: OURS } },
      distinct: ['userId'],
    })

    // Then the caller is there once, SECOND once, and STRANGER not at all
    expect(rows.map((r) => r.userId).sort()).toEqual([CALLER, SECOND])
    // And the caller's kept row is the first in store order (KITCHEN)
    expect(rows.find((r) => r.userId === CALLER)?.locationId).toBe(KITCHEN)
  })

  it('without distinct, every matching row comes back', async () => {
    // Given the caller on two locations of our household
    const fake = fixture()
    await fake.client.locationMember.create({
      data: { locationId: GARAGE, userId: CALLER, role: 'viewer' },
    })

    // When the rows are read with no distinct
    const rows = await fake.client.locationMember.findMany({
      where: { location: { householdId: OURS } },
    })

    // Then the caller's two rows are both there
    expect(rows.filter((r) => r.userId === CALLER)).toHaveLength(2)
  })

  it('accepts a single column name as a string', async () => {
    // Given the fixture
    const fake = fixture()

    // When distinct names one column as a string
    const rows = await fake.client.locationMember.findMany({ distinct: 'locationId' })

    // Then one row per location
    expect(rows.map((r) => r.locationId).sort()).toEqual([KITCHEN, SHED])
  })

  it('throws on a distinct key that is not a column', async () => {
    // Given the fixture
    const fake = fixture()

    // When distinct names a relation
    // Then it throws
    await expect(
      fake.client.locationMember.findMany({ distinct: ['location'] }),
    ).rejects.toThrow(HouseholdFakeUnsupportedError)
  })

  it('distinct still throws on the other models', async () => {
    // Given the fixture
    const fake = fixture()

    // When distinct is passed to householdMember.findMany
    // Then it throws as an unknown option
    await expect(
      fake.client.householdMember.findMany({ distinct: ['userId'] } as never),
    ).rejects.toThrow(/the option 'distinct'/)
  })
})

describe('householdFake models HouseholdActivity (households H6, task J.1, decision T46)', () => {
  const A = new Date('2026-11-20T10:00:00.000Z')
  const B = new Date('2026-11-20T11:00:00.000Z')
  const C = new Date('2026-11-20T12:00:00.000Z')

  /** One row of each household, plus two rows of ours with the SAME createdAt. */
  async function seeded() {
    const fake = fixture()
    const add = (id: string, householdId: string, createdAt: Date) =>
      fake.client.householdActivity.create({
        data: { id, householdId, actorId: CALLER, action: 'MEMBER_JOINED', createdAt },
      })
    await add('act_a', OURS, A)
    await add('act_b1', OURS, B)
    await add('act_b2', OURS, B)
    await add('act_c', OURS, C)
    await add('act_theirs', THEIRS, C)
    return fake
  }

  async function ids(fake: Awaited<ReturnType<typeof seeded>>, args: Record<string, unknown>) {
    return (await fake.client.householdActivity.findMany(args as never)).map((r) => r.id)
  }

  it('create fills the defaults and returns a copy', async () => {
    // Given the fixture
    const fake = fixture()

    // When a row is created with only the NOT NULL columns
    const row = await fake.client.householdActivity.create({
      data: { householdId: OURS, actorId: CALLER, action: 'HOUSEHOLD_CLEARED' },
    })

    // Then the defaults are filled in
    expect(row).toMatchObject({
      householdId: OURS,
      actorId: CALLER,
      action: 'HOUSEHOLD_CLEARED',
      targetUserId: null,
      locationId: null,
      details: null,
    })
    expect(typeof row.id).toBe('string')
    expect(row.createdAt).toBeInstanceOf(Date)
    // And the answer is a copy: changing it does not change the store
    row.actorId = 'changed'
    expect(fake.state.householdActivities[0]?.actorId).toBe(CALLER)
  })

  it('create stores details as a copy of the JSON it was given', async () => {
    const fake = fixture()
    const details = { locationName: 'Kitchen', from: 'viewer', to: 'participant' }
    await fake.client.householdActivity.create({
      data: { householdId: OURS, actorId: CALLER, action: 'LOCATION_ROLE_SET', details },
    })
    details.to = 'changed'
    expect(fake.state.householdActivities[0]?.details).toEqual({
      locationName: 'Kitchen',
      from: 'viewer',
      to: 'participant',
    })
  })

  it('create raises P2003 for a household this fake does not hold', async () => {
    const fake = fixture()
    await expect(
      fake.client.householdActivity.create({
        data: { householdId: 'household_gone', actorId: CALLER, action: 'MEMBER_LEFT' },
      }),
    ).rejects.toBeInstanceOf(HouseholdFakeForeignKeyError)
    expect(fake.state.householdActivities).toEqual([])
  })

  it('create raises P2002 on a taken id', async () => {
    const fake = await seeded()
    await expect(
      fake.client.householdActivity.create({
        data: { id: 'act_a', householdId: OURS, actorId: CALLER, action: 'MEMBER_LEFT' },
      }),
    ).rejects.toBeInstanceOf(HouseholdFakeUniqueError)
  })

  it.each(['householdId', 'actorId', 'action'])(
    'create throws when the NOT NULL column %s is missing',
    async (column) => {
      const fake = fixture()
      const data: Record<string, unknown> = {
        householdId: OURS,
        actorId: CALLER,
        action: 'MEMBER_LEFT',
      }
      delete data[column]
      await expect(
        fake.client.householdActivity.create({ data } as never),
      ).rejects.toBeInstanceOf(HouseholdFakeMissingColumnError)
      expect(fake.state.householdActivities).toEqual([])
    },
  )

  it('create throws on an action that is not in the ActivityAction enum', async () => {
    const fake = fixture()
    await expect(
      fake.client.householdActivity.create({
        data: { householdId: OURS, actorId: CALLER, action: 'NOT_AN_ACTION' } as never,
      }),
    ).rejects.toThrow(/ActivityAction/)
  })

  it('applies householdId as a value or { in: [...] }', async () => {
    const fake = await seeded()
    expect((await ids(fake, { where: { householdId: THEIRS } })).sort()).toEqual(['act_theirs'])
    expect(
      (await ids(fake, { where: { householdId: { in: [OURS] } } })).sort(),
    ).toEqual(['act_a', 'act_b1', 'act_b2', 'act_c'])
  })

  it('applies createdAt as a Date, { lt } and { lte }', async () => {
    const fake = await seeded()
    const ours = { householdId: OURS }
    expect((await ids(fake, { where: { ...ours, createdAt: B } })).sort()).toEqual([
      'act_b1',
      'act_b2',
    ])
    expect(await ids(fake, { where: { ...ours, createdAt: { lt: B } } })).toEqual(['act_a'])
    expect((await ids(fake, { where: { ...ours, createdAt: { lte: B } } })).sort()).toEqual([
      'act_a',
      'act_b1',
      'act_b2',
    ])
  })

  it('applies id as a value, { in } and { lt }', async () => {
    const fake = await seeded()
    expect(await ids(fake, { where: { id: 'act_c' } })).toEqual(['act_c'])
    expect((await ids(fake, { where: { id: { in: ['act_a', 'act_c'] } } })).sort()).toEqual([
      'act_a',
      'act_c',
    ])
    expect((await ids(fake, { where: { householdId: OURS, id: { lt: 'act_b2' } } })).sort()).toEqual([
      'act_a',
      'act_b1',
    ])
  })

  it('applies OR with the cursor shape of decision T54, and orders by createdAt then id, newest first', async () => {
    // Given the page "after act_b2", by (createdAt, id) descending
    const fake = await seeded()
    const where = {
      householdId: OURS,
      OR: [{ createdAt: { lt: B } }, { createdAt: B, id: { lt: 'act_b2' } }],
    }
    const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }]

    // Then act_b1 (same createdAt, smaller id) comes before act_a
    expect(await ids(fake, { where, orderBy })).toEqual(['act_b1', 'act_a'])
    // And without a where the whole household reads newest first, the tie
    // broken by id
    expect(await ids(fake, { where: { householdId: OURS }, orderBy })).toEqual([
      'act_c',
      'act_b2',
      'act_b1',
      'act_a',
    ])
    // And ascending order works too
    expect(
      await ids(fake, { where: { householdId: OURS }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ).toEqual(['act_a', 'act_b1', 'act_b2', 'act_c'])
  })

  it('applies take after the order', async () => {
    const fake = await seeded()
    expect(
      await ids(fake, {
        where: { householdId: OURS },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    ).toEqual(['act_c', 'act_b2'])
  })

  it('throws on a negative take and on an orderBy column it does not model', async () => {
    const fake = await seeded()
    await expect(ids(fake, { take: -1 })).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
    await expect(ids(fake, { orderBy: [{ action: 'desc' }] })).rejects.toBeInstanceOf(
      HouseholdFakeUnsupportedError,
    )
    await expect(ids(fake, { orderBy: [{ createdAt: 'down' }] })).rejects.toBeInstanceOf(
      HouseholdFakeUnsupportedError,
    )
  })

  it.each([
    ['actorId', { actorId: CALLER }],
    ['action', { action: 'MEMBER_JOINED' }],
    ['locationId', { locationId: KITCHEN }],
    ['a key inside OR', { OR: [{ actorId: CALLER }] }],
  ])('throws on the where key %s it does not model, even on an empty store', async (_, where) => {
    // An empty store never calls a per-row matcher, so the check must run
    // once per call.
    const fake = fixture()
    await expect(fake.client.householdActivity.findMany({ where } as never)).rejects.toBeInstanceOf(
      UnknownWhereKeyError,
    )
    await expect(fake.client.householdActivity.findFirst({ where } as never)).rejects.toBeInstanceOf(
      UnknownWhereKeyError,
    )
    await expect(fake.client.householdActivity.deleteMany({ where } as never)).rejects.toBeInstanceOf(
      UnknownWhereKeyError,
    )
  })

  it.each([
    ['createdAt: { gt }', { createdAt: { gt: A } }],
    ['createdAt as a string', { createdAt: '2026-11-20' }],
    ['id: { gt }', { id: { gt: 'act_a' } }],
    ['householdId: { not }', { householdId: { not: OURS } }],
  ])('throws on the filter shape %s it does not model', async (_, where) => {
    const fake = await seeded()
    await expect(fake.client.householdActivity.findMany({ where } as never)).rejects.toBeInstanceOf(
      UnsupportedWhereFilterError,
    )
  })

  it('findUnique needs exactly the id, and findFirst returns the first match in order', async () => {
    const fake = await seeded()
    expect((await fake.client.householdActivity.findUnique({ where: { id: 'act_b1' } }))?.id).toBe(
      'act_b1',
    )
    expect(await fake.client.householdActivity.findUnique({ where: { id: 'act_none' } })).toBeNull()
    await expect(
      fake.client.householdActivity.findUnique({ where: { householdId: OURS } } as never),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
    const first = await fake.client.householdActivity.findFirst({
      where: { householdId: OURS },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    expect(first?.id).toBe('act_c')
  })

  it('select returns only the columns set to true, and refuses a relation', async () => {
    const fake = await seeded()
    const row = await fake.client.householdActivity.findUnique({
      where: { id: 'act_a' },
      select: { id: true, householdId: true, createdAt: true },
    })
    expect(row).toEqual({ id: 'act_a', householdId: OURS, createdAt: A })
    await expect(
      fake.client.householdActivity.findMany({ select: { household: true } } as never),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
  })

  it('deleteMany deletes the matching rows only and returns a count', async () => {
    const fake = await seeded()
    expect(await fake.client.householdActivity.deleteMany({ where: { householdId: { in: [OURS] } } })).toEqual({
      count: 4,
    })
    expect(fake.state.householdActivities.map((r) => r.id)).toEqual(['act_theirs'])
  })

  it('household.deleteMany cascades to the household’s activity rows, and no others', async () => {
    // Given activity rows in both households, and the empty check's contents
    const fake = await seeded()
    const withContents = createHouseholdFake({
      households: fake.state.households,
      householdMembers: fake.state.householdMembers,
      locationMembers: fake.state.locationMembers,
      householdActivities: fake.state.householdActivities,
      locations: () => LOCATIONS,
    })

    // When THEIRS is deleted
    await withContents.client.household.deleteMany({ where: { id: THEIRS } })

    // Then its activity row is gone, as ON DELETE CASCADE does, and ours stay
    expect(withContents.state.householdActivities.map((r) => r.id).sort()).toEqual([
      'act_a',
      'act_b1',
      'act_b2',
      'act_c',
    ])
  })

  it('activities: { none: {} } on the household where is false for a household with a row', async () => {
    // A household that holds only log rows. Decision T49 says the join does
    // NOT ask this, but the key is modelled so a test can see it if it does.
    const fake = await seeded()
    const ids = (await fake.client.household.findMany({ where: { activities: { none: {} } } })).map(
      (h) => h.id,
    )
    expect(ids).toEqual([])
    fake.state.householdActivities = fake.state.householdActivities.filter((r) => r.householdId !== THEIRS)
    expect(
      (await fake.client.household.findMany({ where: { activities: { none: {} } } })).map((h) => h.id),
    ).toEqual([THEIRS])
  })

  it('rolls back with runInTransaction, because the rows live in `state`', async () => {
    const fake = await seeded()
    await expect(
      runInTransaction([fake.state as never], fake.client, async (tx: typeof fake.client) => {
        await tx.householdActivity.create({
          data: { householdId: OURS, actorId: CALLER, action: 'MEMBER_LEFT' },
        })
        throw new Error('later step')
      }),
    ).rejects.toThrow('later step')
    expect(fake.state.householdActivities).toHaveLength(5)
  })
})

describe('householdFake models OwnershipOffer (households H6b, task K.1, decision T58)', () => {
  /** One open transfer offer in ours (to SECOND), one handover offer in theirs (to CALLER). */
  async function seeded() {
    const fake = fixture()
    await fake.client.ownershipOffer.create({
      data: { id: 'offer_ours', householdId: OURS, toUserId: SECOND, fromUserId: CALLER, kind: 'transfer' },
    })
    await fake.client.ownershipOffer.create({
      data: { id: 'offer_theirs', householdId: THEIRS, toUserId: CALLER, kind: 'handover' },
    })
    return fake
  }

  async function ids(fake: Awaited<ReturnType<typeof seeded>>, where: Record<string, unknown>) {
    return (await fake.client.ownershipOffer.findMany({ where } as never)).map((r) => r.id).sort()
  }

  it('create fills the defaults and returns a copy', async () => {
    const fake = fixture()
    const row = await fake.client.ownershipOffer.create({
      data: { householdId: OURS, toUserId: SECOND, kind: 'transfer' },
    })
    expect(row).toMatchObject({
      householdId: OURS,
      toUserId: SECOND,
      fromUserId: null,
      kind: 'transfer',
      dismissedAt: null,
    })
    expect(typeof row.id).toBe('string')
    expect(row.createdAt).toBeInstanceOf(Date)
    row.toUserId = 'changed'
    expect(fake.state.ownershipOffers[0]?.toUserId).toBe(SECOND)
  })

  it('create raises P2002 on a second offer to the same person in the same household', async () => {
    // Given an offer to SECOND in ours
    const fake = await seeded()

    // When a second offer to SECOND in ours is created, of the OTHER kind
    const second = fake.client.ownershipOffer.create({
      data: { householdId: OURS, toUserId: SECOND, kind: 'handover' },
    })

    // Then the unique (householdId, toUserId) refuses it, and nothing is written
    await expect(second).rejects.toBeInstanceOf(HouseholdFakeUniqueError)
    await expect(second).rejects.toMatchObject({
      code: 'P2002',
      constraint: 'OwnershipOffer_householdId_toUserId_key',
    })
    expect(fake.state.ownershipOffers).toHaveLength(2)
  })

  it('the same person may have one offer in EACH household, and one household offers to several people', async () => {
    const fake = await seeded()
    // SECOND in theirs: another household, same person
    await fake.client.ownershipOffer.create({
      data: { householdId: THEIRS, toUserId: SECOND, kind: 'handover' },
    })
    // STRANGER in ours: same household, another person
    await fake.client.ownershipOffer.create({
      data: { householdId: OURS, toUserId: STRANGER, kind: 'handover' },
    })
    expect(fake.state.ownershipOffers).toHaveLength(4)
  })

  it('an update that moves an offer onto a taken (householdId, toUserId) raises P2002', async () => {
    const fake = await seeded()
    await fake.client.ownershipOffer.create({
      data: { id: 'offer_2', householdId: OURS, toUserId: STRANGER, kind: 'handover' },
    })
    await expect(
      fake.client.ownershipOffer.update({ where: { id: 'offer_2' }, data: { toUserId: SECOND } }),
    ).rejects.toMatchObject({ code: 'P2002' })
    expect(fake.state.ownershipOffers.find((o) => o.id === 'offer_2')?.toUserId).toBe(STRANGER)
  })

  it('create raises P2002 on a taken id', async () => {
    const fake = await seeded()
    await expect(
      fake.client.ownershipOffer.create({
        data: { id: 'offer_ours', householdId: THEIRS, toUserId: SECOND, kind: 'handover' },
      }),
    ).rejects.toMatchObject({ code: 'P2002', constraint: 'OwnershipOffer_pkey' })
  })

  it('create raises P2003 for a household this fake does not hold', async () => {
    const fake = fixture()
    await expect(
      fake.client.ownershipOffer.create({
        data: { householdId: 'household_gone', toUserId: SECOND, kind: 'transfer' },
      }),
    ).rejects.toBeInstanceOf(HouseholdFakeForeignKeyError)
    expect(fake.state.ownershipOffers).toEqual([])
  })

  it.each(['householdId', 'toUserId', 'kind'])(
    'create throws when the NOT NULL column %s is missing',
    async (column) => {
      const fake = fixture()
      const data: Record<string, unknown> = { householdId: OURS, toUserId: SECOND, kind: 'transfer' }
      delete data[column]
      await expect(fake.client.ownershipOffer.create({ data } as never)).rejects.toBeInstanceOf(
        HouseholdFakeMissingColumnError,
      )
      expect(fake.state.ownershipOffers).toEqual([])
    },
  )

  it('create throws on a kind that is not in the OfferKind enum', async () => {
    const fake = fixture()
    await expect(
      fake.client.ownershipOffer.create({
        data: { householdId: OURS, toUserId: SECOND, kind: 'owner' } as never,
      }),
    ).rejects.toThrow(/OfferKind/)
  })

  it('applies id, householdId and toUserId as a value or { in: [...] }', async () => {
    const fake = await seeded()
    expect(await ids(fake, { id: 'offer_ours' })).toEqual(['offer_ours'])
    expect(await ids(fake, { householdId: THEIRS })).toEqual(['offer_theirs'])
    expect(await ids(fake, { householdId: { in: [OURS, THEIRS] } })).toEqual([
      'offer_ours',
      'offer_theirs',
    ])
    expect(await ids(fake, { toUserId: CALLER })).toEqual(['offer_theirs'])
    expect(await ids(fake, { toUserId: { in: [SECOND] } })).toEqual(['offer_ours'])
    // Two keys together: both must pass
    expect(await ids(fake, { householdId: OURS, toUserId: CALLER })).toEqual([])
  })

  it('applies kind, and refuses a kind outside the enum in a where', async () => {
    const fake = await seeded()
    expect(await ids(fake, { kind: 'transfer' })).toEqual(['offer_ours'])
    expect(await ids(fake, { kind: { in: ['handover'] } })).toEqual(['offer_theirs'])
    await expect(ids(fake, { kind: 'owner' })).rejects.toThrow(/OfferKind/)
  })

  it('applies dismissedAt: null, and nothing else for dismissedAt', async () => {
    const fake = await seeded()
    await fake.client.ownershipOffer.update({
      where: { id: 'offer_theirs' },
      data: { dismissedAt: T0 },
    })
    expect(await ids(fake, { dismissedAt: null })).toEqual(['offer_ours'])
    await expect(ids(fake, { dismissedAt: { lt: T0 } })).rejects.toBeInstanceOf(
      UnsupportedWhereFilterError,
    )
  })

  it.each([
    ['fromUserId', CALLER],
    ['createdAt', T0],
    ['household', { ownerId: CALLER }],
    ['OR', [{ toUserId: SECOND }]],
  ])('throws on the where key %s, even on an empty store', async (key, value) => {
    // The empty store matters: a per-row check would never run here
    const fake = fixture()
    const where = { [key]: value }
    await expect(fake.client.ownershipOffer.findMany({ where } as never)).rejects.toBeInstanceOf(
      UnknownWhereKeyError,
    )
    await expect(fake.client.ownershipOffer.findFirst({ where } as never)).rejects.toBeInstanceOf(
      UnknownWhereKeyError,
    )
    await expect(fake.client.ownershipOffer.deleteMany({ where } as never)).rejects.toBeInstanceOf(
      UnknownWhereKeyError,
    )
    await expect(
      fake.client.ownershipOffer.updateMany({ where, data: { dismissedAt: T0 } } as never),
    ).rejects.toBeInstanceOf(UnknownWhereKeyError)
  })

  it('findUnique names exactly id, as a plain string', async () => {
    const fake = await seeded()
    expect((await fake.client.ownershipOffer.findUnique({ where: { id: 'offer_ours' } }))?.toUserId).toBe(
      SECOND,
    )
    expect(await fake.client.ownershipOffer.findUnique({ where: { id: 'offer_none' } })).toBeNull()
    await expect(
      fake.client.ownershipOffer.findUnique({ where: { householdId: OURS } } as never),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
    await expect(
      fake.client.ownershipOffer.findUnique({ where: { id: { in: ['offer_ours'] } } } as never),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
  })

  it('applies select on the columns, and refuses a relation', async () => {
    const fake = await seeded()
    const rows = await fake.client.ownershipOffer.findMany({
      where: { householdId: OURS },
      select: { id: true, kind: true },
    })
    expect(rows).toEqual([{ id: 'offer_ours', kind: 'transfer' }])
    await expect(
      fake.client.ownershipOffer.findMany({ select: { household: true } } as never),
    ).rejects.toBeInstanceOf(HouseholdFakeUnsupportedError)
  })

  it('update and delete act on one row by id and raise P2025 when none matches', async () => {
    const fake = await seeded()
    const updated = await fake.client.ownershipOffer.update({
      where: { id: 'offer_ours' },
      data: { dismissedAt: T0 },
    })
    expect(updated.dismissedAt).toEqual(T0)
    await expect(
      fake.client.ownershipOffer.update({ where: { id: 'offer_none' }, data: { dismissedAt: T0 } }),
    ).rejects.toMatchObject({ code: 'P2025' })
    const deleted = await fake.client.ownershipOffer.delete({ where: { id: 'offer_ours' } })
    expect(deleted.id).toBe('offer_ours')
    await expect(
      fake.client.ownershipOffer.delete({ where: { id: 'offer_ours' } }),
    ).rejects.toMatchObject({ code: 'P2025' })
    expect(fake.state.ownershipOffers.map((o) => o.id)).toEqual(['offer_theirs'])
  })

  it('updateMany and deleteMany return a count and never throw for no match', async () => {
    const fake = await seeded()
    expect(
      await fake.client.ownershipOffer.updateMany({
        where: { householdId: OURS, kind: 'transfer' },
        data: { dismissedAt: T0 },
      }),
    ).toEqual({ count: 1 })
    expect(await fake.client.ownershipOffer.deleteMany({ where: { toUserId: STRANGER } })).toEqual({
      count: 0,
    })
    expect(await fake.client.ownershipOffer.deleteMany({ where: { householdId: OURS } })).toEqual({
      count: 1,
    })
    expect(fake.state.ownershipOffers.map((o) => o.id)).toEqual(['offer_theirs'])
  })

  it('household.deleteMany deletes the offers of that household only (ON DELETE CASCADE)', async () => {
    const fake = await seeded()
    await fake.client.household.deleteMany({ where: { id: OURS } })
    expect(fake.state.ownershipOffers.map((o) => o.id)).toEqual(['offer_theirs'])
  })

  it('rolls back with runInTransaction, because the rows live in `state`', async () => {
    const fake = await seeded()
    await expect(
      runInTransaction([fake.state as never], fake.client, async (tx: typeof fake.client) => {
        await tx.ownershipOffer.create({
          data: { householdId: OURS, toUserId: STRANGER, kind: 'handover' },
        })
        throw new Error('later step')
      }),
    ).rejects.toThrow('later step')
    expect(fake.state.ownershipOffers).toHaveLength(2)
  })

  it('reset empties the store and seeds it from the options', async () => {
    const fake = await seeded()
    fake.reset()
    expect(fake.state.ownershipOffers).toEqual([])
  })
})
