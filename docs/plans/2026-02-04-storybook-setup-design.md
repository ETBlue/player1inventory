# Storybook Setup for UI Component Documentation

**Goal:** Document all UI components in Storybook for easy visual refinement and access.

**Scope:** 15 visual components - 8 UI primitives + 7 domain components.

**Architecture:** Storybook with React + Vite integration, dark mode toggle, layer-based organization.

**Status:** ✅ Implemented

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `storybook` | Core framework |
| `@storybook/react-vite` | React + Vite integration |
| `@storybook/addon-essentials` | Controls, actions, viewport |
| `@storybook/addon-themes` | Dark mode toggle |

**Scripts:**
```json
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build"
```

---

## Story Organization

**Folder structure:**
```
src/
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── button.stories.tsx      # UI/Button
│   │   └── ...
│   ├── ItemCard.tsx
│   ├── ItemCard.stories.tsx        # Components/ItemCard
│   └── ...
```

**Sidebar hierarchy:**
```
UI
├── AlertDialog
├── Badge
├── Button
├── Card
├── ConfirmDialog
├── Dialog
├── Input
└── Label

Components
├── AddQuantityDialog
├── AddTagDialog
├── EditTagTypeDialog
├── ItemCard
├── ShoppingItemCard
├── TagBadge
└── TagDetailDialog
```

**Not documented (wrapper/composite components):**
- Layout, Navigation - Structural wrappers without visual elements
- ItemForm - Complex form composite (uses documented primitives)
- PantryItem, ShoppingItemWithQuantity - Data-fetching wrappers

---

## Dark Mode Configuration

- Toggle in Storybook toolbar
- Uses Tailwind's `dark` class on `<html>`
- Preview components in both themes instantly

---

## Story Format

```tsx
// button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
}
export default meta

type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: { children: 'Button' },
}

export const Variants: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button variant="default">Default</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
}
```

---

## Story Coverage

| Component Type | Stories |
|----------------|---------|
| Button | Default, Variants, Sizes, Disabled, Loading |
| Card | Default, With Header/Content/Footer |
| Input | Default, Placeholder, Disabled |
| Badge | Default, Colors |
| Label | Default, Required |
| Dialog/AlertDialog | Open state with content |
| ConfirmDialog | Open state with actions |
| ItemCard | Default, Low stock, Expiring soon, Multiple tags |
| ShoppingItemCard | Default, With tags |
| TagBadge | Default, Different colors, Click handler |
| AddQuantityDialog | Open state with form |
| AddTagDialog | Open state with form |
| EditTagTypeDialog | Open state with form |
| TagDetailDialog | Open state with details |

**Total:** 15 story files, ~45 individual stories

**Technical notes:**
- Components using TanStack Router Link require custom RouterWrapper decorator
- Components using React Query hooks require QueryClientProvider decorator
