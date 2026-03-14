# Storybook Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Storybook to document all 20 UI components with dark mode support for visual refinement.

**Architecture:** Storybook 8 with React + Vite, addon-themes for dark mode toggle, stories colocated with components, layer-based organization (UI/ and Components/).

**Tech Stack:** Storybook 8, @storybook/react-vite, @storybook/addon-themes, Tailwind CSS

---

## Task 1: Initialize Storybook

**Files:**
- Create: `.storybook/main.ts`
- Create: `.storybook/preview.ts`
- Modify: `package.json`

**Step 1: Install Storybook**

Run:
```bash
npx storybook@latest init --builder vite --skip-install
```

Expected: Creates `.storybook/` folder with config files

**Step 2: Install dependencies**

Run:
```bash
pnpm install
```

Expected: All Storybook packages installed

**Step 3: Install theme addon**

Run:
```bash
pnpm install -D @storybook/addon-themes
```

Expected: Theme addon installed

**Step 4: Verify Storybook runs**

Run:
```bash
pnpmstorybook
```

Expected: Storybook opens at http://localhost:6006

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: initialize Storybook with Vite"
```

---

## Task 2: Configure Dark Mode

**Files:**
- Modify: `.storybook/preview.ts`

**Step 1: Update preview.ts for dark mode**

Replace `.storybook/preview.ts` with:

```ts
import type { Preview } from '@storybook/react'
import { withThemeByClassName } from '@storybook/addon-themes'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
  ],
}

export default preview
```

**Step 2: Update main.ts to include themes addon**

Ensure `.storybook/main.ts` includes the addon:

```ts
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-themes',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
}

export default config
```

**Step 3: Test dark mode toggle**

Run: `pnpmstorybook`
Expected: Theme toggle appears in toolbar, switching applies `dark` class to preview

**Step 4: Commit**

```bash
git add .storybook/
git commit -m "feat: configure dark mode toggle for Storybook"
```

---

## Task 3: Create Button Stories

**Files:**
- Create: `src/components/ui/button.stories.tsx`

**Step 1: Create button stories**

Create `src/components/ui/button.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: {
    children: 'Button',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button variant="default">Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon">+</Button>
    </div>
  ),
}

export const Disabled: Story = {
  args: {
    children: 'Disabled',
    disabled: true,
  },
}
```

**Step 2: Verify in Storybook**

Run: `pnpmstorybook`
Expected: UI/Button appears with 4 stories

**Step 3: Commit**

```bash
git add src/components/ui/button.stories.tsx
git commit -m "docs: add Button stories"
```

---

## Task 4: Create Badge Stories

**Files:**
- Create: `src/components/ui/badge.stories.tsx`

**Step 1: Create badge stories**

Create `src/components/ui/badge.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from './badge'

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: {
    children: 'Badge',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
}

export const CustomColors: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge style={{ backgroundColor: '#22c55e', color: 'white' }}>Green</Badge>
      <Badge style={{ backgroundColor: '#3b82f6', color: 'white' }}>Blue</Badge>
      <Badge style={{ backgroundColor: '#f59e0b', color: 'black' }}>Amber</Badge>
    </div>
  ),
}
```

**Step 2: Verify in Storybook**

Run: `pnpmstorybook`
Expected: UI/Badge appears with 3 stories

**Step 3: Commit**

```bash
git add src/components/ui/badge.stories.tsx
git commit -m "docs: add Badge stories"
```

---

## Task 5: Create Card Stories

**Files:**
- Create: `src/components/ui/card.stories.tsx`

**Step 1: Create card stories**

Create `src/components/ui/card.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'
import { Button } from './button'

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content goes here.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
}

export const Simple: Story = {
  render: () => (
    <Card className="w-[350px] p-4">
      <p>Simple card with just content.</p>
    </Card>
  ),
}

export const HeaderOnly: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Header Only</CardTitle>
        <CardDescription>No content or footer.</CardDescription>
      </CardHeader>
    </Card>
  ),
}
```

**Step 2: Verify in Storybook**

Run: `pnpmstorybook`
Expected: UI/Card appears with 3 stories

**Step 3: Commit**

```bash
git add src/components/ui/card.stories.tsx
git commit -m "docs: add Card stories"
```

---

## Task 6: Create Input Stories

**Files:**
- Create: `src/components/ui/input.stories.tsx`

**Step 1: Create input stories**

Create `src/components/ui/input.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Input } from './input'
import { Label } from './label'

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
}

export const WithLabel: Story = {
  render: () => (
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </div>
  ),
}

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled input',
    disabled: true,
  },
}

export const WithValue: Story = {
  args: {
    value: 'Prefilled value',
    readOnly: true,
  },
}
```

**Step 2: Verify in Storybook**

Run: `pnpmstorybook`
Expected: UI/Input appears with 4 stories

**Step 3: Commit**

```bash
git add src/components/ui/input.stories.tsx
git commit -m "docs: add Input stories"
```

---

## Task 7: Create Label Stories

**Files:**
- Create: `src/components/ui/label.stories.tsx`

**Step 1: Create label stories**

Create `src/components/ui/label.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Label } from './label'
import { Input } from './input'

const meta: Meta<typeof Label> = {
  title: 'UI/Label',
  component: Label,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Label>

export const Default: Story = {
  args: {
    children: 'Label text',
  },
}

export const WithInput: Story = {
  render: () => (
    <div className="space-y-2">
      <Label htmlFor="name">Name</Label>
      <Input id="name" placeholder="Enter your name" />
    </div>
  ),
}
```

**Step 2: Verify in Storybook**

Run: `pnpmstorybook`
Expected: UI/Label appears with 2 stories

**Step 3: Commit**

```bash
git add src/components/ui/label.stories.tsx
git commit -m "docs: add Label stories"
```

---

## Task 8: Create Dialog Stories

**Files:**
- Create: `src/components/ui/dialog.stories.tsx`

**Step 1: Create dialog stories**

Create `src/components/ui/dialog.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'

const meta: Meta<typeof Dialog> = {
  title: 'UI/Dialog',
  component: Dialog,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Dialog>

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>
            This is a dialog description that explains what this dialog is for.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>Dialog content goes here.</p>
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const WithForm: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Edit Profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Your name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" />
          </div>
        </div>
        <DialogFooter>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
```

**Step 2: Verify in Storybook**

Run: `pnpmstorybook`
Expected: UI/Dialog appears with 2 stories

**Step 3: Commit**

```bash
git add src/components/ui/dialog.stories.tsx
git commit -m "docs: add Dialog stories"
```

---

## Task 9: Create AlertDialog Stories

**Files:**
- Create: `src/components/ui/alert-dialog.stories.tsx`

**Step 1: Create alert-dialog stories**

Create `src/components/ui/alert-dialog.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog'
import { Button } from './button'

const meta: Meta<typeof AlertDialog> = {
  title: 'UI/AlertDialog',
  component: AlertDialog,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof AlertDialog>

export const Default: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Open Alert</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
}

export const Destructive: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete Item</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this item?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the item. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
}
```

**Step 2: Verify in Storybook**

Run: `pnpmstorybook`
Expected: UI/AlertDialog appears with 2 stories

**Step 3: Commit**

```bash
git add src/components/ui/alert-dialog.stories.tsx
git commit -m "docs: add AlertDialog stories"
```

---

## Task 10: Create ConfirmDialog Stories

**Files:**
- Create: `src/components/ui/confirm-dialog.stories.tsx`

**Step 1: Create confirm-dialog stories**

Create `src/components/ui/confirm-dialog.stories.tsx`:

```tsx
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { ConfirmDialog } from './confirm-dialog'
import { Button } from './button'

const meta: Meta<typeof ConfirmDialog> = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof ConfirmDialog>

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Confirm</Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Confirm Action"
          description="Are you sure you want to proceed?"
          onConfirm={() => console.log('Confirmed!')}
        />
      </>
    )
  },
}

export const Destructive: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete Item?"
          description="This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => console.log('Deleted!')}
          destructive
        />
      </>
    )
  },
}
```

**Step 2: Verify in Storybook**

Run: `pnpmstorybook`
Expected: UI/ConfirmDialog appears with 2 stories

**Step 3: Commit**

```bash
git add src/components/ui/confirm-dialog.stories.tsx
git commit -m "docs: add ConfirmDialog stories"
```

---

## Task 11: Create TagBadge Stories

**Files:**
- Create: `src/components/TagBadge.stories.tsx`

**Step 1: Create TagBadge stories**

Create `src/components/TagBadge.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagBadge } from './TagBadge'

const queryClient = new QueryClient()

const meta: Meta<typeof TagBadge> = {
  title: 'Components/TagBadge',
  component: TagBadge,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TagBadge>

export const Default: Story = {
  args: {
    tag: { id: '1', name: 'Dairy', typeId: 'type-1' },
    tagType: { id: 'type-1', name: 'Category', color: '#3b82f6' },
    onClick: () => console.log('Clicked!'),
  },
}

export const DifferentColors: Story = {
  render: () => (
    <div className="flex gap-2">
      <TagBadge
        tag={{ id: '1', name: 'Frozen', typeId: 'type-1' }}
        tagType={{ id: 'type-1', name: 'Storage', color: '#22c55e' }}
        onClick={() => {}}
      />
      <TagBadge
        tag={{ id: '2', name: 'Produce', typeId: 'type-2' }}
        tagType={{ id: 'type-2', name: 'Category', color: '#f59e0b' }}
        onClick={() => {}}
      />
      <TagBadge
        tag={{ id: '3', name: 'Organic', typeId: 'type-3' }}
        tagType={{ id: 'type-3', name: 'Quality', color: '#8b5cf6' }}
        onClick={() => {}}
      />
    </div>
  ),
}
```

**Step 2: Verify in Storybook**

Run: `pnpmstorybook`
Expected: Components/TagBadge appears with 2 stories

**Step 3: Commit**

```bash
git add src/components/TagBadge.stories.tsx
git commit -m "docs: add TagBadge stories"
```

---

## Task 12: Create ItemCard Stories

**Files:**
- Create: `src/components/ItemCard.stories.tsx`

**Step 1: Create ItemCard stories**

Create `src/components/ItemCard.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'
import { ItemCard } from './ItemCard'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard',
  component: ItemCard,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="max-w-md">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ItemCard>

const mockItem = {
  id: '1',
  name: 'Milk',
  unit: 'gallons',
  tagIds: ['tag-1'],
  targetQuantity: 2,
  refillThreshold: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const Default: Story = {
  args: {
    item: mockItem,
    quantity: 2,
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: '#3b82f6' }],
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
  },
}

export const LowStock: Story = {
  args: {
    item: mockItem,
    quantity: 0,
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: '#3b82f6' }],
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
  },
}

export const ExpiringSoon: Story = {
  args: {
    item: mockItem,
    quantity: 1,
    tags: [],
    tagTypes: [],
    estimatedDueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
  },
}

export const MultipleTags: Story = {
  args: {
    item: { ...mockItem, tagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4'] },
    quantity: 2,
    tags: [
      { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
      { id: 'tag-2', name: 'Organic', typeId: 'type-2' },
      { id: 'tag-3', name: 'Local', typeId: 'type-3' },
      { id: 'tag-4', name: 'Sale', typeId: 'type-4' },
    ],
    tagTypes: [
      { id: 'type-1', name: 'Category', color: '#3b82f6' },
      { id: 'type-2', name: 'Quality', color: '#22c55e' },
      { id: 'type-3', name: 'Source', color: '#f59e0b' },
      { id: 'type-4', name: 'Price', color: '#ef4444' },
    ],
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
  },
}
```

**Step 2: Install react-router-dom for MemoryRouter**

Note: ItemCard uses TanStack Router's Link. We'll need to mock the router context.

Actually, let's use TanStack Router's proper approach:

Update the story file to use a decorator that wraps with router context:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { ItemCard } from './ItemCard'

// Create a minimal router for Storybook
const rootRoute = createRootRoute()
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => null,
})
const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$id',
  component: () => null,
})

const routeTree = rootRoute.addChildren([indexRoute, itemRoute])

const createTestRouter = () =>
  createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard',
  component: ItemCard,
  decorators: [
    (Story) => {
      const router = createTestRouter()
      return (
        <RouterProvider router={router}>
          <div className="max-w-md">
            <Story />
          </div>
        </RouterProvider>
      )
    },
  ],
}

export default meta
type Story = StoryObj<typeof ItemCard>

const mockItem = {
  id: '1',
  name: 'Milk',
  unit: 'gallons',
  tagIds: ['tag-1'],
  targetQuantity: 2,
  refillThreshold: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const Default: Story = {
  args: {
    item: mockItem,
    quantity: 2,
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: '#3b82f6' }],
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
  },
}

export const LowStock: Story = {
  args: {
    item: mockItem,
    quantity: 0,
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: '#3b82f6' }],
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
  },
}

export const ExpiringSoon: Story = {
  args: {
    item: mockItem,
    quantity: 1,
    tags: [],
    tagTypes: [],
    estimatedDueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
  },
}

export const MultipleTags: Story = {
  args: {
    item: { ...mockItem, tagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4'] },
    quantity: 2,
    tags: [
      { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
      { id: 'tag-2', name: 'Organic', typeId: 'type-2' },
      { id: 'tag-3', name: 'Local', typeId: 'type-3' },
      { id: 'tag-4', name: 'Sale', typeId: 'type-4' },
    ],
    tagTypes: [
      { id: 'type-1', name: 'Category', color: '#3b82f6' },
      { id: 'type-2', name: 'Quality', color: '#22c55e' },
      { id: 'type-3', name: 'Source', color: '#f59e0b' },
      { id: 'type-4', name: 'Price', color: '#ef4444' },
    ],
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
  },
}
```

**Step 3: Verify in Storybook**

Run: `pnpmstorybook`
Expected: Components/ItemCard appears with 4 stories

**Step 4: Commit**

```bash
git add src/components/ItemCard.stories.tsx
git commit -m "docs: add ItemCard stories"
```

---

## Task 13: Create Remaining Component Stories

**Files:**
- Create: `src/components/ShoppingItemCard.stories.tsx`
- Create: `src/components/AddQuantityDialog.stories.tsx`
- Create: `src/components/AddTagDialog.stories.tsx`
- Create: `src/components/EditTagTypeDialog.stories.tsx`
- Create: `src/components/TagDetailDialog.stories.tsx`
- Create: `src/components/ItemForm.stories.tsx`
- Create: `src/components/Layout.stories.tsx`
- Create: `src/components/Navigation.stories.tsx`

**Step 1: Create ShoppingItemCard stories**

Create `src/components/ShoppingItemCard.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ShoppingItemCard } from './ShoppingItemCard'

const meta: Meta<typeof ShoppingItemCard> = {
  title: 'Components/ShoppingItemCard',
  component: ShoppingItemCard,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ShoppingItemCard>

const mockItem = {
  id: '1',
  name: 'Milk',
  unit: 'gallons',
  tagIds: [],
  targetQuantity: 2,
  refillThreshold: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const NotInCart: Story = {
  args: {
    item: mockItem,
    currentQuantity: 0,
    onAddToCart: () => console.log('Add to cart'),
    onUpdateQuantity: (qty) => console.log('Update:', qty),
    onRemove: () => console.log('Remove'),
  },
}

export const InCart: Story = {
  args: {
    item: mockItem,
    currentQuantity: 0,
    cartItem: { id: 'cart-1', cartId: 'cart', itemId: '1', quantity: 2 },
    onAddToCart: () => console.log('Add to cart'),
    onUpdateQuantity: (qty) => console.log('Update:', qty),
    onRemove: () => console.log('Remove'),
  },
}
```

**Step 2: Create dialog stories (simplified)**

For dialogs that require complex state, create basic open-state stories:

Create `src/components/AddTagDialog.stories.tsx`:

```tsx
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AddTagDialog } from './AddTagDialog'
import { Button } from './ui/button'

const meta: Meta<typeof AddTagDialog> = {
  title: 'Components/AddTagDialog',
  component: AddTagDialog,
}

export default meta
type Story = StoryObj<typeof AddTagDialog>

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [tagName, setTagName] = useState('')
    return (
      <>
        <Button onClick={() => setOpen(true)}>Add Tag</Button>
        <AddTagDialog
          open={open}
          tagName={tagName}
          onTagNameChange={setTagName}
          onAdd={() => {
            console.log('Add:', tagName)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      </>
    )
  },
}
```

Create similar stories for other dialogs following the same pattern.

**Step 3: Commit all remaining stories**

```bash
git add src/components/*.stories.tsx
git commit -m "docs: add remaining component stories"
```

---

## Task 14: Final Verification

**Step 1: Run Storybook and verify all stories**

Run: `pnpmstorybook`

Verify sidebar shows:
- UI/ (8 components)
- Components/ (12 components)

**Step 2: Test dark mode toggle**

Click theme toggle in toolbar, verify all components render correctly in both modes.

**Step 3: Run build to ensure no errors**

Run: `pnpmbuild-storybook`
Expected: Build completes successfully

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: finalize Storybook setup"
```

---

## Summary

**Tasks:** 14 total
- Task 1: Initialize Storybook
- Task 2: Configure dark mode
- Tasks 3-10: UI primitive stories (8 components)
- Tasks 11-13: Domain component stories (12 components)
- Task 14: Final verification

**Files created:** ~20 story files + Storybook config

**Commands:**
- `pnpmstorybook` - Development server on port 6006
- `pnpmbuild-storybook` - Static build for deployment
