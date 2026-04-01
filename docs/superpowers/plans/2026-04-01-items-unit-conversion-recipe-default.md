# Items — Unit Conversion Recipe Default Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an item's target unit is toggled between package and measurement mode, recipe `defaultAmount` values are updated using a ratio-based formula (`amountPerPackage`) snapped to the nearest `consumeAmount` multiple — in both directions.

**Architecture:** Add a new `calcRecipeDefaultAfterUnitSwitch` helper alongside the existing `calcNewDefault` in `items/$id/index.tsx`. Refactor `handleSubmit` to detect `targetUnit` changes and route to the new helper instead of the snap formula. Tests go in a new `describe` block in `$id.test.tsx`.

**Tech Stack:** React 19, TanStack Query, Dexie.js (IndexedDB), Vitest, React Testing Library, `@testing-library/user-event`

---

## File Map

| File | Change |
|------|--------|
| `apps/web/src/routes/items/$id/index.tsx` | Add `calcRecipeDefaultAfterUnitSwitch`; refactor `handleSubmit` |
| `apps/web/src/routes/items/$id.test.tsx` | Add new `describe('targetUnit change — recipe adjustment')` block |

---

### Task 1: Write failing tests

**Files:**
- Modify: `apps/web/src/routes/items/$id.test.tsx` (append after line 1448, end of file)

- [ ] **Step 1: Append the new describe block**

Add the following at the end of `apps/web/src/routes/items/$id.test.tsx`:

```ts
describe('targetUnit change — recipe adjustment', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemDetailPage = async (itemId: string) => {
    // Pre-seed the recipes query cache so useRecipes() returns data synchronously on mount,
    // eliminating race conditions between the item loading and the recipe data being available.
    await queryClient.prefetchQuery({
      queryKey: ['recipes'],
      queryFn: getRecipes,
    })

    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user can switch measurement to package and recipe defaultAmount converts via amountPerPackage ratio', async () => {
    const user = userEvent.setup()

    // Given an item tracked in measurement: consumeAmount 100g, amountPerPackage 500
    const item = await createItem({
      name: 'Flour',
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      targetQuantity: 1000,
      refillThreshold: 200,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 100,
      tagIds: [],
    })
    // And a recipe using 500g (= 1 pack) per serving
    const recipe = await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 500 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Flour'))

    // When user toggles track in measurement OFF (switching to package mode)
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a confirm dialog appears listing the affected recipe
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText('Bread')).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then recipe defaultAmount converts: 500g / 500 = 1 pack, snapped to consumeAmount 0.2
    // calcRecipeDefaultAfterUnitSwitch(500, 500, 'package', 0.2):
    //   ratio = 500/500 = 1; nearest = round(1/0.2)*0.2 = 5*0.2 = 1.0
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const ri = updated?.items.find((r) => r.itemId === item.id)
      expect(ri?.defaultAmount).toBe(1)
    })
  })

  it('user can switch package to measurement and recipe defaultAmount converts via amountPerPackage ratio', async () => {
    const user = userEvent.setup()

    // Given an item tracked in package: consumeAmount 1 pack, amountPerPackage 500
    // (measurementUnit and amountPerPackage must be pre-filled so form can submit)
    const item = await createItem({
      name: 'Flour',
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    // And a recipe using 2 packs per serving
    const recipe = await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Flour'))

    // When user toggles track in measurement ON (switching to measurement mode)
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a confirm dialog appears
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText('Bread')).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then recipe defaultAmount converts: 2 packs * 500g = 1000g, snapped to consumeAmount 500
    // calcRecipeDefaultAfterUnitSwitch(2, 500, 'measurement', 500):
    //   ratio = 2*500 = 1000; nearest = round(1000/500)*500 = 2*500 = 1000
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const ri = updated?.items.find((r) => r.itemId === item.id)
      expect(ri?.defaultAmount).toBe(1000)
    })
  })

  it('recipe with defaultAmount 0 is not affected by unit switch', async () => {
    const user = userEvent.setup()

    // Given an item in measurement mode and a recipe with defaultAmount 0 (optional ingredient)
    const item = await createItem({
      name: 'Salt',
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      targetQuantity: 500,
      refillThreshold: 100,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 5,
      tagIds: [],
    })
    await createRecipe({
      name: 'Soup',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Salt'))

    // When user switches to package mode and saves
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then NO dialog appears (defaultAmount 0 is unchanged)
    // calcRecipeDefaultAfterUnitSwitch(0, ...) returns 0 early → 0 === 0 → skip
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.targetUnit).toBe('package')
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('no dialog when unit switch produces same defaultAmount', async () => {
    const user = userEvent.setup()

    // Given an item with amountPerPackage 1 (1:1 ratio, e.g. 1L per bottle)
    // consumeAmount 0.5L; recipe defaultAmount 2 (= 2L per serving)
    // Switch to package: ratio = 2/1 = 2; nearest = round(2/0.5)*0.5 = 4*0.5 = 2 (unchanged)
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 0.5,
      tagIds: [],
    })
    await createRecipe({
      name: 'Smoothie',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Milk'))

    // When user switches to package mode and saves
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then NO dialog appears (converted value equals old defaultAmount)
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.targetUnit).toBe('package')
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the new tests to verify tests 1 and 2 fail, tests 3 and 4 pass**

```bash
(cd apps/web && pnpm test --run src/routes/items/\$id.test.tsx 2>&1 | tail -40)
```

Expected: tests 1 and 2 fail; tests 3 and 4 pass. Confirm the failure message for test 1 is something like "Expected alertdialog to be in the document" and for test 2 "Expected 1000 but received 500".

---

### Task 2: Add helper and refactor `handleSubmit`

**Files:**
- Modify: `apps/web/src/routes/items/$id/index.tsx` (lines 116–186)

- [ ] **Step 1: Add `calcRecipeDefaultAfterUnitSwitch` after `calcNewDefault`**

In `apps/web/src/routes/items/$id/index.tsx`, after line 120 (end of `calcNewDefault`), insert:

```ts
function calcRecipeDefaultAfterUnitSwitch(
  oldDefault: number,
  amountPerPackage: number,
  newTargetUnit: 'measurement' | 'package',
  newConsumeAmount: number,
): number {
  if (oldDefault === 0) return 0
  const ratio =
    newTargetUnit === 'measurement'
      ? oldDefault * amountPerPackage
      : oldDefault / amountPerPackage
  const nearest = Math.round(ratio / newConsumeAmount) * newConsumeAmount
  return nearest === 0 ? newConsumeAmount : nearest
}
```

- [ ] **Step 2: Refactor `handleSubmit` to use `targetUnitChanged` and the new helper**

Replace the existing `handleSubmit` (lines 156–186) with:

```ts
const handleSubmit = async (values: ItemFormValues) => {
  const oldConsumeAmount = item.consumeAmount ?? 1
  const newConsumeAmount = values.consumeAmount
  const targetUnitChanged = item.targetUnit !== values.targetUnit

  const buildAdjustments = (): Adjustment[] => {
    if (!allRecipes) return []
    const affectedRecipes = allRecipes.filter((r) =>
      r.items.some((ri) => ri.itemId === id),
    )
    if (targetUnitChanged) {
      return affectedRecipes.flatMap((r) => {
        const ri = r.items.find((ri) => ri.itemId === id)
        if (!ri) return []
        const newDefault = calcRecipeDefaultAfterUnitSwitch(
          ri.defaultAmount,
          Number(values.amountPerPackage),
          values.targetUnit,
          newConsumeAmount,
        )
        if (newDefault === ri.defaultAmount) return []
        return [
          {
            recipeId: r.id,
            recipeName: r.name,
            oldAmount: ri.defaultAmount,
            newAmount: newDefault,
          },
        ]
      })
    }
    if (oldConsumeAmount !== newConsumeAmount) {
      return affectedRecipes.flatMap((r) => {
        const ri = r.items.find((ri) => ri.itemId === id)
        if (!ri) return []
        const newDefault = calcNewDefault(ri.defaultAmount, newConsumeAmount)
        if (newDefault === ri.defaultAmount) return []
        return [
          {
            recipeId: r.id,
            recipeName: r.name,
            oldAmount: ri.defaultAmount,
            newAmount: newDefault,
          },
        ]
      })
    }
    return []
  }

  const affected = buildAdjustments()
  if (affected.length > 0) {
    setPendingFormValues(values)
    setPendingAdjustments(affected)
    return
  }

  await doSave(values)
}
```

- [ ] **Step 3: Run all tests in the file to verify all pass**

```bash
(cd apps/web && pnpm test --run src/routes/items/\$id.test.tsx 2>&1 | tail -40)
```

Expected: all tests pass, 0 failures.

- [ ] **Step 4: Run the full quality gate**

```bash
(cd apps/web && pnpm lint) && \
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log && \
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK: no deprecated imports"
```

Expected: lint passes, build succeeds, no TS6385 warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/items/\$id/index.tsx apps/web/src/routes/items/\$id.test.tsx
git commit -m "$(cat <<'EOF'
feat(items): update recipe defaultAmount when target unit changes

When switching between package/measurement modes, recipe defaultAmount
values now convert via amountPerPackage ratio (snapped to consumeAmount
multiple) in both directions. Previously, the measurement→package
direction produced no dialog because the snap formula returned the
unchanged value.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
