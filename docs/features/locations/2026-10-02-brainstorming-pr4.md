# Brainstorming — cloud locations PR 4

**Date:** 2026-10-02
**Topic:** PR 4 of the cloud-locations series — import, export, post-login migration, purge
**Outcome:** PR 4 splits into **4a**, **4b** and **4c**. Seven decisions below.
**Design doc:** [cloud locations PR 4 design](2026-10-02-cloud-locations-pr4-design.md)
**Plan:** [PR 4a plan](2026-10-02-cloud-locations-plan-pr4a.md)

---

## Why this session happened

The 2026-08-30 design doc describes PR 4 in one section, §6, about 40 lines long. It names
four surfaces: cloud export, cloud import, post-login migration, and purge.

Before planning, the current code was measured. §6 turned out to be **right about the
shape and wrong about many details**, and five pieces of required work are not in it at
all. The measurements are in the design doc under *What §6 got wrong*.

Two findings changed the plan rather than just correcting it:

1. A **live cross-user data leak** in the cloud import path (decision 1).
2. The proposed "additive first" split **does not work** the way it was first drawn
   (decision 5).

---

## Decision 1 — the cart id leak is proved first, then fixed inside PR 4

**Question:** cloud import strips the location prefix off cart ids, so cloud cart rows can
collide between users. Where should this be fixed?

**Answer:** Prove it with a test first. Then fix it inside PR 4b.

**What was found.** Six steps, all read from the code:

| Step | File:line | What happens |
|---|---|---|
| Local cart ids are composite | `apps/web/src/db/operations.ts:720` | `${locationId}:${vendorId\|'no-vendor'}` |
| Import strips the prefix | `apps/web/src/lib/importData.ts:403-413` | `id.slice(prefix.length)` → bare `no-vendor` |
| The mapper passes it through | `apps/web/src/lib/importData.ts:645-654` | `id: cart.id` verbatim |
| The server trusts it | `apps/server/src/resolvers/import.resolver.ts:256` | `prisma.cart.create({ data: { id, … } })` |
| `Cart.id` is a global primary key | `apps/server/prisma/schema.prisma` | `id String @id`, no compound key with `userId` |
| Cart items are looked up with no user scope | `apps/server/src/resolvers/import.resolver.ts:277` | `findUnique({ where: { id: cartId } })` |

So if user A has imported a local backup, user B importing theirs finds **A's** cart row,
hits `continue`, and B's cart items are created pointing at A's cart.

This is the same `'no-vendor'` cross-user leak that PR 3b fixed in the resolvers. The
re-key fixed the resolvers. The import path still strips.

The stripping comment at `importData.ts:402` says the prefix "would collide with it on the
un-prefixed cloud id". That was true before PR 3b, when cloud cart ids had no prefix. After
PR 3b it is the cause rather than the cure.

**Why prove it first.** The reading is consistent, but reading is not proof. Root
`CLAUDE.md` says explanatory comments are claims, not facts, and the same applies to a
six-step trace. The test comes first, must go **red on `main`**, and then becomes the
regression guard.

**Why not a separate fix PR.** The fix is not a patch. Once import carries real locations,
cart ids stay composite and the strip is **deleted**, not corrected. A standalone fix would
write a re-prefixing patch that PR 4b then deletes.

**Status: unproved.** Nothing in this repo has run two users through a cloud import. The
test in 4b is what settles it. If it passes on `main`, this whole decision is wrong and the
trace has a mistake in it.

---

## Decision 2 — issue #320 gets the real-SQL test with two users

**Question:** 11 of 14 models in the two production purge paths have no `where`-clause
assertion. Which guard should PR 4 build?

**Answer:** Option 3 from the issue — a cloud E2E spec with two users.

**Why.** It is the only option that catches an **over-broad** filter, one that deletes other
people's data. The two cheaper options only catch a filter that deletes too little.

| Option | Catches too-narrow | Catches too-broad |
|---|---|---|
| 1 — add 22 `toHaveBeenCalledWith` assertions | yes, if the assertion is right | no |
| 2 — `purge-coverage.test.ts` reads the `where` text | yes | no |
| 3 — real SQL, two users | yes | **yes** |

`purgeUserData` is the user-facing "delete my data" action. An over-broad filter there
deletes a stranger's pantry. That risk is worth a real database.

**What the survey corrected in the issue.** The `where` clauses are **not** completely
unguarded. Three of them are asserted, in two files:

| File | Models asserted |
|---|---|
| `apps/server/src/resolvers/purge.resolver.test.ts:121-127` | `shelf`, `location`, `itemStock` |
| `apps/server/src/resolvers/import.resolver.test.ts:504-517` | the same three, for `clearAllData` |

`purge.resolver.test.ts:135-140` also checks the delete **order** through
`mock.invocationCallOrder`. So the issue's "11 of 14 have no filter assertion" is correct,
but "nobody has checked them" is too strong.

`purge-coverage.test.ts` checks **10** models, not 14 — only those carrying a `userId`
column. It excludes `ItemTag`, `ItemVendor`, `RecipeItem` and `ItemStock` on purpose, and
says so at `purge-coverage.test.ts:21-28`.

---

## Decision 3 — cloud export gets a whole-account stock query

**Question:** cloud export needs every location's stock, but `itemStocks(locationId: ID!)`
requires a location. Which way?

**Answer:** add one new server field that returns every `ItemStock` the caller can reach.

```graphql
type Query {
  itemStocks(locationId: ID!): [ItemStock!]!
  allItemStocks: [ItemStock!]!          # new
}
```

Scoped `{ location: { userId } }` — the same shape `purgeUserData` already uses
(`purge.resolver.ts:39`), and the shape location RBAC needs. No `userId` column is added
to `ItemStock`.

**Why not one query per location.** `fetchCloudPayload` runs nine queries in a single
`Promise.all` (`exportData.ts:178-198`). Fanning out per location breaks that into two
rounds and costs one request per location. The new field also gives PR 4's own E2E tests a
cheap way to read all stock back.

---

## Decision 4 — `ItemInput` keeps its five state fields until PR 5

**Question:** design §6 says PR 4 drops the five `Item` state fields from `ItemInput`
(`import.graphql:11-16`). When?

**Answer:** PR 4b stops **sending** them. PR 5 removes them from the input.

**Why.** Dropping a field from a GraphQL input is a breaking contract change. A browser
running a cached bundle would send the old fields and get a validation error — and it would
get it **after `clearAllData` has already run**, so the account is empty and the import has
failed. That failure window is the whole reason PRs 1 to 3 were staged additive-first.

PR 5 is already the contract step for these same five fields: it drops the columns, the
`Item` type fields and the inputs together. One place, one deploy.

**Cost:** the five fields sit unread for one PR. That is what additive-first costs
everywhere else in this series too.

---

## Decision 5 — the split, after a correction

**First answer (wrong):** 4a = the additive server surface **plus** lossless cloud export;
4b = the import rewrite; 4c = migration and purge.

**The correction.** Making cloud export lossless is **not** additive on the web side. It
changes the payload shape, and two import readers use the old shape as a signal.

| What the export change does | What breaks | Evidence |
|---|---|---|
| Cloud export starts carrying `itemStocks` | `flattenPayloadForCloud` treats "no `itemStocks`" as "this payload is already flat, pass it through". A cloud → cloud import would start going through the flatten path: collapsed onto one location, cart prefixes stripped. | `importData.ts:359-365`, whose own comment says "A payload with no `itemStocks` is already flat (cloud export, or a pre-v15 backup)" |
| Cloud export starts carrying `locations` | `deserializeLocation` derives `isDefault` from `raw.id === 'local'`. A cloud backup's ids are cuids, so no imported location is flagged, and `ensureDefaultLocationRow()` adds a stray empty "local" default beside them. | `importData.ts:136-143`, then `importData.ts:1121` |

So the export change and the import change must land in the same PR.

**Final answer:**

| PR | Contents | Why it stands alone |
|---|---|---|
| **4a** | The GraphQL surface only — `allItemStocks`, `InventoryLog.locationId` on the type, `InventoryLogInput.locationId`, `LocationInput`, `ItemStockImportInput`, and four bulk mutations. **No web change.** | Nothing calls any of it. ~~Zero behaviour change, safe to deploy alone.~~ **See the note below — this half was wrong.** |
| **4b** | The payload shape and **both** readers, in one diff. | The export change breaks the import readers, as measured above. |
| **4c** | Issue #320's two-user purge spec. | Touches none of the above. Could land first. |

**"Zero behaviour change" was wrong, and the E2E gate caught it.** Task 4 made an imported
cart take its location from its own id and check it through `requireLocationRole`. **A
server authorization check is a behaviour change even when no client calls the new
surface** — and the composite cart path was already live, because a cloud export carries no
`itemStocks`, so `flattenPayloadForCloud` returns early and cart ids keep their prefix.

A cloud → cloud restore calls `clearAllData` first, which deletes the very `Location` rows
the payload's cart ids name. Nothing uploads the payload's locations until 4b, so the check
refused and the restore died with *"Import failed during Forbidden."* — **after** the
account had been cleared. That is data loss, and it existed only on the unpushed branch.

Fixed in task 8, by the user's decision: fall back to the caller's default when **no row
holds** the named id, and refuse only when a row holds it and belongs to someone else. So
4a is behaviour-neutral for a deleted or unknown location, and still refuses a stranger's
live one — a deliberate behaviour change, stated rather than hidden. The full write-up is in
the design doc under *4a is NOT behaviour-neutral*.

No unit test could have found this. Every server test runs against a fake, and no fake
models "`clearAllData` ran, then a cart arrives naming a row that no longer exists."

**Note on 4c's order.** 4c builds a two-user cloud E2E fixture. 4b's cart-collision test
needs the same fixture. Doing 4c first means building it once. This was offered and not
chosen, so 4a goes first and 4b builds its own fixture — recorded so the duplication is a
known cost rather than a surprise.

---

## Decision 6 — the post-login migration gate keeps only its locations check

**Question:** `usePostLoginMigration`'s `locationResolved` gate
(`usePostLoginMigration.ts:51-54`) validates an id that is no longer the one being copied.
What should it become?

**Answer:** keep the "locations have loaded" half. Delete the rest, and delete the stored id
with it.

```ts
// before
const migrationLocationId = readStoredLocationId('local')
const locationResolved =
  locations !== undefined &&
  (activeLocationId === DEFAULT_LOCATION_ID ||
    locations.some((loc) => loc.id === activeLocationId))

// after
// The remap maps the payload's default location onto THIS account's
// isDefault row, so the copy cannot start until the destination's
// locations are known.
const locationsLoaded = locations !== undefined
```

**Why.** Once the import is faithful there is no single "copy location", so
`migrationLocationId` and the `DEFAULT_LOCATION_ID` branch have no subject left. But the
remap needs the destination's `isDefault` row, so waiting for `locations` is still
required — now for a real reason instead of a stale one.

**What the survey corrected.** Design §6 says the hook "loses the
`{ locationId: activeLocationId }` option". Two things are wrong there. The hook takes no
options at all; it **passes** `{ locationId }` down to `importCloudData` at
`usePostLoginMigration.ts:82-84` and `:125-127`. And the value is not `activeLocationId` —
it is `readStoredLocationId('local')` (`usePostLoginMigration.ts:38`), the local storage
slot.

The code already knew the design doc had gone stale. `usePostLoginMigration.ts:45-50` says
the gate no longer validates the id being copied, and leaves the decision to PR 4 on
purpose rather than guessing.

> **Correction, 2026-10-03.** The decision stands; **the reason recorded for it does not.**
> This entry said the remap needs the destination's locations, so the copy must wait for
> them. It does not — `importCloudData` reads the destination's default itself
> (`fetchCloudDefaultLocationId`, `importData.ts:526-534`), on every strategy. The gate feeds
> the remap nothing.
>
> The rejection note below ("`autoImportStarted` alone would let the copy start before
> `GetLocations` resolves, so the remap would map the payload's default onto nothing") rests
> on the same false premise and is wrong for the same reason.
>
> The gate is kept for **ordering**: the copy is one-shot and destructive, and on `clear` it
> deletes every `Location` row before the remap re-reads them, so it must not start while the
> hook's own `GetLocations` is in flight. Found by 4b task 7, which refused to write the
> dictated comment.

**Rejected:** reading Dexie's `locations` table to validate the local slot. It puts an
IndexedDB read inside a hook mounted in `__root.tsx:97`, so it would run for every signed-in
page view — and after 4b there is no single id left to validate.

**Rejected:** deleting the gate entirely. `autoImportStarted` alone would let the copy start
before `GetLocations` resolves, so the remap would map the payload's default onto nothing.
Silent, and only on a slow network.

---

## Decision 7 — one remap rule, both directions

**Question:** `deserializeLocation` ignores what the file says and derives `isDefault` from
`id === 'local'`. Once cloud backups carry locations, what should the local import side do?

**Answer:** apply the same remap rule in both directions.

> **Preserve payload location ids verbatim, except the payload's default, which maps onto
> the destination's default.**

| Direction | The default maps to |
|---|---|
| local → cloud | the destination account's `isDefault` location |
| cloud → local | `DEFAULT_LOCATION_ID` (`'local'`) |

**Why.** A cloud → local → cloud round trip then preserves every id, so carts still upsert
by their composite id — which is what the composite `Cart.id` was for. And no stray default
row is ever created in either direction.

**Rejected:** honouring the payload's `isDefault` flag. It is simpler, but local mode would
then hold a default whose id is not `'local'`, and `ensureDefaultLocationRow` would have to
change so it does not add a second one. Design §3 claims nothing branches on
`DEFAULT_LOCATION_ID` any more. That claim is **not measured** — there are 302 non-comment
references across 41 files — and this option would depend on it being true.

---

## Decision 8 — the migration warning dialog is deleted

**Question:** after 4b the local → cloud copy keeps every location, so
`MigrationLocationWarningDialog`'s warning becomes untrue. What happens to it?

**Answer:** delete it in 4b.

The component's own comment already says this is coming
(`MigrationLocationWarningDialog.tsx:23-37`): the warning exists because the cloud import
surface is flat, "and PR 4 is what gives it `LocationInput`/`ItemStockInput`".

Deleted in 4b:

- `apps/web/src/components/shared/MigrationLocationWarningDialog/` — 4 files
- 4 i18n keys, in both languages: `settings.migrationLocationWarning.title`,
  `.description`, `.leftBehind`, `.continue`
- the `otherLocationNames` wiring at `DataModeCard.tsx:447` and
  `PostLoginMigrationDialog.tsx:125`

**What the user gets:** signing in no longer silently throws away every location's stock
except one. That is PR 4b's user-visible gain.

**Rejected:** replacing it with a plain copy confirmation ("Copy 3 locations and 47 items?").
It would need new i18n keys in both languages and a count computed before the copy starts.
The copy is still reachable only from an explicit action in `DataModeCard`, so a second
confirmation adds a step without adding information.

---

## Decision 9 — what gets written before any code

**Answer:** this log, a design doc covering 4a, 4b and 4c, and an implementation plan for
**4a only**. 4b's plan is written after 4a merges. 4c's plan is written when 4c is
scheduled.

**Why not plan all three now.** A plan written against code that two earlier PRs have not
changed yet carries predicted line numbers, not measured ones. This repo has the receipts:
PR 2's plan named **three** `stockDualWrite` call sites and implementation found **five**
(today's survey found **six** calls and **seven** markers). Today's survey also found **8**
stale claims in the 2026-08-30 design doc. Root `CLAUDE.md` now carries the rule this
produced: *measure your own baseline, never subtract a count written in a doc or a brief.*

---

## Still open, on purpose

| Question | Why it is not answered here |
|---|---|
| Does the cart leak actually reproduce? | 4b's first task is the test. If it passes on `main`, decision 1 is wrong. |
| Does anything still branch on `DEFAULT_LOCATION_ID`? | 302 non-comment references across 41 files. Decision 7 was chosen so this does **not** have to be answered. It still has to be answered before PR 5. |
| PR 3b's migrated-data check | Still owed, and not PR 4's. Nothing has run the new server code against rows the re-key migration converted. |
