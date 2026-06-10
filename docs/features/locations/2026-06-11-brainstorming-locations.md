# Brainstorming — Location entity

**Date:** 2026-06-11
**Participants:** ETBlue, Claude
**Outcome:** Design doc `2026-06-11-locations-design.md`

## Problem

When managing home assets, a user may deal with **multiple houses** — the old home (a room in a parent's house), a self-owned house, a rented storage space, etc. Two needs follow:

1. **Per-location stock.** Item counts in different locations must be tracked separately.
2. **Per-location collaborators.** Different family members cowork on different houses (parents for the old home, spouse for the self-owned house). Houses relate to different members.

The existing **family sharing** feature is an alpha/draft (AI-implemented, untested, cloud-only) with a single *global* family group — it cannot express "different members per house." So a Location entity may **replace** family sharing as the unit of collaboration.

## Questions & answers

**Q: What does current family sharing do, and what's wrong with it?**
A: Not fully implemented — alpha/draft, planned & built by an AI agent, never tested by the user. Reworking/replacing it is fine.

**Q: Is an item global with per-location quantities, or independent per location?**
A: Item is defined **globally**, with **per-location stock status**.

**Q: Do you shop for a specific location or a combined view?**
A: Shop **for a specific location**.

**Q: Collaborators — managed at the location level?**
A: Managing family members **at the location level** is enough for now.

**Q: Single-location users — should the feature be invisible or visible?**
A: **Visible** — so users are aware of the multi-location feature, can try it, and share findings with friends.

**Q: Are tags/vendors/shelves location-scoped?**
A: **Global**, like items. (Planning system-wide item/vendor/tag catalogs for quick pickup later.) Shelves stay purely user-defined but **independent of location**. Location relates **only** to item stock status and users (family members).

**Q: Which fields are global vs. per-location?**
A:
- **Global:** name, tags, vendors.
- **Per-location:** `packedQuantity`, `unpackedQuantity`, `targetQuantity`, `refillThreshold`, units (`targetUnit`/`measurementUnit`/`packageUnit`), `amountPerPackage`, `consumeAmount`, **and all expiration fields** (`dueDate`, `estimatedDueDays`, `expirationThreshold`, `expirationMode`).

**Q: Does Location replace the global family group as the sharing unit?**
A: **Yes.**

**Q: Scope of this iteration?**
A: **Local first.** Document cloud TODOs.

**Q: Active-location context?** (revised mid-discussion)
A: **One global active location**, shared by **pantry, shopping, and cooking**, **persisted** across visits.

**Q: Does an item live in every location, or is membership explicit?**
A: **Explicit / opt-in** — items are not auto-added to all locations. Creating an item adds it to the **active location** only.

**Q: Cooking consumes from the active location?**
A: Yes — consume for the active location.

**Q: Members in this local iteration?**
A: **No member UI** in local mode (cloud-deferred). Default migrated location name: **"My Home"** (not "Home" — avoids confusion with the app's home page).

**Q: Pantry — all locations or scoped?** (resolved a contradiction)
A: Pantry is **scoped to the active location**. Only the **item-detail Stock tab** shows the all-locations view. Items not stocked in the active location **don't appear** in the pantry.

## Key decisions

1. **Data split.** Global `Item` keeps `id`/`name`/`tagIds`/`vendorIds`/timestamps. A new `ItemStock` record holds the full stocking profile per (item × location). New `Location` entity. `inventoryLogs` and shopping carts gain `locationId`.
2. **One global active location**, persisted. Shared switcher (icon trigger at the **left of the top toolbar**, showing the location name's **first letter**) on pantry/shopping/cooking. Dropdown lists locations + a **"Manage"** entry → Settings › Locations.
3. **Pantry, shopping, cooking are scoped** to the active location. Cooking consumes from it; shopping carts are per (location × vendor); creating an item stocks it in the active location.
4. **Pantry Add button** turns the item-name input into a **combobox** searching all items the user can access — pick an existing item (creates an empty stock record in the active location) or create a brand-new item (added to the active location immediately).
5. **Item detail — new "Stock" tab** (split out of today's combined settings tab). A **pager across all locations**: center dots under the toolbar (one per location), left/right chevrons to slide. Opens on the active location; the active location stays **visually marked** even while viewing others; the currently-viewed location's dot is highlighted. Per page: stocked → fields + **"Remove from location"**; not stocked → empty state + **"Add to location"** CTA.
6. **Settings › Locations** (new page): add / rename / delete / **reorder** (drag, like the shelf list). No member UI. Can't delete the **last** location; deleting **cascades** that location's stock records, carts, and logs.
7. **Adding an existing item to a new location** copies all stock fields from an existing stock record **except `packedQuantity` & `unpackedQuantity`** (which start at 0). Source: the active location's stock if present, else most-recently-updated.
8. **Migration:** fold all existing data into one auto-created location, **"My Home"**.

### Minor defaults (no objection raised)

- **Orphan items** (removed from their last location) survive as global Items and stay findable via the combobox to re-add elsewhere — not auto-deleted.
- **Existing alpha family-group UI** is hidden/removed from settings this iteration to avoid two competing "sharing" concepts; per-location members are documented as the cloud plan.
- **Desktop Stock tab** uses the same pager pattern (dots + chevrons) as mobile, wider.

## Deferred to cloud (TODO)

- Per-location **member lists** and invitations (replacing the global family group).
- System-wide **item / vendor / tag catalogs** for quick pickup (the combobox's "all items the user can access" source).
- Syncing per-location stock across collaborators.
