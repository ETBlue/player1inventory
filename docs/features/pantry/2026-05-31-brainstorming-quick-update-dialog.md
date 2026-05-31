# Brainstorming: Quick Update Dialog

**Date:** 2026-05-31  
**Topic:** Make amount adjustment more convenient in the pantry page  
**Feature branch:** `feature/quick-update-dialog`

---

## Problem

For users who don't track item amounts daily, updating the pantry requires clicking the +/- buttons 4–10 times per item. Each click triggers an HTTP request, so the user must wait between clicks. This is slow and frustrating.

---

## Questions & Answers

**Q: What does pack/unpack do in the item info page?**  
A: Open a package — move quantity from `packedQuantity` → `unpackedQuantity`. Concretely: decrease `packedQuantity` by 1, increase `unpackedQuantity` by `amountPerPackage` (or 1 if no conversion rate is set).

**Q: For items with both packed and unpacked tracking, how should the dialog show amounts?**  
A: Two separate rows — one input row for packed quantity, one for unpacked. User edits them independently.

**Q: Should the progress bar update live as the user adjusts values in the dialog?**  
A: Yes — live preview. Progress bar updates in real-time as user types or clicks +/- inside the dialog.

**Q: How should dueDate (expiration) be handled when quantity changes via the dialog?**  
A: Due date should be updated by shopping/cooking flows only. Manual updates from the pantry quick-update dialog should NOT affect `dueDate`.

**Q: For "Fill to full stock" — what should this do for the packed/unpacked split?**  
A: Set `packedQuantity = targetQuantity`, `unpackedQuantity = 0`.

**Q: The "open a package" action — how much should it move?**  
A: One whole package: decrease `packedQuantity` by 1, increase `unpackedQuantity` by `amountPerPackage` (or 1 if no `amountPerPackage` set).

**Q: In the item card header, should the quick-update icon button fully replace both +/- buttons?**  
A: Yes — remove both +/- buttons; the single icon opens the dialog.

**Q: For single-unit items (no package/measurement split), should the dialog still show two rows?**  
A: Yes — always two rows (packed + unpacked) for a consistent layout.

---

## Final Decision

Replace the two +/- buttons in the pantry ItemCard header with a single icon button (e.g. pencil or edit icon). Clicking it opens a `QuickUpdateDialog` that:

1. Shows two editable rows: Packed quantity + Unpacked quantity (always two rows, regardless of unit type)
2. Each row has `-` / `+` steppers that step by `consumeAmount`
3. Quick-action buttons: Clear, Fill to Full, Open Package (last only when `packageUnit` is set)
4. Live progress bar preview
5. Cancel + Submit — Submit sends ONE HTTP request with only `{packedQuantity, unpackedQuantity}` — `dueDate` is never modified
