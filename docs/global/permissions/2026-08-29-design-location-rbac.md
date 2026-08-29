# Location RBAC — the permission model

**Date:** 2026-08-29
**Status:** 🔲 Decided, not implemented — no code depends on this yet
**Supersedes:** the global family group (already removed — see below)
**Immediate consumer:** [#273](https://github.com/ETBlue/player1inventory/issues/273)

## The decision

**Authorization binds to the `Location`.** A user's rights over a piece of data come from the
role they hold on the location that data belongs to — not from having created it.

| Role | Read | Edit |
|---|---|---|
| owner | ✅ | ✅ |
| member | ✅ | ✅ |
| viewer | ✅ | ❌ |

This replaces the original **family group**, a single *global* group per user that could not
express "different members per house." That model was deleted during the Locations work — the
`FamilyGroup` Prisma model, its resolvers, `Item.familyId`, and the settings card are all
gone (migration `20260612000000_remove_family_group`). The locations design anticipated its
successor: *"per-location membership is the cloud sharing model going forward"*
(`docs/features/locations/2026-06-11-locations-design.md:163`). This document names that
successor and fixes its role vocabulary.

## Why this is written down before it is built

Because the gap between "decided" and "built" is where the wrong guard gets written.

Today **every** cloud model is scoped by a flat `userId` string — `TagType`, `Tag`, `Vendor`,
`Item`, `Recipe`, `Cart`, `CartItem`, `InventoryLog`, `Shelf` (`apps/server/prisma/schema.prisma`).
There is no `Location` model on the server at all, no membership table, and no `User` model;
`ctx.userId` is a Clerk subject id and `requireAuth` (`apps/server/src/context.ts:7-13`)
returns it or throws `UNAUTHENTICATED`. Cloud `Location`/`ItemStock` is still unbuilt.

So an engineer adding an authorization check today has nothing to check *against* except
`userId`, and the obvious guard is:

```ts
// WRONG under location RBAC
const tag = await prisma.tag.findFirst({ where: { id, userId } })
```

That guard is not merely premature. It is **actively wrong in the direction the product is
moving**: it denies a legitimate `member` editing a shared location's data, which is the
entire point of the feature. It would pass review today and have to be torn out of every call
site later.

### The rule

> Never write `row.userId === ctx.userId` as an authorization check.
> Ask "does the caller hold a sufficient role on the relevant location?"

If a guard is genuinely needed before RBAC exists, put it behind a helper whose **signature is
already RBAC-shaped**, so landing RBAC changes one function body rather than every call site:

```ts
// Shape only — not an implementation proposal.
async function requireLocationRole(
  ctx: Context,
  locationId: string,
  role: 'viewer' | 'member' | 'owner',
): Promise<void>
```

Pre-RBAC, that body may legitimately be `userId` equality — the point is that the *call sites*
never say so.

## What is NOT decided

These are open, and this document deliberately does not answer them. Anyone implementing RBAC
should resolve them in a brainstorming session first.

1. **What governs entities that belong to no location?** `Tag`, `Vendor`, `Recipe` and `Shelf`
   are today deliberately **location-independent** — vendor and tag management is global by
   design, and the same vendor showing different counts on two pages is documented as expected,
   not a bug (`apps/web/src/routes/CLAUDE.md`). If rights derive from a location, what confers
   rights over a `Tag`? Candidates: they become location-owned; they stay user-owned with a
   separate rule; or they become readable by anyone sharing any location with the owner. This
   is the largest open question and it blocks #273's read-side half.
2. **Where the role lives.** Presumably a `LocationMember` join model with a role enum, but the
   schema is not designed.
3. **Owner vs. member.** Both edit. What is owner-*exclusive* — deleting the location,
   managing membership, transferring ownership? Undefined.
4. **Invite / join / leave.** Deferred from the Locations work
   (`docs/features/locations/2026-06-11-locations-design.md:168`) and still undesigned.
5. **What happens to data on removal** — when a member leaves or is removed, what becomes of
   the `InventoryLog` rows and `Cart` entries they created in that location.
6. **Local mode is out of scope.** Local-first mode is single-user IndexedDB with no auth at
   all; RBAC is a cloud-only concept. Nothing in `apps/web/src/db/` should grow a role check.

## Consequences to honour now

- **#273** (cloud item mutations accept tag/vendor ids with no authorization check across
  `createItem`, `updateItem`, `applyShelfFilterPicks`, and the three unscoped `itemCountBy*`
  queries) must be fixed against this model, not against `userId` equality. Its acceptance
  criteria already say so.
- Any new cloud resolver should route its scoping through a helper rather than inlining a
  `userId` filter, even while that helper is trivial.
- When cloud `Location`/`ItemStock` is finally built, it lands into *this* permission model.
  See `docs/features/locations/2026-06-11-locations-design.md` "Cloud TODOs" and the deferred
  requirements captured for that work.

## Sources

The role table and the "replaces the family group" framing come from ETBlue directly
(2026-08-29). Everything else here is either cited to a file above or explicitly marked open.
