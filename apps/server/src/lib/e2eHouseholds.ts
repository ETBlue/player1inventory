import type { HouseholdRole, LocationRole } from '@prisma/client'
import type { Request, Response } from 'express'
import { prisma } from './prisma.js'

// `POST /e2e/household-members`: put a second person into an existing
// household, with a household role and some location roles (households H3a,
// task 3.11, decision H9). Invites are H5, so until then this E2E-only route
// is the only way a cloud spec can have two people in one household, and so
// the only way to check roles against real Postgres.
//
// `index.ts` mounts it ONLY inside its `if (E2E_TEST_MODE)` block.
// `src/webhookRouteOrder.test.ts` guards that. It checks no signature and no
// session: whoever can reach it can add anybody to anybody's household. That
// is why it must never be mounted on a server that is not in E2E mode.
//
// ── THE BODY ──
//
//     { ownerUserId, memberUserId, householdRole, locations: [{ locationId, role }] }
//
// - `ownerUserId`: the person whose household it is. They must hold the
//   `owner` row of a household already, so they must have sent one GraphQL
//   request first (first sign-in makes the household, lib/household.ts).
// - `householdRole`: `manager` or `member`. **Never `owner`**: a household has
//   exactly one owner (decision H15, and a partial unique index refuses a
//   second one). Handing over ownership is H6.
// - `locations`: may be empty. Each location must belong to the owner's
//   household. A location id may appear once only.
//
// ── WHAT IT REFUSES, AND WHY ──
//
// | Refusal | Status | Why |
// |---|---|---|
// | a body of the wrong shape, an unknown role, `owner` | 400 | a typo must fail here, not as a Prisma enum error |
// | `memberUserId` equal to `ownerUserId` | 400 | the owner is a member already |
// | the owner has no household | 409 | nothing to join |
// | a location outside the owner's household | 400 | a location role must be in the same household as the household role (design, *Rules that cross the two levels*) |
// | the member is ALREADY in a household | 409 | see "ONE HOUSEHOLD PER PERSON" below |
//
// **A location role without a household role cannot be written here**
// (decision H18). `householdRole` is required, and the `HouseholdMember` row
// is written in the same transaction as the `LocationMember` rows, before
// them. So every location role this route writes has its household role
// beside it.
//
// ── ONE HOUSEHOLD PER PERSON ──
//
// `ensureHousehold` (lib/household.ts) finds a person's household with
// `householdMember.findFirst({ where: { userId } })`, with no `orderBy`. A
// person in two households would get one of the two, and which one is up to
// Postgres. Before H5 nobody can be in two households, and no code is built
// for it. So this route refuses a member who already has a household, for
// example one who sent a GraphQL request before being added (that request
// made their own household).
//
// To stop the member's first request from making a household of its own
// AFTER they were added, the route sets `User.householdSetupAt`, the first
// sign-in claim (decision H1). With the claim set, `ensureHousehold` reads
// the household this route put them in. The `User` row is created when it is
// missing, named by its id, the same name `ensureUser` falls back to.
//
// So a spec should add a member BEFORE that member sends any GraphQL request.
//
// ── NO isDefault ──
//
// This route creates no location. A member's first request makes no "Home"
// either, because they already have a household. So the member never gets an
// `isDefault` location, and the partial unique index
// "Location_one_default_per_user_key" (one default per `userId`) cannot
// refuse a later `clearAllData` they run. Task 3.14 drops that index.
//
// No route here ever logs the request body. A database error is logged by
// name and code only, the same as lib/e2eUsers.ts.

const ADDABLE_HOUSEHOLD_ROLES = ['manager', 'member'] as const satisfies readonly HouseholdRole[]
const LOCATION_ROLES = [
  'organizer',
  'participant',
  'viewer',
] as const satisfies readonly LocationRole[]

/** The body `POST /e2e/household-members` accepts. */
export type E2eHouseholdMemberBody = {
  ownerUserId: string
  memberUserId: string
  householdRole: (typeof ADDABLE_HOUSEHOLD_ROLES)[number]
  locations: { locationId: string; role: LocationRole }[]
}

export type ParsedMemberBody = { ok: true; value: E2eHouseholdMemberBody } | { ok: false; error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

/**
 * Check the body of `POST /e2e/household-members`. Returns the values, or the
 * reason the body is refused.
 */
export function parseHouseholdMemberBody(body: unknown): ParsedMemberBody {
  if (!isObject(body)) return { ok: false, error: 'The body must be a JSON object' }
  const { ownerUserId, memberUserId, householdRole, locations } = body
  if (!nonEmptyString(ownerUserId)) return { ok: false, error: 'ownerUserId must be a non-empty string' }
  if (!nonEmptyString(memberUserId)) {
    return { ok: false, error: 'memberUserId must be a non-empty string' }
  }
  if (memberUserId === ownerUserId) {
    return { ok: false, error: 'memberUserId must not be the owner' }
  }
  if (householdRole === 'owner') {
    return {
      ok: false,
      error: 'householdRole owner is refused: a household has one owner (hand-over is H6)',
    }
  }
  if (!ADDABLE_HOUSEHOLD_ROLES.includes(householdRole as never)) {
    return { ok: false, error: 'householdRole must be manager or member' }
  }
  if (!Array.isArray(locations)) return { ok: false, error: 'locations must be an array' }
  const parsed: E2eHouseholdMemberBody['locations'] = []
  for (const entry of locations) {
    if (!isObject(entry) || !nonEmptyString(entry.locationId)) {
      return { ok: false, error: 'each location must have a non-empty locationId' }
    }
    if (!LOCATION_ROLES.includes(entry.role as never)) {
      return { ok: false, error: 'each location role must be organizer, participant or viewer' }
    }
    if (parsed.some((p) => p.locationId === entry.locationId)) {
      return { ok: false, error: `location ${entry.locationId} is listed twice` }
    }
    parsed.push({ locationId: entry.locationId, role: entry.role as LocationRole })
  }
  return {
    ok: true,
    value: {
      ownerUserId,
      memberUserId,
      householdRole: householdRole as E2eHouseholdMemberBody['householdRole'],
      locations: parsed,
    },
  }
}

/** A refusal found inside the transaction. Thrown so the transaction rolls back. */
class Refusal extends Error {
  constructor(
    readonly status: 400 | 409,
    message: string,
  ) {
    super(message)
  }
}

/**
 * `POST /e2e/household-members`. Answers `{ ok: true, householdId }`. See the
 * comment at the top of this file for what it refuses.
 */
export async function e2eAddHouseholdMemberHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseHouseholdMemberBody(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const { ownerUserId, memberUserId, householdRole, locations } = parsed.value
  const now = new Date()

  let householdId: string
  try {
    householdId = await prisma.$transaction(async (tx) => {
      const ownerRow = await tx.householdMember.findFirst({
        where: { userId: ownerUserId, role: 'owner' },
        select: { householdId: true },
      })
      if (!ownerRow) {
        throw new Refusal(
          409,
          'The owner has no household. Send one GraphQL request as the owner first.',
        )
      }
      const target = ownerRow.householdId

      if (locations.length > 0) {
        const ids = locations.map((l) => l.locationId)
        const found = await tx.location.findMany({
          where: { id: { in: ids }, householdId: target },
          select: { id: true },
        })
        const foundIds = new Set(found.map((l) => l.id))
        const outside = ids.filter((id) => !foundIds.has(id))
        if (outside.length > 0) {
          throw new Refusal(400, `Not a location of the owner's household: ${outside.join(', ')}`)
        }
      }

      // The member's `User` row: the foreign key of both role tables needs
      // it. An existing row keeps its name.
      await tx.user.upsert({
        where: { id: memberUserId },
        create: { id: memberUserId, displayName: memberUserId },
        update: {},
      })
      // The first sign-in claim (decision H1), new row or old, if it is not
      // set yet. Then the member's first request reads this household and
      // makes no household of its own. The one place the claim is set.
      await tx.user.updateMany({
        where: { id: memberUserId, householdSetupAt: null },
        data: { householdSetupAt: now },
      })

      // Read AFTER the claim. A first sign-in that won the claim before us
      // has committed by now, so its household is visible here.
      const existing = await tx.householdMember.findFirst({
        where: { userId: memberUserId },
        select: { householdId: true },
      })
      if (existing) {
        throw new Refusal(
          409,
          'The member is already in a household. Add the member before they send any GraphQL request.',
        )
      }

      // The household role first, then the location roles (decision H18).
      await tx.householdMember.create({
        data: { householdId: target, userId: memberUserId, role: householdRole },
      })
      for (const { locationId, role } of locations) {
        await tx.locationMember.create({ data: { locationId, userId: memberUserId, role } })
      }
      return target
    })
  } catch (err) {
    if (err instanceof Refusal) {
      res.status(err.status).json({ error: err.message })
      return
    }
    const code = (err as { code?: unknown } | null)?.code
    console.error(
      'POST /e2e/household-members failed:',
      err instanceof Error ? err.name : 'unknown error',
      typeof code === 'string' ? code : '',
    )
    res.status(500).json({ error: 'Could not add the household member' })
    return
  }
  res.status(200).json({ ok: true, householdId })
}
