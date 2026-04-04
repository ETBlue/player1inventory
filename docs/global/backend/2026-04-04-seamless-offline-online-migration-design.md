# Seamless Offline ↔ Online Migration

## Overview

Two-way data synchronization between local IndexedDB (offline/local mode) and MongoDB (cloud/online mode), with a conflict-resolution UI when local and cloud data diverge.

This extends the existing post-login migration stub (`docs/global/backend/2026-03-27-post-login-migration.md`) with the full design including the reverse direction (cloud → local) and conflict resolution.

## Motivation

Users may start in offline mode, accumulate data, then log in. Or they may be logged in and go offline for a while before syncing. Both directions need to be handled gracefully, with user control when conflicts arise.

## Scope

### Direction A: Local → Cloud (on login / first sync)
- After login, detect that local IndexedDB has data not present in MongoDB
- Offer to upload local data to cloud
- Handle conflicts: items/tags/vendors/recipes that exist in both with different values

### Direction B: Cloud → Local (on logout / offline)
- When user loses connectivity or logs out, pull latest cloud state to IndexedDB
- Handle conflicts: local edits made while temporarily offline

### Conflict Resolution UI
- Show a diff-style view of conflicting records
- User chooses: keep local / keep cloud / keep both (for items/tags where duplicates make sense)
- Batch resolution option ("apply to all remaining conflicts")

## Key Design Decisions (from brainstorming)

- **Both directions:** offline → cloud and cloud → offline are both supported
- **Conflict UI required:** automatic silent merge is not acceptable; user must see and resolve conflicts
- **Extends, does not replace:** the existing data import/export feature in Settings remains; this is a separate automated sync flow

## Relation to Existing Work

- `docs/global/backend/2026-03-27-post-login-migration.md` — post-login IndexedDB→MongoDB migration (Direction A only, no conflict UI) — this doc supersedes/extends that stub
- Settings > Data Import/Export — manual migration; remains as power-user escape hatch

## Open Questions

- What is the trigger for Direction B? Logout button? Network loss detection? Manual "sync now"?
- Conflict detection strategy: timestamp-based (`updatedAt`)? Hash-based? Full diff?
- What entities need conflict resolution: all (items, tags, vendors, recipes, cart)? Or a subset?
- Should the conflict UI be a modal, a dedicated route, or an inline banner?
- What happens to inventory logs during migration — merge, deduplicate, or ignore?

## Status

🔲 Pending — no implementation plan yet
