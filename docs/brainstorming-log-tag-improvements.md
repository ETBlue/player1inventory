# Brainstorming Log: Tag System Improvements

**Date:** 2026-02-03

## Initial Request

> in settings
> * move color from tag to tag type. all tags under the tag type share the same color
> * auto setup the text color based on the background color of a tag. when the background color is kind of dark, render text in white. when the background color is bright, render text in black
> * allow user to edit tag name
> * allow user to edit tag type name
> * when user deletes a tag or a tag type, use ui lib dialogs instead of browser native alert popup

## Q&A Session

### Q1: Data Migration
When we move color from Tag to TagType, existing tags in IndexedDB may have colors while their parent TagTypes don't. How should we handle this?

1. **First tag wins** - When a TagType has no color but its tags do, copy the first tag's color to the TagType (Recommended)
2. **Default color** - Assign a default color (e.g., #3b82f6 blue) to TagTypes that have no color
3. **No migration** - Existing tags keep their colors until user manually sets TagType color

**Answer:** 1

---

### Q2: Edit UX Pattern
For editing tag names and tag type names, which interaction pattern do you prefer?

1. **Inline edit** - Click on the name to turn it into an editable input field (Recommended)
2. **Edit dialog** - Click an edit icon to open a dialog with the name field
3. **Expandable row** - Click to expand the row/card showing edit fields below

**Answer:** 2

---

### Q3: Delete Confirmation Dialog
For the confirmation dialogs replacing browser confirm(), should we use a single reusable confirmation dialog component, or inline the dialog in each location?

1. **Reusable AlertDialog component** - Create a ConfirmDialog component (Recommended)
2. **Inline dialogs** - Add Dialog state and markup directly in the tags.tsx file

**Answer:** 1

---

### Q4: Text Color Contrast Algorithm
For auto-calculating text color (white vs black) based on background:

1. **Simple luminance threshold** - Use W3C relative luminance formula with 0.5 threshold (Recommended)
2. **WCAG contrast ratio** - Calculate actual contrast ratios for AA compliance

**Answer:** 1

---

### Design Section Approvals

- Section 1 (Data Model Changes): **yes**
- Section 2 (Text Color Utility): **yes**
- Section 3 (ConfirmDialog Component): **yes**
- Section 4 (Edit Dialogs): **yes**
- Section 5 (UI Layout): Revised based on feedback

---

### Additional Feedback on UI Layout

> move the "add tag" button to the tags section

Updated layout to place [+ Add] button inline with tag badges.

---

> for tags
> * show item count in the tag badge
> * when user clicks on the tag, open a dialog where user can either edit or delete the tag

Updated design:
- Tag badges show name and count: `Dairy (3)`
- Clicking badge opens Tag Detail Dialog with edit name, item count, and delete option

**Answer:** yes (approved revised design)

---

### Section 6 (Files to Change)

**Answer:** yes

---

## Final Design

Saved to: `docs/plans/2026-02-03-tag-system-improvements-design.md`
