# Brainstorming: Docs Folder Reorganization

Date: 2026-03-14

## Problem

The `docs/plans/` and `docs/brainstorming-logs/` folders had grown to 160+ and 16 files respectively — a flat list that made it impossible to find pending/unimplemented plans without scrolling through everything.

## Questions & Answers

**Q: What does "not yet implemented" mean?**
A: Plans where the feature doesn't exist in the codebase yet.

**Q: How do you browse these files?**
A: VS Code file explorer.

**Q: What's the primary friction?**
A: Too many files + can't tell implemented vs. pending at a glance.

**Q: Prefer folder-based or flat + index?**
A: By feature area. But needs a way to know status within that structure.

**Q: Should brainstorming logs follow the same organization?**
A: Yes.

**Q: What about docs/superpowers/?**
A: Merge into the main structure.

**Q: Global vs. non-global grouping?**
A: Yes — group into global (cross-cutting concerns) and features (page/domain-specific).

**Q: Merge plans and brainstorming logs?**
A: Yes — keep them in the same folder by topic.

## Decision

Single `docs/` tree with two top-level groupings:

```
docs/
  INDEX.md                 ← status dashboard
  global/                  ← cross-cutting concerns
    ai-sop/
    app-setup/
    backend/
    design-system/
    i18n/
    navigation/
    testing/
    ui-polish/
  features/                ← page/domain-specific
    cooking/
    items/
    pantry/
    settings/
    shopping/
    tags/
    vendors/
```

- Plans and brainstorming logs live together in the same feature folder
- Files are still distinguishable by name (`brainstorming` in log filenames, `design`/implementation suffix in plan filenames)
- `docs/INDEX.md` is a status table (✅ / 🔲 / 🔄 / ⚠️) — the answer to "what's pending"
- AI agent SOP updated: new docs go to `docs/global/<area>/` or `docs/features/<area>/`, and `INDEX.md` is updated when creating or completing plans
- `docs/superpowers/` absorbed into `docs/global/ai-sop/`

## Rationale

Feature folders solve the "too many files" problem by scoping search to the relevant area. The `INDEX.md` status dashboard solves "can't tell implemented vs. pending" without requiring a complex nested structure. Merging plans and brainstorming logs keeps all context for a topic in one place.
