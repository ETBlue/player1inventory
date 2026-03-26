# Deferred: Post-Login Migration (IndexedDB → MongoDB)

**Status:** 🔲 Deferred — not started
**Deferred from:** Phase A (nested tags / onboarding)
**Date logged:** 2026-03-27

---

## What is this?

When a user signs in for the first time (or re-authenticates) on a device that has existing local data, that data needs to be synced from IndexedDB (local/offline) to MongoDB (cloud).

This is distinct from the existing import/export feature — it is an automatic, transparent sync that runs on login.

---

## Why it was deferred

At the time of Phase A, no post-login migration pipeline existed. Implementing it from scratch was out of scope for the onboarding feature. Instead, `parentId` is carried in JSON import/export only.

---

## What needs to be done

When implemented, this pipeline must carry **all entity fields**, including:

- `parentId` on `Tag` (introduced in Phase A / nested tags)
- Any other fields added since the last sync

### Minimum requirements

1. Detect first login / device with unsynchronised local data
2. Read all local Dexie tables (items, tags, vendors, recipes, inventory logs, etc.)
3. Write each record to MongoDB via GraphQL mutations, preserving all fields including `parentId`
4. Handle conflicts (e.g. same entity already exists in cloud)
5. Mark local data as synced to avoid duplicate uploads

### Field checklist (update as new fields are added)

- [ ] `Tag.parentId` — added in Phase A

---

## Related docs

- `docs/features/onboarding/2026-03-26-brainstorming-nested-tags-cloud-mode.md` — where the deferral decision was made
- `docs/global/backend/2026-03-12-dual-mode-design.md` — dual-mode architecture overview
