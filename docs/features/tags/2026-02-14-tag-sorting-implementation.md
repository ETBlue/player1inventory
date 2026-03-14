# Tag Sorting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement consistent tag sorting across the application (alphabetically by name in tag type contexts, by tag type then name in item cards).

**Architecture:** Create reusable sorting utility functions in `src/lib/tagSortUtils.ts` and integrate them into ItemCard, ItemFilters, and settings/tags components. Follow TDD approach with comprehensive unit tests.

**Tech Stack:** TypeScript, Vitest, React Testing Library

---

## Task 1: Create Tag Sorting Utilities

**Files:**
- Create: `src/lib/tagSortUtils.ts`
- Create: `src/lib/tagSortUtils.test.ts`

**Step 1: Write failing tests for sortTagsByName**

Create `src/lib/tagSortUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { Tag } from '@/types'
import { sortTagsByName, sortTagsByTypeAndName } from './tagSortUtils'

describe('sortTagsByName', () => {
  it('sorts tags alphabetically by name', () => {
    const tags: Tag[] = [
      { id: '1', name: 'Zebra', typeId: 'type1' },
      { id: '2', name: 'Apple', typeId: 'type1' },
      { id: '3', name: 'Mango', typeId: 'type1' },
    ]

    const result = sortTagsByName(tags)

    expect(result[0].name).toBe('Apple')
    expect(result[1].name).toBe('Mango')
    expect(result[2].name).toBe('Zebra')
  })

  it('sorts case-insensitively', () => {
    const tags: Tag[] = [
      { id: '1', name: 'banana', typeId: 'type1' },
      { id: '2', name: 'Apple', typeId: 'type1' },
      { id: '3', name: 'Cherry', typeId: 'type1' },
    ]

    const result = sortTagsByName(tags)

    expect(result[0].name).toBe('Apple')
    expect(result[1].name).toBe('banana')
    expect(result[2].name).toBe('Cherry')
  })

  it('handles empty array', () => {
    const result = sortTagsByName([])
    expect(result).toEqual([])
  })

  it('returns new array without mutating original', () => {
    const tags: Tag[] = [
      { id: '1', name: 'Zebra', typeId: 'type1' },
      { id: '2', name: 'Apple', typeId: 'type1' },
    ]

    const result = sortTagsByName(tags)

    expect(result).not.toBe(tags)
    expect(tags[0].name).toBe('Zebra') // Original unchanged
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test tagSortUtils
```

Expected: FAIL - module not found

**Step 3: Write minimal implementation for sortTagsByName**

Create `src/lib/tagSortUtils.ts`:

```typescript
import type { Tag, TagType } from '@/types'

/**
 * Sort tags alphabetically by name (case-insensitive, ascending)
 */
export function sortTagsByName(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )
}

/**
 * Sort tags by tag type name, then by tag name (both case-insensitive, ascending)
 */
export function sortTagsByTypeAndName(tags: Tag[], tagTypes: TagType[]): Tag[] {
  // TODO: Implement in next step
  return tags
}
```

**Step 4: Run tests to verify sortTagsByName passes**

```bash
pnpm test tagSortUtils
```

Expected: 4 tests pass for sortTagsByName

**Step 5: Commit sortTagsByName**

```bash
git add src/lib/tagSortUtils.ts src/lib/tagSortUtils.test.ts
git commit -m "feat(tags): add sortTagsByName utility with tests

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Implement sortTagsByTypeAndName

**Files:**
- Modify: `src/lib/tagSortUtils.ts`
- Modify: `src/lib/tagSortUtils.test.ts`

**Step 1: Write failing tests for sortTagsByTypeAndName**

Add to `src/lib/tagSortUtils.test.ts`:

```typescript
describe('sortTagsByTypeAndName', () => {
  it('sorts by tag type name first, then tag name', () => {
    const tagTypes: TagType[] = [
      { id: 'type1', name: 'Storage', color: 'blue' as any },
      { id: 'type2', name: 'Category', color: 'green' as any },
    ]

    const tags: Tag[] = [
      { id: '1', name: 'Pantry', typeId: 'type1' },
      { id: '2', name: 'Vegetable', typeId: 'type2' },
      { id: '3', name: 'Fridge', typeId: 'type1' },
      { id: '4', name: 'Fruit', typeId: 'type2' },
    ]

    const result = sortTagsByTypeAndName(tags, tagTypes)

    // Category comes before Storage alphabetically
    expect(result[0].name).toBe('Fruit') // Category type
    expect(result[1].name).toBe('Vegetable') // Category type
    expect(result[2].name).toBe('Fridge') // Storage type
    expect(result[3].name).toBe('Pantry') // Storage type
  })

  it('sorts both tag type and tag name case-insensitively', () => {
    const tagTypes: TagType[] = [
      { id: 'type1', name: 'storage', color: 'blue' as any },
      { id: 'type2', name: 'Category', color: 'green' as any },
    ]

    const tags: Tag[] = [
      { id: '1', name: 'pantry', typeId: 'type1' },
      { id: '2', name: 'Vegetable', typeId: 'type2' },
      { id: '3', name: 'Fridge', typeId: 'type1' },
    ]

    const result = sortTagsByTypeAndName(tags, tagTypes)

    // Category before storage (case-insensitive)
    expect(result[0].name).toBe('Vegetable')
    expect(result[1].name).toBe('Fridge') // F before p
    expect(result[2].name).toBe('pantry')
  })

  it('handles tags with missing typeId', () => {
    const tagTypes: TagType[] = [
      { id: 'type1', name: 'Category', color: 'blue' as any },
    ]

    const tags: Tag[] = [
      { id: '1', name: 'Valid', typeId: 'type1' },
      { id: '2', name: 'Invalid', typeId: 'nonexistent' },
    ]

    const result = sortTagsByTypeAndName(tags, tagTypes)

    // Valid type should come first
    expect(result[0].name).toBe('Valid')
    expect(result[1].name).toBe('Invalid')
  })

  it('handles empty arrays', () => {
    const result = sortTagsByTypeAndName([], [])
    expect(result).toEqual([])
  })

  it('returns new array without mutating original', () => {
    const tagTypes: TagType[] = [
      { id: 'type1', name: 'Category', color: 'blue' as any },
    ]

    const tags: Tag[] = [
      { id: '1', name: 'Zebra', typeId: 'type1' },
      { id: '2', name: 'Apple', typeId: 'type1' },
    ]

    const result = sortTagsByTypeAndName(tags, tagTypes)

    expect(result).not.toBe(tags)
    expect(tags[0].name).toBe('Zebra') // Original unchanged
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test tagSortUtils
```

Expected: 5 new tests FAIL - sortTagsByTypeAndName returns unsorted

**Step 3: Implement sortTagsByTypeAndName**

Update `src/lib/tagSortUtils.ts`:

```typescript
/**
 * Sort tags by tag type name, then by tag name (both case-insensitive, ascending)
 */
export function sortTagsByTypeAndName(tags: Tag[], tagTypes: TagType[]): Tag[] {
  // Create map for O(1) typeId lookup
  const typeMap = new Map(tagTypes.map(type => [type.id, type]))

  return [...tags].sort((a, b) => {
    const typeA = typeMap.get(a.typeId)
    const typeB = typeMap.get(b.typeId)

    // Handle missing type: sort to end
    if (!typeA && !typeB) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }
    if (!typeA) return 1
    if (!typeB) return -1

    // Compare tag type names first
    const typeComparison = typeA.name.localeCompare(
      typeB.name,
      undefined,
      { sensitivity: 'base' }
    )

    if (typeComparison !== 0) {
      return typeComparison
    }

    // If same type, compare tag names
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}
```

**Step 4: Run tests to verify all tests pass**

```bash
pnpm test tagSortUtils
```

Expected: All 9 tests PASS

**Step 5: Commit sortTagsByTypeAndName**

```bash
git add src/lib/tagSortUtils.ts src/lib/tagSortUtils.test.ts
git commit -m "feat(tags): add sortTagsByTypeAndName utility with tests

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Update ItemCard Component

**Files:**
- Modify: `src/components/ItemCard.tsx:133`

**Step 1: Import and use sortTagsByTypeAndName**

Update `src/components/ItemCard.tsx`:

```typescript
// Add import at top
import { sortTagsByTypeAndName } from '@/lib/tagSortUtils'

// Replace lines 131-154 (the tags rendering section)
        {tags.length > 0 && showTags && (
          <div className="flex flex-wrap gap-1 mt-2">
            {sortTagsByTypeAndName(tags, tagTypes).map((tag) => {
              const tagType = tagTypes.find((t) => t.id === tag.typeId)
              const bgColor = tagType?.color
              return (
                <Badge
                  key={tag.id}
                  variant={bgColor}
                  className={`text-xs ${onTagClick ? 'cursor-pointer' : ''}`}
                  onClick={(e) => {
                    if (onTagClick) {
                      e.preventDefault()
                      e.stopPropagation()
                      onTagClick(tag.id)
                    }
                  }}
                >
                  {tag.name}
                </Badge>
              )
            })}
          </div>
        )}
```

**Step 2: Run tests to verify no regressions**

```bash
pnpm test ItemCard
```

Expected: All existing tests PASS

**Step 3: Run Storybook to manually verify**

```bash
pnpm storybook
```

Navigate to ItemCard stories and verify tags are sorted by type then name.

**Step 4: Commit ItemCard changes**

```bash
git add src/components/ItemCard.tsx
git commit -m "feat(tags): sort tags by type and name in ItemCard

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update ItemFilters Component

**Files:**
- Modify: `src/components/ItemFilters.tsx:68-80`

**Step 1: Import and use sortTagsByName**

Update `src/components/ItemFilters.tsx`:

```typescript
// Add import at top
import { sortTagsByName } from '@/lib/tagSortUtils'

// Replace lines 66-87 (the tagTypesWithTags.map section)
        {tagTypesWithTags.map((tagType) => {
          const tagTypeId = tagType.id
          const typeTags = tags.filter((tag) => tag.typeId === tagTypeId)
          const sortedTypeTags = sortTagsByName(typeTags)
          const selectedTagIds = filterState[tagTypeId] || []

          // Calculate dynamic counts for each tag
          const tagCounts = sortedTypeTags.map((tag) =>
            calculateTagCount(tag.id, tagTypeId, items, filterState),
          )

          return (
            <TagTypeDropdown
              key={tagTypeId}
              tagType={tagType}
              tags={sortedTypeTags}
              selectedTagIds={selectedTagIds}
              tagCounts={tagCounts}
              onToggleTag={(tagId) => handleToggleTag(tagTypeId, tagId)}
              onClear={() => handleClearTagType(tagTypeId)}
            />
          )
        })}
```

**Step 2: Run tests to verify no regressions**

```bash
pnpm test ItemFilters
```

Expected: All existing tests PASS

**Step 3: Run dev server to manually verify**

```bash
pnpm dev
```

Navigate to main page and verify tags in dropdown are sorted alphabetically.

**Step 4: Commit ItemFilters changes**

```bash
git add src/components/ItemFilters.tsx
git commit -m "feat(tags): sort tags alphabetically in filter dropdowns

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update Settings Tags Page

**Files:**
- Modify: `src/routes/settings/tags.tsx:161-226`

**Step 1: Import and use sortTagsByName**

Update `src/routes/settings/tags.tsx`:

```typescript
// Add import at top
import { sortTagsByName } from '@/lib/tagSortUtils'

// Replace lines 160-226 (the tagTypes.map section)
      {tagTypes.map((tagType) => {
        const typeTags = tags.filter((t) => t.typeId === tagType.id)
        const sortedTypeTags = sortTagsByName(typeTags)
        const tagTypeColor = tagType.color || TagColor.blue

        return (
          <Card key={tagType.id} className="relative">
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 bg-${tagTypeColor}`}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg capitalize">
                    {tagType.name}
                  </CardTitle>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="neutral-ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditTagType(tagType)
                      setEditTagTypeName(tagType.name)
                      setEditTagTypeColor(tagTypeColor)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="neutral-ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setTagTypeToDelete(tagType)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {sortedTypeTags.map((tag) => (
                  <TagBadge
                    key={tag.id}
                    tag={tag}
                    tagType={tagType}
                    onClick={() => {
                      setEditTag(tag)
                      setEditTagName(tag.name)
                    }}
                  />
                ))}
                <Button
                  variant="neutral-ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setAddTagDialog(tagType.id)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
```

**Step 2: Run tests to verify no regressions**

```bash
pnpm test settings/tags
```

Expected: All existing tests PASS

**Step 3: Run dev server to manually verify**

```bash
pnpm dev
```

Navigate to /settings/tags and verify tags in each section are sorted alphabetically.

**Step 4: Commit settings page changes**

```bash
git add src/routes/settings/tags.tsx
git commit -m "feat(tags): sort tags alphabetically in settings page

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add Component Integration Tests

**Files:**
- Modify: `src/components/ItemCard.test.tsx`
- Modify: `src/components/TagTypeDropdown.test.tsx`

**Step 1: Add sorting verification test to ItemCard**

Add to `src/components/ItemCard.test.tsx`:

```typescript
it('displays tags sorted by tag type name then tag name', () => {
  const tagTypes = [
    { id: 'type1', name: 'Storage', color: 'blue' as any },
    { id: 'type2', name: 'Category', color: 'green' as any },
  ]

  const tags = [
    { id: '1', name: 'Pantry', typeId: 'type1' },
    { id: '2', name: 'Vegetable', typeId: 'type2' },
    { id: '3', name: 'Fridge', typeId: 'type1' },
    { id: '4', name: 'Fruit', typeId: 'type2' },
  ]

  render(
    <ItemCard
      item={mockItem}
      quantity={5}
      tags={tags}
      tagTypes={tagTypes}
      onConsume={vi.fn()}
      onAdd={vi.fn()}
      showTags={true}
    />
  )

  const badges = screen.getAllByRole('button', { name: /Fruit|Vegetable|Fridge|Pantry/ })

  // Category type comes first (alphabetically before Storage)
  expect(badges[0]).toHaveTextContent('Fruit')
  expect(badges[1]).toHaveTextContent('Vegetable')
  // Storage type comes second
  expect(badges[2]).toHaveTextContent('Fridge')
  expect(badges[3]).toHaveTextContent('Pantry')
})
```

**Step 2: Add sorting verification test to TagTypeDropdown**

Add to `src/components/TagTypeDropdown.test.tsx`:

```typescript
it('displays tags sorted alphabetically by name', () => {
  const tags = [
    { id: '1', name: 'Zebra', typeId: 'type1' },
    { id: '2', name: 'Apple', typeId: 'type1' },
    { id: '3', name: 'Mango', typeId: 'type1' },
  ]

  render(
    <TagTypeDropdown
      tagType={mockTagType}
      tags={tags}
      selectedTagIds={[]}
      tagCounts={[1, 2, 3]}
      onToggleTag={vi.fn()}
      onClear={vi.fn()}
    />
  )

  // Open dropdown
  const trigger = screen.getByRole('button', { name: /Category/i })
  trigger.click()

  const menuItems = screen.getAllByRole('menuitemcheckbox')

  // Verify alphabetical order
  expect(menuItems[0]).toHaveTextContent('Apple')
  expect(menuItems[1]).toHaveTextContent('Mango')
  expect(menuItems[2]).toHaveTextContent('Zebra')
})
```

**Step 3: Run tests to verify they fail**

```bash
pnpm test ItemCard
pnpm test TagTypeDropdown
```

Expected: New tests FAIL - tags not in expected order (because components need to sort)

**Step 4: Verify tests pass after component updates**

Since we already updated the components in Tasks 3-5, run tests again:

```bash
pnpm test ItemCard
pnpm test TagTypeDropdown
```

Expected: All tests PASS including new sorting tests

**Step 5: Commit test additions**

```bash
git add src/components/ItemCard.test.tsx src/components/TagTypeDropdown.test.tsx
git commit -m "test(tags): add sorting verification tests for components

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Final Verification

**Files:**
- None (manual testing only)

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All tests PASS

**Step 2: Run linter**

```bash
pnpm lint
```

Expected: No lint errors

**Step 3: Run Storybook and verify visually**

```bash
pnpm storybook
```

Verify in Storybook:
- ItemCard stories show tags sorted by type then name
- TagTypeDropdown stories show tags sorted alphabetically

**Step 4: Run dev server and verify end-to-end**

```bash
pnpm dev
```

Manual verification checklist:
- [ ] Main page: Tags in filter dropdowns are alphabetically sorted
- [ ] Main page: Tags on item cards are sorted by tag type then tag name
- [ ] Settings page: Tags in each tag type section are alphabetically sorted
- [ ] Create new tags with names that test sorting (e.g., "Zebra", "Apple")
- [ ] Verify new tags appear in correct sorted position

**Step 5: Update CLAUDE.md if needed**

Check if any documentation updates are needed in CLAUDE.md. The tag sorting is an implementation detail and doesn't change the architecture or developer workflow, so likely no updates needed.

---

## Completion Checklist

- [ ] All unit tests passing
- [ ] All component tests passing
- [ ] No lint errors
- [ ] Storybook stories verified
- [ ] Manual end-to-end testing completed
- [ ] All commits follow conventional commit format
- [ ] Documentation updated if needed

## Notes

- All sorting is case-insensitive using `localeCompare` with `sensitivity: 'base'`
- Sorting functions are pure (non-mutating) - they return new arrays
- Tags with missing/invalid typeId are sorted to the end in sortTagsByTypeAndName
- Performance impact is negligible for typical tag counts (< 50 per item)
- Future optimization: memoize sorted arrays if performance becomes an issue
