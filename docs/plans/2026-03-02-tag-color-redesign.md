# Tag Color Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give tag badges selected/unselected visual states matching vendor/recipe badges; restructure hue color tokens for dark mode support; expand palette from 10 to 14 hues.

**Architecture:** Delete `colors.css` and merge its hue variables into `theme.css` using the existing `:root`/`.dark`/`@theme inline` two-layer pattern. The `TagColor` enum drops tint variants (the `x-tint` badge styles are still used dynamically in `ItemCard`). A DB migration converts any stored tint values to bold. A new `activeTagIds` prop on `ItemCard` drives badge variant switching (tint = unselected, bold = selected).

**Tech Stack:** Tailwind CSS v4, React 19, Dexie.js (IndexedDB), Vitest + React Testing Library, TypeScript strict, class-variance-authority (cva)

---

## Task 1: CSS — Merge colors.css into theme.css

**Files:**
- Modify: `src/design-tokens/theme.css`
- Modify: `src/design-tokens/index.css`
- Delete: `src/design-tokens/colors.css`

No unit test — verify visually via `pnpm dev`. Existing colored badges must look identical after this step.

**Step 1: Add hue CSS variables to the first `:root {}` block in `theme.css`**

Append inside the existing `:root {}` block (after `--status-inactive-tint`):

```css
  /* Hue colors */
  --hue-red: hsl(0 84% 60%);
  --hue-orange: hsl(25 95% 53%);
  --hue-amber: hsl(38 92% 50%);
  --hue-yellow: hsl(48 96% 48%);
  --hue-green: hsl(142 71% 45%);
  --hue-teal: hsl(174 77% 39%);
  --hue-blue: hsl(217 91% 60%);
  --hue-indigo: hsl(239 84% 67%);
  --hue-purple: hsl(271 91% 65%);
  --hue-pink: hsl(330 81% 60%);
  --hue-brown: hsl(30 60% 38%);
  --hue-lime: hsl(82 65% 45%);
  --hue-cyan: hsl(186 90% 42%);
  --hue-rose: hsl(350 85% 60%);

  /* Hue tints — light mode */
  --hue-red-tint: hsl(0 93% 94%);
  --hue-orange-tint: hsl(34 100% 92%);
  --hue-amber-tint: hsl(48 96% 89%);
  --hue-yellow-tint: hsl(55 97% 88%);
  --hue-green-tint: hsl(141 84% 93%);
  --hue-teal-tint: hsl(166 76% 90%);
  --hue-blue-tint: hsl(214 95% 93%);
  --hue-indigo-tint: hsl(231 77% 94%);
  --hue-purple-tint: hsl(270 100% 95%);
  --hue-pink-tint: hsl(327 73% 95%);
  --hue-brown-tint: hsl(30 95% 92%);
  --hue-lime-tint: hsl(82 95% 92%);
  --hue-cyan-tint: hsl(186 95% 92%);
  --hue-rose-tint: hsl(350 95% 92%);

  /* Brightness utilities */
  --brightness-tint: hsl(45 5% 100%);
  --brightness-dark: hsl(45 5% 20%);
```

**Step 2: Add dark mode overrides to the `.dark {}` block in `theme.css`**

Append inside the existing `.dark {}` block (after `--status-inactive-tint`):

```css
  /* Hue tints — dark mode (bold hue colors unchanged) */
  --hue-red-tint: hsl(0 20% 40%);
  --hue-orange-tint: hsl(25 20% 40%);
  --hue-amber-tint: hsl(38 20% 40%);
  --hue-yellow-tint: hsl(48 20% 40%);
  --hue-green-tint: hsl(142 20% 40%);
  --hue-teal-tint: hsl(174 20% 40%);
  --hue-blue-tint: hsl(217 20% 40%);
  --hue-indigo-tint: hsl(239 20% 40%);
  --hue-purple-tint: hsl(271 20% 40%);
  --hue-pink-tint: hsl(330 20% 40%);
  --hue-brown-tint: hsl(30 20% 35%);
  --hue-lime-tint: hsl(82 20% 40%);
  --hue-cyan-tint: hsl(186 20% 40%);
  --hue-rose-tint: hsl(350 20% 40%);

  /* Flip brightness-dark so tint badge text is readable on dark backgrounds */
  --brightness-dark: hsl(45 5% 90%);
```

**Step 3: Add `@theme inline` mappings to `theme.css`**

Append inside the existing `@theme inline {}` block (after the status color entries):

```css
  /* Hue color utilities */
  --color-red: var(--hue-red);
  --color-orange: var(--hue-orange);
  --color-amber: var(--hue-amber);
  --color-yellow: var(--hue-yellow);
  --color-green: var(--hue-green);
  --color-teal: var(--hue-teal);
  --color-blue: var(--hue-blue);
  --color-indigo: var(--hue-indigo);
  --color-purple: var(--hue-purple);
  --color-pink: var(--hue-pink);
  --color-brown: var(--hue-brown);
  --color-lime: var(--hue-lime);
  --color-cyan: var(--hue-cyan);
  --color-rose: var(--hue-rose);

  --color-red-tint: var(--hue-red-tint);
  --color-orange-tint: var(--hue-orange-tint);
  --color-amber-tint: var(--hue-amber-tint);
  --color-yellow-tint: var(--hue-yellow-tint);
  --color-green-tint: var(--hue-green-tint);
  --color-teal-tint: var(--hue-teal-tint);
  --color-blue-tint: var(--hue-blue-tint);
  --color-indigo-tint: var(--hue-indigo-tint);
  --color-purple-tint: var(--hue-purple-tint);
  --color-pink-tint: var(--hue-pink-tint);
  --color-brown-tint: var(--hue-brown-tint);
  --color-lime-tint: var(--hue-lime-tint);
  --color-cyan-tint: var(--hue-cyan-tint);
  --color-rose-tint: var(--hue-rose-tint);

  /* Brightness utilities (text-tint, text-dark, bg-tint, bg-dark) */
  --color-tint: var(--brightness-tint);
  --color-dark: var(--brightness-dark);
```

**Step 4: Remove `colors.css` import from `index.css`**

In `src/design-tokens/index.css`, remove the line:
```css
@import './colors.css';
```

**Step 5: Delete `colors.css`**

```bash
git rm src/design-tokens/colors.css
```

**Step 6: Verify no visual regressions**

```bash
pnpm dev
```

Open the app and check that all colored badges and buttons look identical to before. Flip to dark mode and confirm tint backgrounds are now dark/muted.

**Step 7: Commit**

```bash
git add src/design-tokens/theme.css src/design-tokens/index.css
git rm src/design-tokens/colors.css
git commit -m "style(tokens): merge colors.css into theme.css with dark mode hue support"
```

---

## Task 2: Expand design-token exports in index.ts

**Files:**
- Modify: `src/design-tokens/index.ts`

No test needed — TypeScript compilation catches errors.

**Step 1: Add 4 new hue entries to the `colors` object**

In `src/design-tokens/index.ts`, add after the `pink` entry:

```ts
  brown: {
    tint: 'var(--color-brown-tint)',
    default: 'var(--color-brown)',
  },
  lime: {
    tint: 'var(--color-lime-tint)',
    default: 'var(--color-lime)',
  },
  cyan: {
    tint: 'var(--color-cyan-tint)',
    default: 'var(--color-cyan)',
  },
  rose: {
    tint: 'var(--color-rose-tint)',
    default: 'var(--color-rose)',
  },
```

`ColorName` (= `keyof typeof colors`) automatically gains `brown | lime | cyan | rose`.

**Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/design-tokens/index.ts
git commit -m "feat(tokens): add brown, lime, cyan, rose to design token exports"
```

---

## Task 3: Update TagColor enum and badge/button variants

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/button.tsx`

**Step 1: Replace the TagColor enum in `src/types/index.ts`**

Remove all 10 `x-tint` values; add 4 new hues. Result:

```ts
export enum TagColor {
  red = 'red',
  orange = 'orange',
  amber = 'amber',
  yellow = 'yellow',
  green = 'green',
  teal = 'teal',
  blue = 'blue',
  indigo = 'indigo',
  purple = 'purple',
  pink = 'pink',
  brown = 'brown',
  lime = 'lime',
  cyan = 'cyan',
  rose = 'rose',
}
```

**Step 2: Add 4 new solid + 4 new tint variants to `badge.tsx`**

In `src/components/ui/badge.tsx`, add after `'pink-tint': ...` and before `'ok-outline': ...`:

```ts
        brown: `bg-brown border-brown text-tint`,
        lime: `bg-lime border-lime text-tint`,
        cyan: `bg-cyan border-cyan text-tint`,
        rose: `bg-rose border-rose text-tint`,

        'brown-tint': `bg-brown-tint border-brown text-dark`,
        'lime-tint': `bg-lime-tint border-lime text-dark`,
        'cyan-tint': `bg-cyan-tint border-cyan text-dark`,
        'rose-tint': `bg-rose-tint border-rose text-dark`,
```

> Note: Keep all existing `x-tint` variants in `badge.tsx` — they are still used by `ItemCard` for rendering unselected tag badges. Only the `TagColor` *enum* removes them.

**Step 3: Add 4 new solid + 4 new tint variants to `button.tsx`**

In `src/components/ui/button.tsx`, add after `'pink-tint': ...`:

```ts
        brown: `border-transparent bg-brown text-tint shadow-sm hover:shadow-md`,
        lime: `border-transparent bg-lime text-tint shadow-sm hover:shadow-md`,
        cyan: `border-transparent bg-cyan text-tint shadow-sm hover:shadow-md`,
        rose: `border-transparent bg-rose text-tint shadow-sm hover:shadow-md`,
        'brown-tint': `bg-brown-tint border-brown text-dark shadow-sm hover:shadow-md`,
        'lime-tint': `bg-lime-tint border-lime text-dark shadow-sm hover:shadow-md`,
        'cyan-tint': `bg-cyan-tint border-cyan text-dark shadow-sm hover:shadow-md`,
        'rose-tint': `bg-rose-tint border-rose text-dark shadow-sm hover:shadow-md`,
```

**Step 4: Check for remaining references to removed tint enum values**

```bash
grep -rn "TagColor\.\(red\|orange\|amber\|yellow\|green\|teal\|blue\|indigo\|purple\|pink\)_tint" src/
```

Fix any found references by removing `_tint` (e.g. `TagColor.red_tint` → `TagColor.red`).

**Step 5: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: No TypeScript errors.

**Step 6: Commit**

```bash
git add src/types/index.ts src/components/ui/badge.tsx src/components/ui/button.tsx
git commit -m "feat(tokens): add brown/lime/cyan/rose variants; remove tint values from TagColor enum"
```

---

## Task 4: TDD — migrateTagColorTints db operation

**Files:**
- Modify: `src/db/operations.test.ts`
- Modify: `src/db/operations.ts`

**Step 1: Write the failing test**

In `src/db/operations.test.ts`, add a new `describe` block (alongside existing describe blocks):

```ts
describe('migrateTagColorTints', () => {
  beforeEach(async () => {
    await db.tagTypes.clear()
  })

  it('user can migrate tint tag type colors to their bold equivalents', async () => {
    // Given tag types with legacy tint color values in the DB
    await db.tagTypes.bulkPut([
      { id: 'tt-red', name: 'Ingredient', color: 'red-tint' as TagColor },
      { id: 'tt-blue', name: 'Storage', color: 'blue-tint' as TagColor },
      { id: 'tt-green', name: 'Category', color: 'green' as TagColor },
    ])

    // When migration runs
    await migrateTagColorTints()

    // Then tint colors are replaced with bold; bold colors are unchanged
    const types = await getAllTagTypes()
    expect(types.find((t) => t.id === 'tt-red')?.color).toBe('red')
    expect(types.find((t) => t.id === 'tt-blue')?.color).toBe('blue')
    expect(types.find((t) => t.id === 'tt-green')?.color).toBe('green')
  })

  it('user sees no changes when no tint colors exist', async () => {
    // Given tag types that already have bold colors
    await db.tagTypes.bulkPut([
      { id: 'tt-teal', name: 'Category', color: 'teal' as TagColor },
    ])

    // When migration runs
    await migrateTagColorTints()

    // Then nothing changes
    const types = await getAllTagTypes()
    expect(types.find((t) => t.id === 'tt-teal')?.color).toBe('teal')
  })
})
```

Import `migrateTagColorTints` and `getAllTagTypes` at the top of the test file alongside existing imports:

```ts
import { getAllTagTypes, migrateTagColorTints, /* ...existing imports */ } from './operations'
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/db/operations.test.ts
```

Expected: FAIL — `migrateTagColorTints is not a function`

**Step 3: Implement migrateTagColorTints in `operations.ts`**

Add after the existing `migrateTagColorsToTypes` function:

```ts
// Migration helper: convert legacy x-tint TagType colors to bold x colors
export async function migrateTagColorTints(): Promise<void> {
  const tintToBase: Record<string, string> = {
    'red-tint': 'red',
    'orange-tint': 'orange',
    'amber-tint': 'amber',
    'yellow-tint': 'yellow',
    'green-tint': 'green',
    'teal-tint': 'teal',
    'blue-tint': 'blue',
    'indigo-tint': 'indigo',
    'purple-tint': 'purple',
    'pink-tint': 'pink',
  }

  const tagTypes = await getAllTagTypes()
  const toUpdate = tagTypes.filter((tt) => tintToBase[tt.color])

  if (toUpdate.length > 0) {
    await db.tagTypes.bulkPut(
      toUpdate.map((tt) => ({ ...tt, color: tintToBase[tt.color] as TagColor })),
    )
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/db/operations.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(db): add migrateTagColorTints to convert legacy tint tag type colors"
```

---

## Task 5: Call migration on mount in tags settings

**Files:**
- Modify: `src/routes/settings/tags/index.tsx`

No new test — same pattern as existing `migrateTagColorsToTypes` call.

**Step 1: Add `migrateTagColorTints` to the import and the `useEffect`**

In `src/routes/settings/tags/index.tsx`:

1. Update the import:
```ts
import { migrateTagColorsToTypes, migrateTagColorTints } from '@/db/operations'
```

2. Update the existing `useEffect`:
```ts
useEffect(() => {
  migrateTagColorsToTypes()
  migrateTagColorTints()
}, [])
```

**Step 2: Run the full test suite**

```bash
pnpm test
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/routes/settings/tags/index.tsx
git commit -m "feat(tags): run migrateTagColorTints on tags settings mount"
```

---

## Task 6: TDD — ItemCard activeTagIds prop

**Files:**
- Create: `src/components/ItemCard.test.tsx`
- Modify: `src/components/ItemCard.tsx`

**Step 1: Write the failing tests**

Create `src/components/ItemCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { TagColor } from '@/types'
import type { Item, Tag, TagType } from '@/types'
import { ItemCard } from './ItemCard'

vi.mock('@/hooks', () => ({
  useLastPurchaseDate: () => ({ data: undefined }),
}))

function RouterWrapper({ children }: { children: React.ReactNode }) {
  const rootRoute = createRootRoute({ component: () => <>{children}</> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return <RouterProvider router={router} />
}

const mockItem: Item = {
  id: 'item-1',
  name: 'Milk',
  tagIds: ['tag-1'],
  targetUnit: 'package',
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
  consumeAmount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockTag: Tag = { id: 'tag-1', name: 'Dairy', typeId: 'tt-1' }
const mockTagType: TagType = { id: 'tt-1', name: 'Category', color: TagColor.teal }

describe('ItemCard tag badge variants', () => {
  it('renders tag badge with tint variant when tag is not in activeTagIds', () => {
    // Given activeTagIds that does not include the tag
    render(
      <RouterWrapper>
        <ItemCard
          item={mockItem}
          tags={[mockTag]}
          tagTypes={[mockTagType]}
          activeTagIds={[]}
        />
      </RouterWrapper>,
    )

    // Then badge uses the tint variant
    const badge = screen.getByTestId('tag-badge-Dairy')
    expect(badge).toHaveClass('bg-teal-tint')
    expect(badge).not.toHaveClass('bg-teal')
  })

  it('renders tag badge with bold variant when tag is in activeTagIds', () => {
    // Given activeTagIds that includes the tag
    render(
      <RouterWrapper>
        <ItemCard
          item={mockItem}
          tags={[mockTag]}
          tagTypes={[mockTagType]}
          activeTagIds={['tag-1']}
        />
      </RouterWrapper>,
    )

    // Then badge uses the bold variant
    const badge = screen.getByTestId('tag-badge-Dairy')
    expect(badge).toHaveClass('bg-teal')
    expect(badge).not.toHaveClass('bg-teal-tint')
  })

  it('renders tag badge with tint variant when activeTagIds is not provided', () => {
    // Given no activeTagIds prop (default unselected)
    render(
      <RouterWrapper>
        <ItemCard item={mockItem} tags={[mockTag]} tagTypes={[mockTagType]} />
      </RouterWrapper>,
    )

    // Then badge defaults to tint (unselected appearance)
    const badge = screen.getByTestId('tag-badge-Dairy')
    expect(badge).toHaveClass('bg-teal-tint')
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: FAIL — badge currently renders with bold variant regardless of activeTagIds (prop doesn't exist yet).

**Step 3: Add `activeTagIds` prop to `ItemCard.tsx`**

In `src/components/ItemCard.tsx`:

1. Add to `ItemCardProps` interface (after `activeRecipeIds`):
```ts
  activeTagIds?: string[]
```

2. Add to the destructured props:
```ts
  activeTagIds,
```

3. Update the tag badge `variant` computation inside the tags map. Find this section:
```tsx
const bgColor = tagType?.color
return (
  <Badge
    key={tag.id}
    data-testid={`tag-badge-${tag.name}`}
    variant={bgColor}
```
Replace with:
```tsx
const bgColor = tagType?.color
const tagVariant = bgColor
  ? activeTagIds?.includes(tag.id)
    ? bgColor
    : (`${bgColor}-tint` as BadgeProps['variant'])
  : bgColor
return (
  <Badge
    key={tag.id}
    data-testid={`tag-badge-${tag.name}`}
    variant={tagVariant}
```

4. Import `BadgeProps` at the top:
```ts
import { Badge, type BadgeProps } from '@/components/ui/badge'
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: PASS

**Step 5: Run the full test suite**

```bash
pnpm test
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.test.tsx
git commit -m "feat(item-card): add activeTagIds prop for selected/unselected tag badge states"
```

---

## Task 7: ColorSelect dual-badge preview

**Files:**
- Modify: `src/components/ColorSelect.tsx`
- Modify: `src/components/ColorSelect.stories.tsx`

**Step 1: Update `ColorSelect.tsx` for dual-badge preview**

Replace the entire content of `src/components/ColorSelect.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TagColor } from '@/types'

interface ColorSelectProps {
  value: TagColor
  onChange: (color: TagColor) => void
  id?: string
}

function ColorPreview({ color }: { color: TagColor }) {
  return (
    <div className="flex items-center gap-1">
      <Badge variant={`${color}-tint` as Parameters<typeof Badge>[0]['variant']}>
        {color}
      </Badge>
      <Badge variant={color}>{color}</Badge>
    </div>
  )
}

export function ColorSelect({ value, onChange, id }: ColorSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue asChild>
          <ColorPreview color={value} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.values(TagColor).map((color) => (
          <SelectItem key={color} value={color}>
            <ColorPreview color={color} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

**Step 2: Update `ColorSelect.stories.tsx`**

The `AllColors` story uses `Object.values(TagColor)` which will automatically show only 14 options after the enum change — no story changes needed. However, verify the stories still render correctly:

```bash
pnpm storybook
```

Open `Components/ColorSelect`. Confirm:
- Each dropdown option shows two badges (tint + bold side by side)
- The trigger shows both badges for the selected color
- 14 color options (no `red-tint`, `blue-tint`, etc.)

**Step 3: Commit**

```bash
git add src/components/ColorSelect.tsx
git commit -m "feat(color-select): show dual tint+bold badge preview per color option"
```

---

## Task 8: Update affected Storybook stories

**Files:**
- Modify: `src/components/ItemCard.stories.tsx`
- Check and update any other stories using stale TagColor values

**Step 1: Find stale stories**

```bash
grep -rn "color: '#" src/ --include="*.stories.tsx"
grep -rn "TagColor\." src/ --include="*.stories.tsx"
```

**Step 2: Fix ItemCard stories**

In `src/components/ItemCard.stories.tsx`, the `Default` and `LowStock` stories have a stale `color: '#3b82f6'`. Replace with `color: TagColor.blue` (import `TagColor` from `@/types`). Also:

- Add an `ActiveTagFilter` story demonstrating `activeTagIds`:

```tsx
export const ActiveTagFilter: Story = {
  args: {
    item: { ...mockItem, tagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4'] },
    tags: [
      { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
      { id: 'tag-2', name: 'Organic', typeId: 'type-2' },
      { id: 'tag-3', name: 'Local', typeId: 'type-3' },
      { id: 'tag-4', name: 'Sale', typeId: 'type-4' },
    ],
    tagTypes: [
      { id: 'type-1', name: 'Category', color: TagColor.blue },
      { id: 'type-2', name: 'Quality', color: TagColor.green },
      { id: 'type-3', name: 'Source', color: TagColor.amber },
      { id: 'type-4', name: 'Price', color: TagColor.red },
    ],
    activeTagIds: ['tag-1', 'tag-3'], // Dairy and Local are active filters
  },
}
```

**Step 3: Fix any other stories with stale tint TagColor references**

For each file found in Step 1, replace `TagColor.red_tint` → `TagColor.red` (or the appropriate bold color). The tint *appearance* is no longer a stored value — it's rendered automatically.

**Step 4: Run full test suite and Storybook**

```bash
pnpm test
pnpm storybook
```

Expected: All tests pass; all stories render without errors.

**Step 5: Commit**

```bash
git add src/components/ItemCard.stories.tsx
# Add any other updated story files
git commit -m "chore(stories): update ItemCard stories for activeTagIds and new TagColor enum"
```

---

## Task 9: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Design Tokens section**

Find the line: `- **Colors**: 10 presets (red, orange, amber, yellow, green, teal, blue, indigo, purple, pink)`

Replace with: `- **Colors**: 14 presets (red, orange, amber, yellow, green, teal, blue, indigo, purple, pink, brown, lime, cyan, rose)`

**Step 2: Update the Button color variants section**

Find: `- Solid variants (10): red, orange, amber, yellow, green, teal, blue, indigo, purple, pink`
Replace: `- Solid variants (14): red, orange, amber, yellow, green, teal, blue, indigo, purple, pink, brown, lime, cyan, rose`

Find: `- Tint variants (10): red-tint, orange-tint, amber-tint, yellow-tint, green-tint, teal-tint, blue-tint, indigo-tint, purple-tint, pink-tint`
Replace: `- Tint variants (14): red-tint, orange-tint, amber-tint, yellow-tint, green-tint, teal-tint, blue-tint, indigo-tint, purple-tint, pink-tint, brown-tint, lime-tint, cyan-tint, rose-tint`

**Step 3: Note the tag badge behavior in ItemCard documentation**

In the CLAUDE.md `ItemCard` section (under the `activeVendorIds`/`activeRecipeIds` documentation, if present), add or update a note that `activeTagIds` drives tag badge state: unselected = tint variant, selected = bold variant, always bold border.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): update color palette counts and tag badge behavior"
```
