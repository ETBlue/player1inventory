# Button Color Variants Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend Button component with 20 color variants (solid + tint) to enable colored tag type filter triggers.

**Architecture:** Add color variants to existing Button CVA definition following the established pattern of bg/border/text utilities with shadows. Update TagTypeDropdown to use tagType.color when filters are selected. Add Storybook story to showcase new variants.

**Tech Stack:** React, TypeScript, Tailwind CSS v4, CVA (class-variance-authority), Storybook

---

## Task 1: Add Color Variants to Button Component

**Files:**
- Modify: `src/components/ui/button.tsx:16-37`

**Step 1: Add solid color variants to buttonVariants**

In `src/components/ui/button.tsx`, add the following variants after line 36 (after the neutral variants):

```tsx
        red: `border-transparent bg-red text-tint shadow-sm hover:shadow-md`,
        orange: `border-transparent bg-orange text-tint shadow-sm hover:shadow-md`,
        amber: `border-transparent bg-amber text-tint shadow-sm hover:shadow-md`,
        yellow: `border-transparent bg-yellow text-tint shadow-sm hover:shadow-md`,
        green: `border-transparent bg-green text-tint shadow-sm hover:shadow-md`,
        teal: `border-transparent bg-teal text-tint shadow-sm hover:shadow-md`,
        blue: `border-transparent bg-blue text-tint shadow-sm hover:shadow-md`,
        indigo: `border-transparent bg-indigo text-tint shadow-sm hover:shadow-md`,
        purple: `border-transparent bg-purple text-tint shadow-sm hover:shadow-md`,
        pink: `border-transparent bg-pink text-tint shadow-sm hover:shadow-md`,
```

**Step 2: Add tint color variants to buttonVariants**

Continue adding after the solid color variants:

```tsx
        'red-tint': `bg-red-tint border-red text-dark shadow-sm hover:shadow-md`,
        'orange-tint': `bg-orange-tint border-orange text-dark shadow-sm hover:shadow-md`,
        'amber-tint': `bg-amber-tint border-amber text-dark shadow-sm hover:shadow-md`,
        'yellow-tint': `bg-yellow-tint border-yellow text-dark shadow-sm hover:shadow-md`,
        'green-tint': `bg-green-tint border-green text-dark shadow-sm hover:shadow-md`,
        'teal-tint': `bg-teal-tint border-teal text-dark shadow-sm hover:shadow-md`,
        'blue-tint': `bg-blue-tint border-blue text-dark shadow-sm hover:shadow-md`,
        'indigo-tint': `bg-indigo-tint border-indigo text-dark shadow-sm hover:shadow-md`,
        'purple-tint': `bg-purple-tint border-purple text-dark shadow-sm hover:shadow-md`,
        'pink-tint': `bg-pink-tint border-pink text-dark shadow-sm hover:shadow-md`,
```

**Step 3: Verify TypeScript compilation**

Run: `pnpm build`
Expected: Build completes successfully with no type errors

**Step 4: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(button): add 20 color variants (solid + tint)"
```

---

## Task 2: Update TagTypeDropdown to Use Color Variants

**Files:**
- Modify: `src/components/TagTypeDropdown.tsx:36`

**Step 1: Update Button variant logic**

In `src/components/TagTypeDropdown.tsx`, change line 36 from:

```tsx
          variant={hasSelection ? 'neutral' : 'neutral-outline'}
```

to:

```tsx
          variant={hasSelection ? tagType.color : 'neutral-outline'}
```

**Step 2: Verify TypeScript compilation**

Run: `pnpm build`
Expected: Build completes successfully with no type errors

**Step 3: Test in development**

Run: `pnpm dev`
Expected: Dev server starts successfully
Action: Navigate to home page, verify tag type filter buttons show neutral-outline when unselected
Action: Click a tag filter to select it, verify button shows appropriate color (e.g., teal-tint for teal tag types)

**Step 4: Commit**

```bash
git add src/components/TagTypeDropdown.tsx
git commit -m "feat(filters): use tag type colors in filter buttons"
```

---

## Task 3: Add Storybook Story for Color Variants

**Files:**
- Modify: `src/components/ui/button.stories.tsx:80` (add at end)

**Step 1: Add ColorVariants story**

Add the following story at the end of `src/components/ui/button.stories.tsx`:

```tsx
export const ColorVariants: Story = {
  render: () => {
    const colors = [
      'red',
      'orange',
      'amber',
      'yellow',
      'green',
      'teal',
      'blue',
      'indigo',
      'purple',
      'pink',
    ] as const

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Solid</h3>
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <Button key={color} variant={color}>
                {color}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Tint</h3>
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <Button key={`${color}-tint`} variant={`${color}-tint`}>
                {color}-tint
              </Button>
            ))}
          </div>
        </div>
      </div>
    )
  },
}
```

**Step 2: Start Storybook and verify**

Run: `pnpm storybook`
Expected: Storybook starts successfully
Action: Navigate to UI/Button/ColorVariants story
Action: Verify all 10 solid color variants render correctly
Action: Verify all 10 tint color variants render correctly
Action: Test hover states on each button
Action: Switch to dark mode and verify colors still look correct

**Step 3: Commit**

```bash
git add src/components/ui/button.stories.tsx
git commit -m "docs(storybook): add ColorVariants story for Button"
```

---

## Task 4: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md` (Design Tokens section)

**Step 1: Document Button color variants**

In `CLAUDE.md`, find the "Design Tokens" section and add after the Button component reference:

```markdown
**Button color variants:**

The Button component supports 20 color variants matching the Badge color palette:
- Solid variants (10): red, orange, amber, yellow, green, teal, blue, indigo, purple, pink
- Tint variants (10): red-tint, orange-tint, amber-tint, yellow-tint, green-tint, teal-tint, blue-tint, indigo-tint, purple-tint, pink-tint

Usage:
```tsx
<Button variant="teal-tint">Teal Button</Button>
<Button variant="red">Red Button</Button>
```

These variants are used in tag type filter triggers (`TagTypeDropdown`) to display tag type colors when filters are selected.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document Button color variants"
```

---

## Task 5: Final Verification and Testing

**Files:**
- N/A (verification only)

**Step 1: Run all checks**

Run: `pnpm check`
Expected: All Biome checks pass

**Step 2: Build for production**

Run: `pnpm build`
Expected: Build completes successfully

**Step 3: Test in development**

Run: `pnpm dev`
Expected: Development server starts
Action: Navigate to home page
Action: Verify tag type filters show neutral-outline when unselected
Action: Select tags from different tag types
Action: Verify each tag type shows its correct color variant when selected
Action: Clear filters and verify buttons return to neutral-outline
Action: Test in both light and dark modes

**Step 4: Create summary commit (if needed)**

If any final tweaks were made during testing:

```bash
git add -A
git commit -m "chore(button): final verification and cleanup"
```

---

## Completion Checklist

- [ ] Button component has 20 new color variants
- [ ] TagTypeDropdown uses tagType.color when filters selected
- [ ] Storybook story shows all color variants
- [ ] CLAUDE.md documents new Button capabilities
- [ ] All builds pass (dev, prod, storybook)
- [ ] All Biome checks pass
- [ ] Manual testing confirms correct behavior in light/dark modes
- [ ] All changes committed with conventional commit messages

## Next Steps

After completing this plan:
1. Use @superpowers:requesting-code-review to request review
2. Use @superpowers:finishing-a-development-branch to decide on merge/PR strategy
3. Clean up branch after merging
