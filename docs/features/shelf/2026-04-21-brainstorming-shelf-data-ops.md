---
title: Brainstorming — Shelf in Data Operations
date: 2026-04-21
area: shelf
type: brainstorming
---

## Topic

Include the `shelf` entity in import, export, reset data, and cloud/local mode switch.

## Questions & Answers

**Q1: Conflict detection in import — what uniqueness rule for shelves?**
A: ID only. Two shelves with the same name but different IDs are treated as different entities.

**Q2: Reset scope — should shelves be wiped on full reset (import with `clear` strategy)?**
A: Yes, clear everything including shelves.

**Q3: Cloud purge — should `purgeUserData` delete shelves?**
A: Yes, delete shelves on purge.

**Q4: Mode switch — should shelves be included when copying data?**
A: Yes. When there are existing shelves in the destination, follow the user's chosen data policy (skip/replace/clear), same as other named entities.

**Q5: System shelves — exclude from data ops?**
A: Yes. Shelves with `type === 'system'` are excluded from export, import, and reset. They are auto-created by the app and should not be in backups.

## Final Decision

- **Export**: Include non-system shelves (`type !== 'system'`) in the export payload.
- **Import**: Handle shelves with ID-only conflict detection; `clear` strategy wipes and restores shelves.
- **Cloud purge**: Add shelves to the `purgeUserData` deletion sequence.
- **Mode switch**: Shelves are automatically included via the shared export/import pipeline; user's strategy choice applies.
- **System shelves**: Always excluded from all data operations.
