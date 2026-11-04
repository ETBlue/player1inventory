import { describe, expect, it } from 'vitest'
import {
  createHouseholdFake,
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

    // When the nested filter uses `every`, or a key on location not modelled
    // Then both throw, and name the path to the key
    await expect(
      fake.client.household.findFirst({
        where: { id: 'nobody', members: { every: { userId: CALLER } } },
      }),
    ).rejects.toThrow(/'members\.every'/)
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
