# Grocery App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a grocery/pantry management app with local-first IndexedDB storage, enabling users to track inventory, manage shopping lists, and monitor expiration dates.

**Architecture:** React SPA with TanStack Router for navigation, TanStack Query for data fetching abstraction, and Dexie.js for IndexedDB persistence. Components interact only with Query hooks — never directly with the database.

**Tech Stack:** Vite, React 19, TypeScript (strict), TanStack Router, TanStack Query, Dexie.js, Tailwind CSS v4, shadcn/ui, Biome, Vitest

---

## Phase 1: Project Setup

### Task 1.1: Initialize Vite Project

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`

**Step 1: Create Vite project with React TypeScript template**

Run:
```bash
pnpm create vite@latest . -- --template react-ts
```

Select: Overwrite existing files if prompted (only CLAUDE.md, README.md, docs/ exist)

**Step 2: Install dependencies**

Run:
```bash
pnpm install
```

**Step 3: Verify dev server starts**

Run:
```bash
pnpmdev
```

Expected: Server starts at localhost:5173, shows Vite + React page

**Step 4: Stop dev server and commit**

```bash
git add -A
git commit -m "chore: initialize Vite React TypeScript project"
```

---

### Task 1.2: Configure Strict TypeScript

**Files:**
- Modify: `tsconfig.json`

**Step 1: Update tsconfig.json for strict mode**

Replace `tsconfig.json` content:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 2: Update vite.config.ts for path alias**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors (or only errors in template files we'll replace)

**Step 4: Commit**

```bash
git add tsconfig.json vite.config.ts
git commit -m "chore: configure strict TypeScript with path aliases"
```

---

### Task 1.3: Set Up Biome

**Files:**
- Create: `biome.json`
- Delete: `.eslintrc.cjs` (if exists)
- Modify: `package.json`

**Step 1: Install Biome**

Run:
```bash
pnpm install --save-dev @biomejs/biome
```

**Step 2: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded"
    }
  }
}
```

**Step 3: Add scripts to package.json**

Add to `"scripts"`:
```json
"lint": "biome lint ./src",
"format": "biome format ./src --write",
"check": "biome check ./src"
```

**Step 4: Remove ESLint if present**

Run:
```bash
rm -f .eslintrc.cjs eslint.config.js
npm uninstall eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react-hooks eslint-plugin-react-refresh 2>/dev/null || true
```

**Step 5: Format existing files**

Run:
```bash
pnpmformat
```

**Step 6: Verify lint passes**

Run:
```bash
pnpmlint
```

Expected: No errors

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: replace ESLint with Biome"
```

---

### Task 1.4: Set Up Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json`

**Step 1: Install Vitest and Testing Library**

Run:
```bash
pnpm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @types/node
```

**Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 3: Create test setup file**

Create `src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest'
```

**Step 4: Add test script to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 5: Create a smoke test**

Create `src/App.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />)
    expect(document.body).toBeInTheDocument()
  })
})
```

**Step 6: Run tests**

Run:
```bash
pnpm test
```

Expected: 1 test passes

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: set up Vitest with React Testing Library"
```

---

### Task 1.5: Set Up Tailwind CSS v4

**Files:**
- Create: `src/index.css`
- Modify: `index.html`
- Modify: `src/main.tsx`

**Step 1: Install Tailwind CSS v4**

Run:
```bash
pnpm install tailwindcss @tailwindcss/vite
```

**Step 2: Update vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 3: Create src/index.css**

```css
@import 'tailwindcss';
```

**Step 4: Import CSS in main.tsx**

Add at top of `src/main.tsx`:
```typescript
import './index.css'
```

**Step 5: Test Tailwind works**

Update `src/App.tsx` temporarily:

```tsx
function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <h1 className="text-3xl font-bold text-blue-600">Player 1 Inventory</h1>
    </div>
  )
}

export default App
```

**Step 6: Verify in browser**

Run:
```bash
pnpmdev
```

Expected: See styled heading with blue text on gray background

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: set up Tailwind CSS v4"
```

---

### Task 1.6: Set Up shadcn/ui

**Files:**
- Create: `components.json`
- Create: `src/components/ui/button.tsx`
- Create: `src/lib/utils.ts`

**Step 1: Install shadcn/ui dependencies**

Run:
```bash
pnpm install class-variance-authority clsx tailwind-merge lucide-react
```

**Step 2: Create lib/utils.ts**

Create `src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Step 3: Create components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

**Step 4: Add CSS variables to index.css**

Update `src/index.css`:

```css
@import 'tailwindcss';

:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;
  --muted: 0 0% 96.1%;
  --muted-foreground: 0 0% 45.1%;
  --accent: 0 0% 96.1%;
  --accent-foreground: 0 0% 9%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 89.8%;
  --input: 0 0% 89.8%;
  --ring: 0 0% 3.9%;
  --radius: 0.5rem;
}

.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --ring: 0 0% 83.1%;
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

**Step 5: Add Button component**

Run:
```bash
npx shadcn@latest add button
```

Or manually create `src/components/ui/button.tsx` with shadcn button code.

**Step 6: Test Button in App.tsx**

```tsx
import { Button } from '@/components/ui/button'

function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Player 1 Inventory</h1>
        <Button>Get Started</Button>
      </div>
    </div>
  )
}

export default App
```

**Step 7: Verify in browser**

Run:
```bash
pnpmdev
```

Expected: Styled button appears

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: set up shadcn/ui with Button component"
```

---

## Phase 2: Database Layer

### Task 2.1: Set Up Dexie.js with Types

**Files:**
- Create: `src/types/index.ts`
- Create: `src/db/index.ts`
- Create: `src/db/schema.ts`

**Step 1: Install Dexie**

Run:
```bash
pnpm install dexie
```

**Step 2: Create TypeScript types**

Create `src/types/index.ts`:

```typescript
export interface Item {
  id: string
  name: string
  unit?: string
  tagIds: string[]
  targetQuantity: number
  refillThreshold: number
  dueDate?: Date
  estimatedDueDays?: number
  createdAt: Date
  updatedAt: Date
}

export interface Tag {
  id: string
  name: string
  typeId: string
  color?: string
}

export interface TagType {
  id: string
  name: string
}

export interface InventoryLog {
  id: string
  itemId: string
  delta: number
  quantity: number
  note?: string
  occurredAt: Date
  createdAt: Date
}

export interface ShoppingCart {
  id: string
  status: 'active' | 'completed' | 'abandoned'
  createdAt: Date
  completedAt?: Date
}

export interface CartItem {
  id: string
  cartId: string
  itemId: string
  quantity: number
}
```

**Step 3: Create Dexie database**

Create `src/db/index.ts`:

```typescript
import Dexie, { type EntityTable } from 'dexie'
import type { Item, Tag, TagType, InventoryLog, ShoppingCart, CartItem } from '@/types'

const db = new Dexie('Player1Inventory') as Dexie & {
  items: EntityTable<Item, 'id'>
  tags: EntityTable<Tag, 'id'>
  tagTypes: EntityTable<TagType, 'id'>
  inventoryLogs: EntityTable<InventoryLog, 'id'>
  shoppingCarts: EntityTable<ShoppingCart, 'id'>
  cartItems: EntityTable<CartItem, 'id'>
}

db.version(1).stores({
  items: 'id, name, *tagIds, createdAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt',
  cartItems: 'id, cartId, itemId',
})

export { db }
```

**Step 4: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Dexie.js database with types"
```

---

### Task 2.2: Create Database Operations

**Files:**
- Create: `src/db/operations.ts`
- Create: `src/db/operations.test.ts`

**Step 1: Write failing test for item operations**

Create `src/db/operations.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { createItem, getItem, getAllItems, updateItem, deleteItem } from './operations'

describe('Item operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
  })

  it('creates an item', async () => {
    const item = await createItem({
      name: 'Milk',
      unit: 'gallon',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    expect(item.id).toBeDefined()
    expect(item.name).toBe('Milk')
    expect(item.createdAt).toBeInstanceOf(Date)
  })

  it('retrieves an item by id', async () => {
    const created = await createItem({
      name: 'Eggs',
      tagIds: [],
      targetQuantity: 12,
      refillThreshold: 6,
    })

    const retrieved = await getItem(created.id)
    expect(retrieved?.name).toBe('Eggs')
  })

  it('lists all items', async () => {
    await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    await createItem({ name: 'Eggs', tagIds: [], targetQuantity: 12, refillThreshold: 6 })

    const items = await getAllItems()
    expect(items).toHaveLength(2)
  })

  it('updates an item', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await updateItem(item.id, { name: 'Whole Milk' })

    const updated = await getItem(item.id)
    expect(updated?.name).toBe('Whole Milk')
  })

  it('deletes an item', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await deleteItem(item.id)

    const retrieved = await getItem(item.id)
    expect(retrieved).toBeUndefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm test
```

Expected: FAIL - operations module not found

**Step 3: Implement item operations**

Create `src/db/operations.ts`:

```typescript
import { db } from './index'
import type { Item, Tag, TagType, InventoryLog, ShoppingCart, CartItem } from '@/types'

// Item operations
type CreateItemInput = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>

export async function createItem(input: CreateItemInput): Promise<Item> {
  const now = new Date()
  const item: Item = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  await db.items.add(item)
  return item
}

export async function getItem(id: string): Promise<Item | undefined> {
  return db.items.get(id)
}

export async function getAllItems(): Promise<Item[]> {
  return db.items.toArray()
}

export async function updateItem(id: string, updates: Partial<Omit<Item, 'id' | 'createdAt'>>): Promise<void> {
  await db.items.update(id, { ...updates, updatedAt: new Date() })
}

export async function deleteItem(id: string): Promise<void> {
  await db.items.delete(id)
}
```

**Step 4: Run tests**

Run:
```bash
pnpm test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add item database operations with tests"
```

---

### Task 2.3: Add InventoryLog Operations

**Files:**
- Modify: `src/db/operations.ts`
- Modify: `src/db/operations.test.ts`

**Step 1: Write failing tests for inventory log**

Add to `src/db/operations.test.ts`:

```typescript
import {
  createItem,
  getItem,
  getAllItems,
  updateItem,
  deleteItem,
  addInventoryLog,
  getItemLogs,
  getCurrentQuantity,
  getLastPurchaseDate,
} from './operations'

describe('InventoryLog operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
  })

  it('adds an inventory log', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    const log = await addInventoryLog({
      itemId: item.id,
      delta: 2,
      occurredAt: new Date(),
    })

    expect(log.id).toBeDefined()
    expect(log.delta).toBe(2)
    expect(log.quantity).toBe(2)
  })

  it('calculates current quantity from logs', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await addInventoryLog({ itemId: item.id, delta: 5, occurredAt: new Date() })
    await addInventoryLog({ itemId: item.id, delta: -2, occurredAt: new Date() })

    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(3)
  })

  it('gets logs for an item', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await addInventoryLog({ itemId: item.id, delta: 5, occurredAt: new Date() })
    await addInventoryLog({ itemId: item.id, delta: -1, occurredAt: new Date() })

    const logs = await getItemLogs(item.id)
    expect(logs).toHaveLength(2)
  })

  it('gets last purchase date', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const purchaseDate = new Date('2026-02-01')

    await addInventoryLog({ itemId: item.id, delta: -1, occurredAt: new Date('2026-01-15') })
    await addInventoryLog({ itemId: item.id, delta: 5, occurredAt: purchaseDate })
    await addInventoryLog({ itemId: item.id, delta: -2, occurredAt: new Date('2026-02-02') })

    const lastPurchase = await getLastPurchaseDate(item.id)
    expect(lastPurchase?.getTime()).toBe(purchaseDate.getTime())
  })
})
```

**Step 2: Run tests**

Run:
```bash
pnpm test
```

Expected: FAIL - functions not found

**Step 3: Implement inventory log operations**

Add to `src/db/operations.ts`:

```typescript
// InventoryLog operations
type CreateLogInput = {
  itemId: string
  delta: number
  occurredAt: Date
  note?: string
}

export async function addInventoryLog(input: CreateLogInput): Promise<InventoryLog> {
  const currentQty = await getCurrentQuantity(input.itemId)
  const now = new Date()

  const log: InventoryLog = {
    id: crypto.randomUUID(),
    itemId: input.itemId,
    delta: input.delta,
    quantity: currentQty + input.delta,
    note: input.note,
    occurredAt: input.occurredAt,
    createdAt: now,
  }

  await db.inventoryLogs.add(log)
  return log
}

export async function getItemLogs(itemId: string): Promise<InventoryLog[]> {
  return db.inventoryLogs.where('itemId').equals(itemId).sortBy('occurredAt')
}

export async function getCurrentQuantity(itemId: string): Promise<number> {
  const logs = await db.inventoryLogs.where('itemId').equals(itemId).toArray()
  if (logs.length === 0) return 0

  const latest = logs.reduce((a, b) =>
    a.createdAt > b.createdAt ? a : b
  )
  return latest.quantity
}

export async function getLastPurchaseDate(itemId: string): Promise<Date | null> {
  const logs = await db.inventoryLogs
    .where('itemId')
    .equals(itemId)
    .filter(log => log.delta > 0)
    .toArray()

  if (logs.length === 0) return null

  const latest = logs.reduce((a, b) =>
    a.occurredAt > b.occurredAt ? a : b
  )
  return latest.occurredAt
}
```

**Step 4: Run tests**

Run:
```bash
pnpm test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add inventory log operations with tests"
```

---

### Task 2.4: Add Tag and TagType Operations

**Files:**
- Modify: `src/db/operations.ts`
- Modify: `src/db/operations.test.ts`

**Step 1: Write failing tests**

Add to `src/db/operations.test.ts`:

```typescript
import {
  // ... existing imports
  createTagType,
  getAllTagTypes,
  createTag,
  getTagsByType,
  getAllTags,
} from './operations'

describe('Tag operations', () => {
  beforeEach(async () => {
    await db.tags.clear()
    await db.tagTypes.clear()
  })

  it('creates a tag type', async () => {
    const tagType = await createTagType({ name: 'Ingredient type' })

    expect(tagType.id).toBeDefined()
    expect(tagType.name).toBe('Ingredient type')
  })

  it('lists all tag types', async () => {
    await createTagType({ name: 'Ingredient type' })
    await createTagType({ name: 'Storage method' })

    const types = await getAllTagTypes()
    expect(types).toHaveLength(2)
  })

  it('creates a tag', async () => {
    const tagType = await createTagType({ name: 'Ingredient type' })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id, color: '#3b82f6' })

    expect(tag.id).toBeDefined()
    expect(tag.name).toBe('Dairy')
    expect(tag.typeId).toBe(tagType.id)
  })

  it('gets tags by type', async () => {
    const type1 = await createTagType({ name: 'Ingredient type' })
    const type2 = await createTagType({ name: 'Storage method' })

    await createTag({ name: 'Dairy', typeId: type1.id })
    await createTag({ name: 'Produce', typeId: type1.id })
    await createTag({ name: 'Refrigerated', typeId: type2.id })

    const ingredientTags = await getTagsByType(type1.id)
    expect(ingredientTags).toHaveLength(2)
  })
})
```

**Step 2: Run tests**

Run:
```bash
pnpm test
```

Expected: FAIL - functions not found

**Step 3: Implement tag operations**

Add to `src/db/operations.ts`:

```typescript
// TagType operations
export async function createTagType(input: { name: string }): Promise<TagType> {
  const tagType: TagType = {
    id: crypto.randomUUID(),
    name: input.name,
  }
  await db.tagTypes.add(tagType)
  return tagType
}

export async function getAllTagTypes(): Promise<TagType[]> {
  return db.tagTypes.toArray()
}

export async function updateTagType(id: string, updates: Partial<Omit<TagType, 'id'>>): Promise<void> {
  await db.tagTypes.update(id, updates)
}

export async function deleteTagType(id: string): Promise<void> {
  await db.tagTypes.delete(id)
}

// Tag operations
type CreateTagInput = Omit<Tag, 'id'>

export async function createTag(input: CreateTagInput): Promise<Tag> {
  const tag: Tag = {
    ...input,
    id: crypto.randomUUID(),
  }
  await db.tags.add(tag)
  return tag
}

export async function getAllTags(): Promise<Tag[]> {
  return db.tags.toArray()
}

export async function getTagsByType(typeId: string): Promise<Tag[]> {
  return db.tags.where('typeId').equals(typeId).toArray()
}

export async function updateTag(id: string, updates: Partial<Omit<Tag, 'id'>>): Promise<void> {
  await db.tags.update(id, updates)
}

export async function deleteTag(id: string): Promise<void> {
  await db.tags.delete(id)
}
```

**Step 4: Run tests**

Run:
```bash
pnpm test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add tag and tag type operations with tests"
```

---

### Task 2.5: Add ShoppingCart Operations

**Files:**
- Modify: `src/db/operations.ts`
- Modify: `src/db/operations.test.ts`

**Step 1: Write failing tests**

Add to `src/db/operations.test.ts`:

```typescript
import {
  // ... existing imports
  getOrCreateActiveCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  getCartItems,
  checkout,
  abandonCart,
} from './operations'

describe('ShoppingCart operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
  })

  it('creates an active cart if none exists', async () => {
    const cart = await getOrCreateActiveCart()

    expect(cart.id).toBeDefined()
    expect(cart.status).toBe('active')
  })

  it('reuses existing active cart', async () => {
    const cart1 = await getOrCreateActiveCart()
    const cart2 = await getOrCreateActiveCart()

    expect(cart1.id).toBe(cart2.id)
  })

  it('adds item to cart', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const cart = await getOrCreateActiveCart()

    const cartItem = await addToCart(cart.id, item.id, 2)

    expect(cartItem.quantity).toBe(2)
  })

  it('updates cart item quantity', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const cart = await getOrCreateActiveCart()
    const cartItem = await addToCart(cart.id, item.id, 2)

    await updateCartItem(cartItem.id, 5)

    const items = await getCartItems(cart.id)
    expect(items[0]?.quantity).toBe(5)
  })

  it('checks out cart and creates inventory logs', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 3)

    await checkout(cart.id)

    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(3)

    const updatedCart = await db.shoppingCarts.get(cart.id)
    expect(updatedCart?.status).toBe('completed')
  })

  it('abandons cart without creating logs', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 3)

    await abandonCart(cart.id)

    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(0)

    const updatedCart = await db.shoppingCarts.get(cart.id)
    expect(updatedCart?.status).toBe('abandoned')
  })
})
```

**Step 2: Run tests**

Run:
```bash
pnpm test
```

Expected: FAIL - functions not found

**Step 3: Implement shopping cart operations**

Add to `src/db/operations.ts`:

```typescript
// ShoppingCart operations
export async function getOrCreateActiveCart(): Promise<ShoppingCart> {
  const existing = await db.shoppingCarts.where('status').equals('active').first()
  if (existing) return existing

  const cart: ShoppingCart = {
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: new Date(),
  }
  await db.shoppingCarts.add(cart)
  return cart
}

export async function addToCart(cartId: string, itemId: string, quantity: number): Promise<CartItem> {
  const existing = await db.cartItems
    .where('cartId')
    .equals(cartId)
    .filter(ci => ci.itemId === itemId)
    .first()

  if (existing) {
    await db.cartItems.update(existing.id, { quantity: existing.quantity + quantity })
    return { ...existing, quantity: existing.quantity + quantity }
  }

  const cartItem: CartItem = {
    id: crypto.randomUUID(),
    cartId,
    itemId,
    quantity,
  }
  await db.cartItems.add(cartItem)
  return cartItem
}

export async function updateCartItem(cartItemId: string, quantity: number): Promise<void> {
  await db.cartItems.update(cartItemId, { quantity })
}

export async function removeFromCart(cartItemId: string): Promise<void> {
  await db.cartItems.delete(cartItemId)
}

export async function getCartItems(cartId: string): Promise<CartItem[]> {
  return db.cartItems.where('cartId').equals(cartId).toArray()
}

export async function checkout(cartId: string): Promise<void> {
  const cartItems = await getCartItems(cartId)
  const now = new Date()

  for (const cartItem of cartItems) {
    await addInventoryLog({
      itemId: cartItem.itemId,
      delta: cartItem.quantity,
      occurredAt: now,
    })
  }

  await db.shoppingCarts.update(cartId, {
    status: 'completed',
    completedAt: now,
  })

  await db.cartItems.where('cartId').equals(cartId).delete()
}

export async function abandonCart(cartId: string): Promise<void> {
  await db.shoppingCarts.update(cartId, { status: 'abandoned' })
  await db.cartItems.where('cartId').equals(cartId).delete()
}
```

**Step 4: Run tests**

Run:
```bash
pnpm test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add shopping cart operations with tests"
```

---

## Phase 3: TanStack Setup

### Task 3.1: Set Up TanStack Router

**Files:**
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/routeTree.gen.ts`
- Modify: `src/main.tsx`

**Step 1: Install TanStack Router**

Run:
```bash
pnpm install @tanstack/react-router @tanstack/router-plugin @tanstack/router-devtools
```

**Step 2: Update vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 3: Create root route**

Create `src/routes/__root.tsx`:

```typescript
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
      <TanStackRouterDevtools />
    </>
  ),
})
```

**Step 4: Create index route**

Create `src/routes/index.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Player 1 Inventory</h1>
      <p className="text-muted-foreground">Pantry view coming soon</p>
    </div>
  )
}
```

**Step 5: Update main.tsx**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}
```

**Step 6: Generate route tree**

Run:
```bash
pnpmdev
```

This auto-generates `src/routeTree.gen.ts`

**Step 7: Verify routing works**

Expected: App shows "Player 1 Inventory" heading at localhost:5173

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: set up TanStack Router with file-based routing"
```

---

### Task 3.2: Set Up TanStack Query

**Files:**
- Modify: `src/main.tsx`
- Create: `src/hooks/useItems.ts`

**Step 1: Install TanStack Query**

Run:
```bash
pnpm install @tanstack/react-query @tanstack/react-query-devtools
```

**Step 2: Update main.tsx with QueryClient**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { routeTree } from './routeTree.gen'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StrictMode>,
  )
}
```

**Step 3: Create useItems hook**

Create `src/hooks/useItems.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAllItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getCurrentQuantity,
  getLastPurchaseDate,
} from '@/db/operations'
import type { Item } from '@/types'

export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: getAllItems,
  })
}

export function useItem(id: string) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: () => getItem(id),
    enabled: !!id,
  })
}

export function useItemWithQuantity(id: string) {
  const itemQuery = useItem(id)
  const quantityQuery = useQuery({
    queryKey: ['items', id, 'quantity'],
    queryFn: () => getCurrentQuantity(id),
    enabled: !!id,
  })
  const lastPurchaseQuery = useQuery({
    queryKey: ['items', id, 'lastPurchase'],
    queryFn: () => getLastPurchaseDate(id),
    enabled: !!id,
  })

  return {
    item: itemQuery.data,
    quantity: quantityQuery.data ?? 0,
    lastPurchaseDate: lastPurchaseQuery.data,
    isLoading: itemQuery.isLoading || quantityQuery.isLoading,
  }
}

export function useCreateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) => createItem(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Item> }) =>
      updateItem(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['items', id] })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
```

**Step 4: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: set up TanStack Query with useItems hooks"
```

---

### Task 3.3: Add Remaining Query Hooks

**Files:**
- Create: `src/hooks/useInventoryLogs.ts`
- Create: `src/hooks/useTags.ts`
- Create: `src/hooks/useShoppingCart.ts`

**Step 1: Create useInventoryLogs hook**

Create `src/hooks/useInventoryLogs.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getItemLogs, addInventoryLog } from '@/db/operations'

export function useItemLogs(itemId: string) {
  return useQuery({
    queryKey: ['items', itemId, 'logs'],
    queryFn: () => getItemLogs(itemId),
    enabled: !!itemId,
  })
}

export function useAddInventoryLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { itemId: string; delta: number; occurredAt: Date; note?: string }) =>
      addInventoryLog(input),
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['items', itemId] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
```

**Step 2: Create useTags hook**

Create `src/hooks/useTags.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAllTagTypes,
  createTagType,
  updateTagType,
  deleteTagType,
  getAllTags,
  getTagsByType,
  createTag,
  updateTag,
  deleteTag,
} from '@/db/operations'
import type { Tag, TagType } from '@/types'

export function useTagTypes() {
  return useQuery({
    queryKey: ['tagTypes'],
    queryFn: getAllTagTypes,
  })
}

export function useCreateTagType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { name: string }) => createTagType(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
    },
  })
}

export function useUpdateTagType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TagType> }) =>
      updateTagType(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
    },
  })
}

export function useDeleteTagType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTagType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: getAllTags,
  })
}

export function useTagsByType(typeId: string) {
  return useQuery({
    queryKey: ['tags', 'byType', typeId],
    queryFn: () => getTagsByType(typeId),
    enabled: !!typeId,
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<Tag, 'id'>) => createTag(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Tag> }) =>
      updateTag(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}
```

**Step 3: Create useShoppingCart hook**

Create `src/hooks/useShoppingCart.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getOrCreateActiveCart,
  getCartItems,
  addToCart,
  updateCartItem,
  removeFromCart,
  checkout,
  abandonCart,
} from '@/db/operations'

export function useActiveCart() {
  return useQuery({
    queryKey: ['cart', 'active'],
    queryFn: getOrCreateActiveCart,
  })
}

export function useCartItems(cartId: string | undefined) {
  return useQuery({
    queryKey: ['cart', cartId, 'items'],
    queryFn: () => getCartItems(cartId!),
    enabled: !!cartId,
  })
}

export function useAddToCart() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cartId, itemId, quantity }: { cartId: string; itemId: string; quantity: number }) =>
      addToCart(cartId, itemId, quantity),
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['cart', cartId, 'items'] })
    },
  })
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cartItemId, quantity }: { cartItemId: string; quantity: number }) =>
      updateCartItem(cartItemId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })
}

export function useRemoveFromCart() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: removeFromCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })
}

export function useCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: checkout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

export function useAbandonCart() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: abandonCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })
}
```

**Step 4: Create hooks index**

Create `src/hooks/index.ts`:

```typescript
export * from './useItems'
export * from './useInventoryLogs'
export * from './useTags'
export * from './useShoppingCart'
```

**Step 5: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add TanStack Query hooks for all entities"
```

---

## Phase 4: Core UI Components

### Task 4.1: Create App Layout

**Files:**
- Modify: `src/routes/__root.tsx`
- Create: `src/components/Layout.tsx`
- Create: `src/components/Navigation.tsx`

**Step 1: Add shadcn components**

Run:
```bash
npx shadcn@latest add card badge
```

**Step 2: Create Navigation component**

Create `src/components/Navigation.tsx`:

```typescript
import { Link, useLocation } from '@tanstack/react-router'
import { Home, ShoppingCart, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Pantry', icon: Home },
  { to: '/shopping', label: 'Shop', icon: ShoppingCart },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Navigation() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-background">
      <div className="flex justify-around py-2">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to ||
            (to !== '/' && location.pathname.startsWith(to))

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-2 text-sm',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

**Step 3: Create Layout component**

Create `src/components/Layout.tsx`:

```typescript
import type { ReactNode } from 'react'
import { Navigation } from './Navigation'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="container mx-auto px-4 py-4">
        {children}
      </main>
      <Navigation />
    </div>
  )
}
```

**Step 4: Update root route**

Update `src/routes/__root.tsx`:

```typescript
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Layout } from '@/components/Layout'

export const Route = createRootRoute({
  component: () => (
    <>
      <Layout>
        <Outlet />
      </Layout>
      <TanStackRouterDevtools />
    </>
  ),
})
```

**Step 5: Verify in browser**

Run:
```bash
pnpmdev
```

Expected: Bottom navigation bar with Pantry, Shop, Settings

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add app layout with bottom navigation"
```

---

### Task 4.2: Create Pantry Item Card

**Files:**
- Create: `src/components/ItemCard.tsx`

**Step 1: Create ItemCard component**

Create `src/components/ItemCard.tsx`:

```typescript
import { Link } from '@tanstack/react-router'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Minus, Plus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Item, Tag } from '@/types'

interface ItemCardProps {
  item: Item
  quantity: number
  tags: Tag[]
  estimatedDueDate?: Date
  onConsume: () => void
  onAdd: () => void
}

export function ItemCard({
  item,
  quantity,
  tags,
  estimatedDueDate,
  onConsume,
  onAdd,
}: ItemCardProps) {
  const needsRefill = quantity < item.refillThreshold
  const isExpiringSoon = estimatedDueDate &&
    estimatedDueDate.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 // 3 days

  return (
    <Card className={cn(needsRefill && 'border-orange-300 bg-orange-50')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <Link
            to="/items/$id"
            params={{ id: item.id }}
            className="flex-1 min-w-0"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{item.name}</h3>
              {needsRefill && (
                <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {quantity} {item.unit ?? 'units'} / {item.targetQuantity} target
            </p>
            {isExpiringSoon && (
              <p className="text-xs text-red-500 mt-1">
                Expires {estimatedDueDate.toLocaleDateString()}
              </p>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.slice(0, 3).map(tag => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-xs"
                    style={tag.color ? { backgroundColor: tag.color, color: 'white' } : undefined}
                  >
                    {tag.name}
                  </Badge>
                ))}
                {tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.preventDefault()
                onConsume()
              }}
              disabled={quantity <= 0}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-medium">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.preventDefault()
                onAdd()
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add ItemCard component"
```

---

### Task 4.3: Build Pantry View (Home Page)

**Files:**
- Modify: `src/routes/index.tsx`
- Create: `src/components/AddQuantityDialog.tsx`

**Step 1: Add dialog component**

Run:
```bash
npx shadcn@latest add dialog input label
```

**Step 2: Create AddQuantityDialog**

Create `src/components/AddQuantityDialog.tsx`:

```typescript
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AddQuantityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  onConfirm: (quantity: number, occurredAt: Date) => void
}

export function AddQuantityDialog({
  open,
  onOpenChange,
  itemName,
  onConfirm,
}: AddQuantityDialogProps) {
  const [quantity, setQuantity] = useState(1)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]!)

  const handleConfirm = () => {
    onConfirm(quantity, new Date(date))
    setQuantity(1)
    setDate(new Date().toISOString().split('T')[0]!)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {itemName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Purchase Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 3: Update index route**

Update `src/routes/index.tsx`:

```typescript
import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ItemCard } from '@/components/ItemCard'
import { AddQuantityDialog } from '@/components/AddQuantityDialog'
import { useItems, useAddInventoryLog } from '@/hooks'
import { useTags } from '@/hooks/useTags'
import { getCurrentQuantity, getLastPurchaseDate } from '@/db/operations'
import { useQuery } from '@tanstack/react-query'
import type { Item } from '@/types'

export const Route = createFileRoute('/')({
  component: PantryView,
})

function PantryView() {
  const { data: items = [], isLoading } = useItems()
  const { data: tags = [] } = useTags()
  const addLog = useAddInventoryLog()

  const [addDialogItem, setAddDialogItem] = useState<Item | null>(null)

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pantry</h1>
        <Link to="/items/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No items yet.</p>
          <p className="text-sm mt-1">Add your first pantry item to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <PantryItem
              key={item.id}
              item={item}
              tags={tags.filter((t) => item.tagIds.includes(t.id))}
              onConsume={() => {
                addLog.mutate({
                  itemId: item.id,
                  delta: -1,
                  occurredAt: new Date(),
                })
              }}
              onAdd={() => setAddDialogItem(item)}
            />
          ))}
        </div>
      )}

      <AddQuantityDialog
        open={!!addDialogItem}
        onOpenChange={(open) => !open && setAddDialogItem(null)}
        itemName={addDialogItem?.name ?? ''}
        onConfirm={(quantity, occurredAt) => {
          if (addDialogItem) {
            addLog.mutate({
              itemId: addDialogItem.id,
              delta: quantity,
              occurredAt,
            })
          }
        }}
      />
    </div>
  )
}

function PantryItem({
  item,
  tags,
  onConsume,
  onAdd,
}: {
  item: Item
  tags: { id: string; name: string; color?: string }[]
  onConsume: () => void
  onAdd: () => void
}) {
  const { data: quantity = 0 } = useQuery({
    queryKey: ['items', item.id, 'quantity'],
    queryFn: () => getCurrentQuantity(item.id),
  })

  const { data: lastPurchase } = useQuery({
    queryKey: ['items', item.id, 'lastPurchase'],
    queryFn: () => getLastPurchaseDate(item.id),
  })

  const estimatedDueDate =
    item.estimatedDueDays && lastPurchase
      ? new Date(lastPurchase.getTime() + item.estimatedDueDays * 24 * 60 * 60 * 1000)
      : item.dueDate

  return (
    <ItemCard
      item={item}
      quantity={quantity}
      tags={tags}
      estimatedDueDate={estimatedDueDate}
      onConsume={onConsume}
      onAdd={onAdd}
    />
  )
}
```

**Step 4: Verify in browser**

Run:
```bash
pnpmdev
```

Expected: Empty pantry view with "Add Item" button

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: build pantry view with item cards"
```

---

## Phase 5: Item Management Routes

### Task 5.1: Create Add Item Page

**Files:**
- Create: `src/routes/items/new.tsx`
- Create: `src/components/ItemForm.tsx`

**Step 1: Add form components**

Run:
```bash
npx shadcn@latest add select textarea
```

**Step 2: Create ItemForm component**

Create `src/components/ItemForm.tsx`:

```typescript
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { useTagTypes, useTags } from '@/hooks/useTags'
import type { Item } from '@/types'

type ItemFormData = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>

interface ItemFormProps {
  initialData?: Partial<ItemFormData>
  onSubmit: (data: ItemFormData) => void
  submitLabel: string
}

export function ItemForm({ initialData, onSubmit, submitLabel }: ItemFormProps) {
  const { data: tagTypes = [] } = useTagTypes()
  const { data: allTags = [] } = useTags()

  const [name, setName] = useState(initialData?.name ?? '')
  const [unit, setUnit] = useState(initialData?.unit ?? '')
  const [targetQuantity, setTargetQuantity] = useState(initialData?.targetQuantity ?? 1)
  const [refillThreshold, setRefillThreshold] = useState(initialData?.refillThreshold ?? 1)
  const [estimatedDueDays, setEstimatedDueDays] = useState(initialData?.estimatedDueDays ?? '')
  const [tagIds, setTagIds] = useState<string[]>(initialData?.tagIds ?? [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name,
      unit: unit || undefined,
      targetQuantity,
      refillThreshold,
      estimatedDueDays: estimatedDueDays ? Number(estimatedDueDays) : undefined,
      tagIds,
    })
  }

  const toggleTag = (tagId: string) => {
    setTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Milk"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="unit">Unit</Label>
        <Input
          id="unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="e.g., gallon, dozen, lb"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="targetQuantity">Target Quantity</Label>
          <Input
            id="targetQuantity"
            type="number"
            min={1}
            value={targetQuantity}
            onChange={(e) => setTargetQuantity(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="refillThreshold">Refill When Below</Label>
          <Input
            id="refillThreshold"
            type="number"
            min={0}
            value={refillThreshold}
            onChange={(e) => setRefillThreshold(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="estimatedDueDays">Days Until Expiration</Label>
        <Input
          id="estimatedDueDays"
          type="number"
          min={1}
          value={estimatedDueDays}
          onChange={(e) => setEstimatedDueDays(e.target.value)}
          placeholder="Leave empty if no expiration"
        />
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
        {tagTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tags yet. Create tags in Settings.
          </p>
        ) : (
          <div className="space-y-3">
            {tagTypes.map((tagType) => {
              const typeTags = allTags.filter((t) => t.typeId === tagType.id)
              if (typeTags.length === 0) return null

              return (
                <div key={tagType.id}>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {tagType.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {typeTags.map((tag) => {
                      const isSelected = tagIds.includes(tag.id)
                      return (
                        <Badge
                          key={tag.id}
                          variant={isSelected ? 'default' : 'outline'}
                          className="cursor-pointer"
                          style={
                            isSelected && tag.color
                              ? { backgroundColor: tag.color }
                              : undefined
                          }
                          onClick={() => toggleTag(tag.id)}
                        >
                          {tag.name}
                          {isSelected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>
    </form>
  )
}
```

**Step 3: Create add item route**

Create `src/routes/items/new.tsx`:

```typescript
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ItemForm } from '@/components/ItemForm'
import { useCreateItem } from '@/hooks'

export const Route = createFileRoute('/items/new')({
  component: NewItem,
})

function NewItem() {
  const navigate = useNavigate()
  const createItem = useCreateItem()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/' })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Add Item</h1>
      </div>

      <ItemForm
        submitLabel="Add Item"
        onSubmit={(data) => {
          createItem.mutate(data, {
            onSuccess: () => navigate({ to: '/' }),
          })
        }}
      />
    </div>
  )
}
```

**Step 4: Verify in browser**

Run:
```bash
pnpmdev
```

Navigate to /items/new. Expected: Item form with fields

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add item creation page"
```

---

### Task 5.2: Create Item Detail/Edit Page

**Files:**
- Create: `src/routes/items/$id.tsx`

**Step 1: Create item detail route**

Create `src/routes/items/$id.tsx`:

```typescript
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { ArrowLeft, Trash2, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ItemForm } from '@/components/ItemForm'
import { useItem, useUpdateItem, useDeleteItem } from '@/hooks'

export const Route = createFileRoute('/items/$id')({
  component: ItemDetail,
})

function ItemDetail() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: item, isLoading } = useItem(id)
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  if (!item) {
    return <div className="p-4">Item not found</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/' })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">{item.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/items/$id/log" params={{ id }}>
            <Button variant="outline" size="icon">
              <History className="h-5 w-5" />
            </Button>
          </Link>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => {
              if (confirm('Delete this item?')) {
                deleteItem.mutate(id, {
                  onSuccess: () => navigate({ to: '/' }),
                })
              }
            }}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <ItemForm
        initialData={item}
        submitLabel="Save Changes"
        onSubmit={(data) => {
          updateItem.mutate(
            { id, updates: data },
            { onSuccess: () => navigate({ to: '/' }) }
          )
        }}
      />
    </div>
  )
}
```

**Step 2: Verify in browser**

Create an item, then click on it. Expected: Edit form with pre-filled values

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add item detail/edit page"
```

---

### Task 5.3: Create Item History Page

**Files:**
- Create: `src/routes/items/$id/log.tsx`

**Step 1: Create history route**

Create `src/routes/items/$id/log.tsx`:

```typescript
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useItem, useItemLogs } from '@/hooks'

export const Route = createFileRoute('/items/$id/log')({
  component: ItemHistory,
})

function ItemHistory() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: item } = useItem(id)
  const { data: logs = [], isLoading } = useItemLogs(id)

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: '/items/$id', params: { id } })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">{item?.name} History</h1>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No history yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...logs].reverse().map((log) => (
            <Card key={log.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">
                      {log.delta > 0 ? '+' : ''}
                      {log.delta} → {log.quantity} {item?.unit ?? 'units'}
                    </p>
                    {log.note && (
                      <p className="text-sm text-muted-foreground">{log.note}</p>
                    )}
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{log.occurredAt.toLocaleDateString()}</p>
                    <p>{log.occurredAt.toLocaleTimeString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify in browser**

Add/consume an item, then view history. Expected: List of changes with timestamps

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add item history page"
```

---

## Phase 6: Shopping Mode

### Task 6.1: Create Shopping Page

**Files:**
- Create: `src/routes/shopping.tsx`
- Create: `src/components/ShoppingItemCard.tsx`

**Step 1: Create ShoppingItemCard**

Create `src/components/ShoppingItemCard.tsx`:

```typescript
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Minus, Plus, Check } from 'lucide-react'
import type { Item, CartItem } from '@/types'

interface ShoppingItemCardProps {
  item: Item
  currentQuantity: number
  cartItem?: CartItem
  onAddToCart: () => void
  onUpdateQuantity: (quantity: number) => void
  onRemove: () => void
}

export function ShoppingItemCard({
  item,
  currentQuantity,
  cartItem,
  onAddToCart,
  onUpdateQuantity,
  onRemove,
}: ShoppingItemCardProps) {
  const inCart = !!cartItem
  const suggestedQuantity = Math.max(0, item.targetQuantity - currentQuantity)

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{item.name}</h3>
            <p className="text-sm text-muted-foreground">
              Have: {currentQuantity} / Need: {item.targetQuantity}
            </p>
            {suggestedQuantity > 0 && !inCart && (
              <Badge variant="outline" className="mt-1">
                Suggested: +{suggestedQuantity}
              </Badge>
            )}
          </div>

          {inCart ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  if (cartItem.quantity <= 1) {
                    onRemove()
                  } else {
                    onUpdateQuantity(cartItem.quantity - 1)
                  }
                }}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center font-medium">{cartItem.quantity}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onUpdateQuantity(cartItem.quantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={onAddToCart}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Create shopping route**

Create `src/routes/shopping.tsx`:

```typescript
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ShoppingCart, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingItemCard } from '@/components/ShoppingItemCard'
import {
  useItems,
  useActiveCart,
  useCartItems,
  useAddToCart,
  useUpdateCartItem,
  useRemoveFromCart,
  useCheckout,
  useAbandonCart,
} from '@/hooks'
import { getCurrentQuantity } from '@/db/operations'
import { useQuery } from '@tanstack/react-query'
import type { Item } from '@/types'

export const Route = createFileRoute('/shopping')({
  component: Shopping,
})

function Shopping() {
  const navigate = useNavigate()
  const { data: items = [] } = useItems()
  const { data: cart } = useActiveCart()
  const { data: cartItems = [] } = useCartItems(cart?.id)
  const addToCart = useAddToCart()
  const updateCartItem = useUpdateCartItem()
  const removeFromCart = useRemoveFromCart()
  const checkout = useCheckout()
  const abandonCart = useAbandonCart()

  const itemsNeedingRefill = items.filter((item) => {
    const cartItem = cartItems.find((ci) => ci.itemId === item.id)
    return !cartItem // Show items not yet in cart
  })

  const cartTotal = cartItems.reduce((sum, ci) => sum + ci.quantity, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Shopping</h1>
        {cartItems.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (cart && confirm('Abandon this shopping trip?')) {
                abandonCart.mutate(cart.id, {
                  onSuccess: () => navigate({ to: '/' }),
                })
              }
            }}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        )}
      </div>

      {cartItems.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Cart ({cartTotal} items)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cartItems.map((cartItem) => {
              const item = items.find((i) => i.id === cartItem.itemId)
              if (!item) return null
              return (
                <ShoppingCartItem
                  key={cartItem.id}
                  item={item}
                  cartItem={cartItem}
                  onUpdateQuantity={(qty) =>
                    updateCartItem.mutate({ cartItemId: cartItem.id, quantity: qty })
                  }
                  onRemove={() => removeFromCart.mutate(cartItem.id)}
                />
              )
            })}
            <Button
              className="w-full mt-4"
              onClick={() => {
                if (cart) {
                  checkout.mutate(cart.id, {
                    onSuccess: () => navigate({ to: '/' }),
                  })
                }
              }}
            >
              Checkout
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="font-medium text-muted-foreground mb-2">Suggested Items</h2>
        <div className="space-y-2">
          {itemsNeedingRefill.map((item) => (
            <ShoppingItemWithQuantity
              key={item.id}
              item={item}
              cartItem={cartItems.find((ci) => ci.itemId === item.id)}
              onAddToCart={() => {
                if (cart) {
                  addToCart.mutate({
                    cartId: cart.id,
                    itemId: item.id,
                    quantity: Math.max(1, item.targetQuantity - item.refillThreshold),
                  })
                }
              }}
              onUpdateQuantity={(qty) => {
                const ci = cartItems.find((c) => c.itemId === item.id)
                if (ci) {
                  updateCartItem.mutate({ cartItemId: ci.id, quantity: qty })
                }
              }}
              onRemove={() => {
                const ci = cartItems.find((c) => c.itemId === item.id)
                if (ci) {
                  removeFromCart.mutate(ci.id)
                }
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ShoppingItemWithQuantity({
  item,
  cartItem,
  onAddToCart,
  onUpdateQuantity,
  onRemove,
}: {
  item: Item
  cartItem?: { id: string; quantity: number }
  onAddToCart: () => void
  onUpdateQuantity: (qty: number) => void
  onRemove: () => void
}) {
  const { data: quantity = 0 } = useQuery({
    queryKey: ['items', item.id, 'quantity'],
    queryFn: () => getCurrentQuantity(item.id),
  })

  return (
    <ShoppingItemCard
      item={item}
      currentQuantity={quantity}
      cartItem={cartItem as any}
      onAddToCart={onAddToCart}
      onUpdateQuantity={onUpdateQuantity}
      onRemove={onRemove}
    />
  )
}

function ShoppingCartItem({
  item,
  cartItem,
  onUpdateQuantity,
  onRemove,
}: {
  item: Item
  cartItem: { id: string; quantity: number }
  onUpdateQuantity: (qty: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span>{item.name}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            if (cartItem.quantity <= 1) {
              onRemove()
            } else {
              onUpdateQuantity(cartItem.quantity - 1)
            }
          }}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-6 text-center text-sm">{cartItem.quantity}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onUpdateQuantity(cartItem.quantity + 1)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
```

**Step 3: Verify in browser**

Navigate to /shopping. Expected: Shopping view with suggested items and cart

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add shopping mode with cart"
```

---

## Phase 7: Settings & Tags

### Task 7.1: Create Settings Page

**Files:**
- Create: `src/routes/settings/index.tsx`

**Step 1: Create settings index route**

Create `src/routes/settings/index.tsx`:

```typescript
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight, Tags } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

function Settings() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-2">
        <Link to="/settings/tags">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Tags className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Tags</p>
                  <p className="text-sm text-muted-foreground">
                    Manage tag types and tags
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add settings page"
```

---

### Task 7.2: Create Tag Management Page

**Files:**
- Create: `src/routes/settings/tags.tsx`

**Step 1: Create tags route**

Create `src/routes/settings/tags.tsx`:

```typescript
import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  useTagTypes,
  useCreateTagType,
  useDeleteTagType,
  useTags,
  useCreateTag,
  useDeleteTag,
} from '@/hooks/useTags'

export const Route = createFileRoute('/settings/tags')({
  component: TagSettings,
})

function TagSettings() {
  const navigate = useNavigate()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: tags = [] } = useTags()
  const createTagType = useCreateTagType()
  const deleteTagType = useDeleteTagType()
  const createTag = useCreateTag()
  const deleteTag = useDeleteTag()

  const [newTagTypeName, setNewTagTypeName] = useState('')
  const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')

  const handleAddTagType = () => {
    if (newTagTypeName.trim()) {
      createTagType.mutate({ name: newTagTypeName.trim() })
      setNewTagTypeName('')
    }
  }

  const handleAddTag = () => {
    if (addTagDialog && newTagName.trim()) {
      createTag.mutate({
        name: newTagName.trim(),
        typeId: addTagDialog,
        color: newTagColor,
      })
      setNewTagName('')
      setAddTagDialog(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: '/settings' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Tags</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Tag Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="e.g., Ingredient type, Storage method"
              value={newTagTypeName}
              onChange={(e) => setNewTagTypeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTagType()}
            />
            <Button onClick={handleAddTagType}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {tagTypes.map((tagType) => {
        const typeTags = tags.filter((t) => t.typeId === tagType.id)

        return (
          <Card key={tagType.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{tagType.name}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setAddTagDialog(tagType.id)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${tagType.name}" and all its tags?`)) {
                        // Delete all tags of this type first
                        typeTags.forEach((t) => deleteTag.mutate(t.id))
                        deleteTagType.mutate(tagType.id)
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {typeTags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags yet</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {typeTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      style={tag.color ? { backgroundColor: tag.color } : undefined}
                      className="group cursor-pointer"
                      onClick={() => {
                        if (confirm(`Delete tag "${tag.name}"?`)) {
                          deleteTag.mutate(tag.id)
                        }
                      }}
                    >
                      {tag.name}
                      <Trash2 className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100" />
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      <Dialog open={!!addTagDialog} onOpenChange={(open) => !open && setAddTagDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tagName">Name</Label>
              <Input
                id="tagName"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="e.g., Dairy, Frozen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagColor">Color</Label>
              <div className="flex gap-2">
                <Input
                  id="tagColor"
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  placeholder="#3b82f6"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTagDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleAddTag}>Add Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

**Step 2: Verify in browser**

Navigate to /settings/tags. Expected: Tag management interface

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add tag management page"
```

---

## Phase 8: Final Polish

### Task 8.1: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update with development commands**

Update `CLAUDE.md` with actual dev commands and architecture info.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with development info"
```

---

### Task 8.2: Run Full Test Suite

**Step 1: Run all tests**

Run:
```bash
pnpm test
```

Expected: All tests pass

**Step 2: Run type check**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 3: Run linter**

Run:
```bash
pnpmlint
```

Expected: No errors

---

### Task 8.3: Final Commit and Summary

**Step 1: Verify app works end-to-end**

- Create a tag type and tags
- Create an item with tags
- Add/consume inventory from pantry view
- Use shopping mode to add items to cart and checkout
- View item history

**Step 2: Create summary commit if any files changed**

```bash
git add -A
git commit -m "chore: final polish and cleanup"
```
