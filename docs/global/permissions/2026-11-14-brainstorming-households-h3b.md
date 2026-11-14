# Brainstorming — households H3b, shared carts (2026-11-13 to 2026-11-14)

Part of the households work. Design: [2026-11-14-households-h3b-design.md](2026-11-14-households-h3b-design.md).
Outline: the H3 section of [2026-10-31-households-plan.md](2026-10-31-households-plan.md), and
decisions H7 and H8 in [2026-10-04-households-design.md](2026-10-04-households-design.md).

Branch `feature/households-h3b`, from `develop` at `0dfd536f` (after #376).

## Where H3b starts

- H3a (#375) made every location belong to a household and gave each person a location role.
  `Cart.id` is `${locationId}:${vendorId ?? 'no-vendor'}` and is a global primary key, so two
  members of one household already reach the **same** `Cart` row.
- But every cart read and write still filters cart items by `userId`. In a shared cart, each
  person would see only the rows they added. Nothing is shared before H5 (invites), so this
  gives the right answer today. H3b must merge before H5.
- The research for this phase (2026-11-13) found things the docs had missed:
  - There are **12** `CartItem.userId` filters left after H3a, not 15. H3a already changed the
    three in `purgeUserData`, `clearAllData` and `/e2e/cleanup`.
  - `deleteVendor` (`vendor.resolver.ts`) deletes only the caller's own carts for that vendor.
    A co-member's carts would stay behind with their items.
  - An import that names a shared cart is refused for the whole batch for a co-member, because
    `requireOwnRowOrUnclaimed` treats a cart as "yours" only when your `userId` is on it.
  - `consumeRecipes` loses an update when two people cook at once.
  - Local `addToCart` (`apps/web/src/db/operations.ts`) reads, then writes, outside a
    transaction.
  - Some web hook comments still say "member" where the code needs `participant`.

## Questions and answers

### Live updates (asked by the owner)

The owner asked: "when 1 user changes the cart, can another user see the cart updated in real
time?"

Answer: no. The server has no subscription endpoint and there is no polling. The web refetches
when a page mounts, after the user's own writes, and when the tab comes back after 30 s or more.

**Owner:** "1. for now: option A + refresh the cart for the user 2. I would like to have live
updates soon as it's a core functionality for household collaboration. can we add this feature
to our plan?"

So H3b refuses a checkout made from an out-of-date screen and then refetches the cart (see
Question 1). Live updates become a phase of their own.

### Question 2a — when to build live updates

Options: A, its own phase **H3c** after H3b and before H5; B, inside H3b; C, after H5.

**Owner:** "I prefer A - H3c. if the scope is too large, moving to after H5 is also acceptable"

### Question 2b — what is live at first

Options: A, carts only; B, carts and stock; C, everything shared.

**Owner:** "I prefer C - everything shared"

Recorded for the H3c brainstorming, not decided here:
- Transport: GraphQL subscriptions over WebSocket. The web already has the `GraphQLWsLink`
  split (`apps/web/src/apollo/client.ts`). Clerk sign-in token sent when the connection opens.
- An idea to look at: send "this changed" events and let the web refetch, instead of sending
  the data itself.
- Known limit: Neon's pooled connection does not support `LISTEN/NOTIFY`, so the first version
  passes events inside one server process. That works while Railway runs one instance.

### Question 1 — what a shared-cart checkout buys

| Option | The browser sends | When the cart changed first |
|---|---|---|
| **A** | the cart-item ids it showed, and the amount it showed for each | the whole checkout is refused, nothing is written |
| B | the ids only | it buys the current amounts of those rows |
| C | nothing | it buys whatever is in the cart now |

**Owner:** "option A + refresh the cart for the user".

Why: nobody buys something they did not see. With no live updates yet, the other person's
screen is often out of date, so this refusal is the only guard.

### Question 3 — two people add the same item at once

Options: A, one row whose amount is the sum (an atomic `upsert` with `increment`); B, one row
where the last write wins.

**Owner:** "A"

`CartItem.userId` stays the first person who added the item. Later adds do not change it.

### Question 4 — which location role may do what

My first recommendation was `organizer` for clearing a whole cart (`abandonCart`), because it
deletes rows other people added.

**Owner:** "afaik checkout also clears the whole cart. so looks like in option A participant
already has the privilige?"

I checked the code. Checkout deletes the rows it buys and keeps pinned rows (amount 0), and it
leaves stock changes and log rows behind. Clearing deletes every row and leaves no record. So
the two are not identical, but a participant can already empty a cart by checking out, or by
removing rows one at a time. An `organizer` rule on clearing would protect very little. I
changed my recommendation to B.

**Owner:** "yes, B"

| Action | Role |
|---|---|
| see the cart | `viewer` |
| add, change the amount, remove one row | `participant` |
| check out | `participant` |
| clear the whole cart | `participant` |

This is what the design already said, and what the code asks for today.

### Question 5 — cooking when two people cook at once

| Option | The browser sends | Two cooks, each uses 1 of 3 |
|---|---|---|
| **A** | how much each item used; the server subtracts it from the stored stock | stock ends at 1, correct |
| B | the final numbers and the numbers it saw; the server refuses if stock changed | the second cook must redo it |
| C | final numbers as today, in a transaction | stock ends at 2, wrong |

Plus: all-or-nothing in one transaction, instead of each item on its own.

**Owner:** "A, and yes to all-or-nothing"

`consumeItem`, `roundToStep` and `decimalPlaces` move from `apps/web/src/lib/quantityUtils.ts`
to `@p1i/types`.

### Question 6 — an import with two rows for one item in one cart

| Option | "milk ×2" and "milk ×1" in one cart |
|---|---|
| **A** | merge into "milk ×3". In `add` mode the amount adds to an existing cloud row; in `replace` mode it replaces it |
| B | keep the first row, skip the rest |
| C | refuse the whole import |

Plus, unless the owner objected: an update in `bulkUpsertCartItems` no longer moves a row to
another `cartId` or `itemId`.

**Owner:** "A. also, can we apply the no-duplication cart row rule to local mode?"

### Question 7 — local mode

Three parts were offered: (1) `addToCart` in one Dexie transaction, and the local import merges
duplicates; (2) a Dexie version that merges duplicates already stored; (3) a later Dexie
version that adds the unique index `&[cartId+itemId]`.

**Owner:** "all three for local mode"

The two Dexie versions must be separate. Dexie creates new indexes **before** it runs a
version's upgrade code, so a unique index in the same version as the merge would fail on a
database that still holds duplicates.

### Two defaults stated "unless you object"

The owner did not object, so both stand:

1. **Import ownership for `cart` and `cartItem` moves to location roles in H3b.**
   `requireOwnRowOrUnclaimed` answers "yours" when the caller has `participant` or higher on
   the cart's location. It must change for `cart` in H3b anyway, because `Cart.userId` is
   dropped. The rest of import (choosing the target household, #361) stays in H4.
2. **`deleteVendor` deletes that vendor's carts at every location of the household**, not only
   the caller's. Deleting a vendor already needs `manager`, and the vendor is gone for everyone.

### Question 8 — one migration or two

| Option | How |
|---|---|
| **A** | one migration: merge duplicates, add `@@unique([cartId, itemId])`, drop `Cart.userId` and its index |
| B | two migrations: the drop waits for the next checkpoint release |

**Owner:** "A"

Why: the data is tiny (production had 42 `Cart` and 7 `CartItem` rows in the 2026-11-12
rehearsal). The risk is a short window during the deploy where the old server writes
`Cart.userId` into a dropped column, so one cart-creating request fails. H3a had the same
window, and the checkpoint runbook deploys with auto-deploy off.

## Final decisions

See the design doc. In short:

1. Every cart read and write is scoped by the cart's location and the caller's location role,
   never by `CartItem.userId`. `Cart.userId` is dropped.
2. One row per item per cart, in the cloud and in local mode. Adds sum the amounts.
3. Checkout is all-or-nothing in one transaction. The browser sends the rows and amounts it
   showed; any difference refuses the whole checkout and the web refetches the cart. The server
   computes the log totals.
4. Cooking sends amounts used, and the server subtracts them, all-or-nothing in one transaction.
5. Imports merge duplicate cart rows. Import ownership of carts goes by location role.
6. `deleteVendor` removes that vendor's carts at every location of the household.
7. Live updates are a new phase, H3c, between H3b and H5, covering everything shared.
