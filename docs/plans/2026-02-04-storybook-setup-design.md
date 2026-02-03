# Storybook Setup for UI Component Documentation

**Goal:** Document all UI components in Storybook for easy visual refinement and access.

**Scope:** All 20 components - 8 UI primitives + 12 domain components.

**Architecture:** Storybook with React + Vite integration, dark mode toggle, layer-based organization.

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
├── ItemForm
├── Layout
├── Navigation
├── PantryItem
├── ShoppingItemCard
├── ShoppingItemWithQuantity
├── TagBadge
└── TagDetailDialog
```

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
| Button | Default, Variants, Sizes, Disabled |
| Card | Default, With Header/Content/Footer |
| Input | Default, Placeholder, Disabled |
| Badge | Default, Colors |
| Dialog/AlertDialog | Open state with content |
| ItemCard | Default, Low stock, Due soon |
| TagBadge | Default, Different colors |
| *Dialogs | Open state showing form |

**Total:** ~20 story files, ~40-50 individual stories

---

## Implementation Order

1. Install Storybook dependencies
2. Initialize Storybook with Vite
3. Configure dark mode toggle
4. Create stories for UI primitives (8 files)
5. Create stories for domain components (12 files)
