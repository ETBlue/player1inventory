# ItemCard Storybook Reorganization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `ItemCard.stories.tsx` into one file per mode with a shared fixtures file, removing visual duplicates and organizing stories into Storybook sidebar sub-folders.

**Architecture:** Delete the single monolithic stories file. Create `ItemCard.stories.fixtures.ts` for shared mock data and a Storybook decorator, then create five story files each with a unique `title` (`Components/ItemCard/Pantry`, etc.) that Storybook renders as sidebar sub-folders.

**Tech Stack:** Storybook 8, React 19, TypeScript, TanStack Router, TanStack Query

---

### Task 1: Create shared fixtures file

**Files:**
- Create: `src/components/ItemCard.stories.fixtures.ts`

**Step 1: Create the fixtures file**

```ts
// src/components/ItemCard.stories.fixtures.ts
import type { Decorator } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import type { Recipe, Vendor } from '@/types'
import { TagColor } from '@/types'

const createStoryRouter = (storyComponent: React.ComponentType) => {
  const rootRoute = createRootRoute({
    component: storyComponent as () => React.ReactNode,
  })
  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

const queryClient = new QueryClient()

export function RouterWrapper({ children }: { children: React.ReactNode }) {
  const [router] = useState(() =>
    createStoryRouter(() => <>{children}</>),
  )
  return <RouterProvider router={router} />
}

export const sharedDecorator: Decorator = (Story) => (
  <QueryClientProvider client={queryClient}>
    <RouterWrapper>
      <div className="max-w-md">
        <Story />
      </div>
    </RouterWrapper>
  </QueryClientProvider>
)

export const mockItem = {
  id: '1',
  name: 'Yogurt (plain)',
  packageUnit: 'gallon',
  targetUnit: 'package' as const,
  tagIds: ['tag-1'],
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const mockDualUnitItem = {
  id: '1',
  name: 'Purple grapes',
  packageUnit: 'bottle',
  measurementUnit: 'L',
  amountPerPackage: 1,
  targetUnit: 'measurement' as const,
  targetQuantity: 2,
  refillThreshold: 0.5,
  packedQuantity: 1,
  unpackedQuantity: 0.7,
  consumeAmount: 0.25,
  tagIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const mockTags = [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }]

export const mockTagTypes = [
  { id: 'type-1', name: 'Category', color: TagColor.blue },
]

export const mockMultipleTags = [
  { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
  { id: 'tag-2', name: 'Organic', typeId: 'type-2' },
  { id: 'tag-3', name: 'Local', typeId: 'type-3' },
  { id: 'tag-4', name: 'Sale', typeId: 'type-4' },
]

export const mockMultipleTagTypes = [
  { id: 'type-1', name: 'Category', color: TagColor.blue },
  { id: 'type-2', name: 'Quality', color: TagColor.green },
  { id: 'type-3', name: 'Source', color: TagColor.amber },
  { id: 'type-4', name: 'Price', color: TagColor.red },
]

export const mockVendors: Vendor[] = [
  { id: 'v1', name: 'Costco', createdAt: new Date() },
  { id: 'v2', name: 'Safeway', createdAt: new Date() },
]

export const mockRecipes: Recipe[] = [
  {
    id: 'r1',
    name: 'Pancakes',
    items: [{ itemId: '1', defaultAmount: 2 }],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ItemCard.stories.fixtures.ts
git commit -m "feat(storybook): add ItemCard stories fixtures file"
```

---

### Task 2: Create Pantry stories

**Files:**
- Create: `src/components/ItemCard.pantry.stories.tsx`

**Step 1: Create the file**

```tsx
// src/components/ItemCard.pantry.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from './ItemCard'
import {
  mockDualUnitItem,
  mockItem,
  mockTags,
  mockTagTypes,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard/Pantry',
  component: ItemCard,
  decorators: [sharedDecorator],
}

export default meta
type Story = StoryObj<typeof ItemCard>

export const StatusInactive: Story = {
  name: 'Status — Inactive',
  args: {
    item: {
      ...mockItem,
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    },
    quantity: 0,
    tags: [],
    tagTypes: [],
  },
}

export const StatusOK: Story = {
  name: 'Status — OK',
  args: {
    item: mockItem,
    quantity: 2,
    tags: mockTags,
    tagTypes: mockTagTypes,
  },
}

export const StatusWarning: Story = {
  name: 'Status — Warning',
  args: {
    item: mockItem,
    quantity: 1, // equals refillThreshold
    tags: mockTags,
    tagTypes: mockTagTypes,
  },
}

export const StatusError: Story = {
  name: 'Status — Error (out of stock)',
  args: {
    item: mockItem,
    quantity: 0,
    tags: mockTags,
    tagTypes: mockTagTypes,
  },
}

export const ExpiringSoon: Story = {
  name: 'Expiring — Explicit date',
  args: {
    item: mockItem,
    quantity: 1,
    tags: [],
    tagTypes: [],
    estimatedDueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  },
}

export const ExpiringRelative: Story = {
  name: 'Expiring — Relative (days from purchase)',
  args: {
    item: {
      ...mockDualUnitItem,
      estimatedDueDays: 2,
    },
    quantity: 1.7,
    tags: [],
    tagTypes: [],
    estimatedDueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
  },
}

export const WithAmountButtons: Story = {
  name: 'With +/- buttons',
  args: {
    item: mockItem,
    quantity: 2,
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'pantry',
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ItemCard.pantry.stories.tsx
git commit -m "feat(storybook): add ItemCard Pantry stories"
```

---

### Task 3: Create Shopping stories

**Files:**
- Create: `src/components/ItemCard.shopping.stories.tsx`

**Step 1: Create the file**

```tsx
// src/components/ItemCard.shopping.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from './ItemCard'
import {
  mockItem,
  mockTags,
  mockTagTypes,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard/Shopping',
  component: ItemCard,
  decorators: [sharedDecorator],
}

export default meta
type Story = StoryObj<typeof ItemCard>

export const NotInCart: Story = {
  name: 'Not in cart',
  args: {
    item: mockItem,
    quantity: 1,
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle cart'),
  },
}

export const InCart: Story = {
  name: 'In cart (with amount controls)',
  args: {
    item: mockItem,
    quantity: 1,
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isChecked: true,
    controlAmount: 3,
    onCheckboxToggle: () => console.log('Toggle cart'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ItemCard.shopping.stories.tsx
git commit -m "feat(storybook): add ItemCard Shopping stories"
```

---

### Task 4: Create Cooking stories

**Files:**
- Create: `src/components/ItemCard.cooking.stories.tsx`

**Step 1: Create the file**

```tsx
// src/components/ItemCard.cooking.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from './ItemCard'
import { mockItem, mockTags, mockTagTypes, sharedDecorator } from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard/Cooking',
  component: ItemCard,
  decorators: [sharedDecorator],
}

export default meta
type Story = StoryObj<typeof ItemCard>

export const ItemIncluded: Story = {
  name: 'Item included',
  args: {
    item: { ...mockItem, name: 'Flour', packageUnit: 'kg' },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'cooking',
    showTags: false,
    showTagSummary: false,
    isChecked: true,
    controlAmount: 4,
    onCheckboxToggle: () => console.log('Toggle item'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const ItemExcluded: Story = {
  name: 'Item excluded (optional)',
  args: {
    item: { ...mockItem, name: 'Bacon', packageUnit: 'pack' },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'cooking',
    showTags: false,
    showTagSummary: false,
    isChecked: false,
    controlAmount: 2,
    onCheckboxToggle: () => console.log('Toggle item'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ItemCard.cooking.stories.tsx
git commit -m "feat(storybook): add ItemCard Cooking stories"
```

---

### Task 5: Create Assignment stories

**Files:**
- Create: `src/components/ItemCard.assignment.stories.tsx`

**Step 1: Create the file**

```tsx
// src/components/ItemCard.assignment.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from './ItemCard'
import { mockItem, mockTags, mockTagTypes, sharedDecorator } from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard/Assignment',
  component: ItemCard,
  decorators: [sharedDecorator],
}

export default meta
type Story = StoryObj<typeof ItemCard>

const baseArgs = {
  item: mockItem,
  quantity: 2,
  tags: mockTags,
  tagTypes: mockTagTypes,
}

export const TagChecked: Story = {
  name: 'Tag assignment — Checked',
  args: {
    ...baseArgs,
    mode: 'tag-assignment',
    isChecked: true,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}

export const TagUnchecked: Story = {
  name: 'Tag assignment — Unchecked',
  args: {
    ...baseArgs,
    mode: 'tag-assignment',
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}

export const RecipeAssigned: Story = {
  name: 'Recipe assignment — Assigned',
  args: {
    ...baseArgs,
    mode: 'recipe-assignment',
    isChecked: true,
    controlAmount: 2,
    onCheckboxToggle: () => console.log('Toggle assignment'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const RecipeUnassigned: Story = {
  name: 'Recipe assignment — Unassigned',
  args: {
    ...baseArgs,
    mode: 'recipe-assignment',
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ItemCard.assignment.stories.tsx
git commit -m "feat(storybook): add ItemCard Assignment stories"
```

---

### Task 6: Create Variants stories

**Files:**
- Create: `src/components/ItemCard.variants.stories.tsx`

**Step 1: Create the file**

```tsx
// src/components/ItemCard.variants.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { TagColor } from '@/types'
import { ItemCard } from './ItemCard'
import {
  mockItem,
  mockMultipleTags,
  mockMultipleTagTypes,
  mockRecipes,
  mockTags,
  mockTagTypes,
  mockVendors,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard/Variants',
  component: ItemCard,
  decorators: [sharedDecorator],
}

export default meta
type Story = StoryObj<typeof ItemCard>

export const TagsHidden: Story = {
  name: 'Tags hidden (shows summary)',
  args: {
    item: mockItem,
    quantity: 2,
    tags: mockTags,
    tagTypes: mockTagTypes,
    showTags: false,
    showTagSummary: true,
  },
}

export const MultipleTags: Story = {
  name: 'Multiple tags (4 colors)',
  args: {
    item: { ...mockItem, tagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4'] },
    quantity: 2,
    tags: mockMultipleTags,
    tagTypes: mockMultipleTagTypes,
  },
}

export const VendorsAndRecipesCollapsed: Story = {
  name: 'Vendors & recipes — Collapsed (summary)',
  args: {
    item: mockItem,
    quantity: 2,
    tags: mockTags,
    tagTypes: mockTagTypes,
    showTags: false,
    vendors: mockVendors,
    recipes: mockRecipes,
  },
}

export const VendorsAndRecipesExpanded: Story = {
  name: 'Vendors & recipes — Expanded (with click handlers)',
  args: {
    item: mockItem,
    quantity: 2,
    tags: mockTags,
    tagTypes: mockTagTypes,
    showTags: true,
    vendors: mockVendors,
    recipes: mockRecipes,
    onVendorClick: (vendorId) => console.log('Vendor clicked:', vendorId),
    onRecipeClick: (recipeId) => console.log('Recipe clicked:', recipeId),
  },
}

export const ActiveTagFilter: Story = {
  name: 'Active tag filter (some highlighted)',
  args: {
    item: { ...mockItem, tagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4'] },
    quantity: 2,
    tags: mockMultipleTags,
    tagTypes: mockMultipleTagTypes,
    activeTagIds: ['tag-1', 'tag-3'],
  },
}

export const ActiveVendorFilter: Story = {
  name: 'Active vendor filter (Costco highlighted)',
  args: {
    item: mockItem,
    quantity: 2,
    tags: mockTags,
    tagTypes: mockTagTypes,
    showTags: true,
    vendors: mockVendors,
    recipes: mockRecipes,
    activeVendorIds: ['v1'],
  },
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ItemCard.variants.stories.tsx
git commit -m "feat(storybook): add ItemCard Variants stories"
```

---

### Task 7: Delete original file and verify Storybook

**Files:**
- Delete: `src/components/ItemCard.stories.tsx`

**Step 1: Delete the original file**

```bash
rm src/components/ItemCard.stories.tsx
```

**Step 2: Check TypeScript**

Run: `pnpm check`
Expected: No errors

**Step 3: Start Storybook and verify**

Run: `pnpm storybook`

Open the browser and verify:
- Sidebar shows `Components/ItemCard/` with 5 sub-folders: Pantry, Shopping, Cooking, Assignment, Variants
- Pantry has 7 stories (StatusInactive, StatusOK, StatusWarning, StatusError, ExpiringSoon, ExpiringRelative, WithAmountButtons)
- Shopping has 2 stories (NotInCart, InCart)
- Cooking has 2 stories (ItemIncluded, ItemExcluded)
- Assignment has 4 stories (TagChecked, TagUnchecked, RecipeAssigned, RecipeUnassigned)
- Variants has 6 stories (TagsHidden, MultipleTags, VendorsAndRecipesCollapsed, VendorsAndRecipesExpanded, ActiveTagFilter, ActiveVendorFilter)
- No story renders blank or throws an error

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(storybook): reorganize ItemCard stories by mode, remove duplicates"
```
