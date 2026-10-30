import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test/utils'
import type { Item, Recipe, Tag, TagType, Vendor } from '@/types'
import { TagColor } from '@/types'
import { ItemFilters } from '.'

// Mock the URL/filter state hook so tests can control selected filter IDs
vi.mock('@/hooks/useUrlSearchAndFilters', () => ({
  useUrlSearchAndFilters: vi.fn(() => ({
    filterState: {},
    setFilterState: vi.fn(),
    selectedVendorIds: [],
    selectedRecipeIds: [],
    toggleVendorId: vi.fn(),
    toggleRecipeId: vi.fn(),
    clearVendorIds: vi.fn(),
    clearRecipeIds: vi.fn(),
  })),
}))

// Mock tag hooks so tests don't need a real IndexedDB
vi.mock('@/hooks/useTags', () => ({
  useTagTypes: vi.fn(() => ({ data: [] })),
  useTags: vi.fn(() => ({ data: [] })),
  useTagsWithDepth: vi.fn(() => ({ data: [] })),
}))

const { useUrlSearchAndFilters } = await import(
  '@/hooks/useUrlSearchAndFilters'
)
const { useTagTypes, useTags, useTagsWithDepth } = await import(
  '@/hooks/useTags'
)

// `useTagTypes`, `useTags` and `useTagsWithDepth` all return
// `{ data, isLoading, isError }` (useTags.ts:55-70, :96-108, :261). The mocks
// here returned `{ data }` alone, so the two flags came back `undefined` where
// the hook declares `boolean`. Both are `false` for a settled, successful read,
// which is the state every test in this file describes.
const QUERY_RESULT = <T,>(data: T) => ({
  data,
  isLoading: false,
  isError: false,
})

const mockVendors: Vendor[] = [
  { id: 'v1', name: 'Costco', createdAt: new Date() },
  { id: 'v2', name: 'Safeway', createdAt: new Date() },
  { id: 'v3', name: "Trader Joe's", createdAt: new Date() },
]

const mockRecipes: Recipe[] = [
  {
    id: 'r1',
    name: 'Pancakes',
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'r2',
    name: 'Grilled Cheese',
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

// `ItemFilters`' `items` prop is `Item[]` (ItemFilters.tsx:21) — the global
// catalog row, used only to work out which tag options are available. The four
// quantity fields this fixture used to carry (`targetQuantity`,
// `refillThreshold`, `packedQuantity`, `unpackedQuantity`) are per-location
// `ItemStock` state and have not been on `Item` since v15. `ItemFilters.tsx`
// reads none of them, so they are dropped rather than moved.
const mockItems: Item[] = [
  {
    id: 'item-1',
    name: 'Milk',
    tagIds: ['tag-1'],
    vendorIds: [],
    targetUnit: 'package',
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe('ItemFilters count badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to defaults (no selection)
    vi.mocked(useUrlSearchAndFilters).mockReturnValue({
      filterState: {},
      setFilterState: vi.fn(),
      selectedVendorIds: [],
      selectedRecipeIds: [],
      toggleVendorId: vi.fn(),
      toggleRecipeId: vi.fn(),
      clearVendorIds: vi.fn(),
      clearRecipeIds: vi.fn(),
      search: '',
      isFiltersVisible: false,
      isTagsVisible: false,
      setSearch: vi.fn(),
      setIsFiltersVisible: vi.fn(),
      setIsTagsVisible: vi.fn(),
      clearAllFilters: vi.fn(),
    })
    vi.mocked(useTagTypes).mockReturnValue(QUERY_RESULT([]))
    vi.mocked(useTags).mockReturnValue(QUERY_RESULT([]))
    vi.mocked(useTagsWithDepth).mockReturnValue(QUERY_RESULT([]))
  })

  it('user can see vendor count badge when vendors are selected', async () => {
    // Given two vendors are selected
    vi.mocked(useUrlSearchAndFilters).mockReturnValue({
      filterState: {},
      setFilterState: vi.fn(),
      selectedVendorIds: ['v1', 'v2'],
      selectedRecipeIds: [],
      toggleVendorId: vi.fn(),
      toggleRecipeId: vi.fn(),
      clearVendorIds: vi.fn(),
      clearRecipeIds: vi.fn(),
      search: '',
      isFiltersVisible: false,
      isTagsVisible: false,
      setSearch: vi.fn(),
      setIsFiltersVisible: vi.fn(),
      setIsTagsVisible: vi.fn(),
      clearAllFilters: vi.fn(),
    })

    // When the filter bar renders with vendors
    await renderWithRouter(
      <ItemFilters items={mockItems} vendors={mockVendors} />,
    )

    // Then the count badge shows "2" next to the Vendors trigger
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('user can see recipe count badge when recipes are selected', async () => {
    // Given one recipe is selected
    vi.mocked(useUrlSearchAndFilters).mockReturnValue({
      filterState: {},
      setFilterState: vi.fn(),
      selectedVendorIds: [],
      selectedRecipeIds: ['r1'],
      toggleVendorId: vi.fn(),
      toggleRecipeId: vi.fn(),
      clearVendorIds: vi.fn(),
      clearRecipeIds: vi.fn(),
      search: '',
      isFiltersVisible: false,
      isTagsVisible: false,
      setSearch: vi.fn(),
      setIsFiltersVisible: vi.fn(),
      setIsTagsVisible: vi.fn(),
      clearAllFilters: vi.fn(),
    })

    // When the filter bar renders with recipes
    await renderWithRouter(
      <ItemFilters items={mockItems} recipes={mockRecipes} />,
    )

    // Then the count badge shows "1" next to the Recipes trigger
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('user can see tag count badge when tags are selected', async () => {
    // Given a tag type with two tags exists and two tags are selected
    // `TagColor` has no `neutral` member and `TagType` has no `createdAt`
    // field, so both were drift. The badge count this test asserts does not
    // depend on the colour at all — `teal` is picked only because it is not
    // `createTagType`'s fallback of `TagColor.blue`, so the value stays
    // distinguishable from a default. Same for `Tag`, which has no `createdAt`.
    const mockTagType: TagType = {
      id: 'tt-1',
      name: 'Category',
      color: TagColor.teal,
    }
    const mockTag1: Tag = { id: 'tag-1', name: 'Dairy', typeId: 'tt-1' }
    const mockTag2: Tag = { id: 'tag-2', name: 'Produce', typeId: 'tt-1' }
    vi.mocked(useTagTypes).mockReturnValue(QUERY_RESULT([mockTagType]))
    vi.mocked(useTags).mockReturnValue(QUERY_RESULT([mockTag1, mockTag2]))
    vi.mocked(useTagsWithDepth).mockReturnValue(
      QUERY_RESULT([
        { ...mockTag1, depth: 0 },
        { ...mockTag2, depth: 0 },
      ]),
    )
    vi.mocked(useUrlSearchAndFilters).mockReturnValue({
      filterState: { 'tt-1': ['tag-1', 'tag-2'] },
      setFilterState: vi.fn(),
      selectedVendorIds: [],
      selectedRecipeIds: [],
      toggleVendorId: vi.fn(),
      toggleRecipeId: vi.fn(),
      clearVendorIds: vi.fn(),
      clearRecipeIds: vi.fn(),
      search: '',
      isFiltersVisible: false,
      isTagsVisible: false,
      setSearch: vi.fn(),
      setIsFiltersVisible: vi.fn(),
      setIsTagsVisible: vi.fn(),
      clearAllFilters: vi.fn(),
    })

    // When the filter bar renders
    await renderWithRouter(<ItemFilters items={mockItems} />)

    // Then the count badge shows "2" next to the tag type trigger
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('user sees no vendor badge when no vendors are selected', async () => {
    // Given no vendors are selected (default)
    // When the filter bar renders with vendors
    await renderWithRouter(
      <ItemFilters items={mockItems} vendors={mockVendors} />,
    )

    // Then no count badge is present in the Vendors trigger
    // (The only numbers that could appear are item counts in the dropdown, which aren't rendered yet)
    const vendorsButton = screen.getByText('Vendors').closest('button')
    expect(vendorsButton).toBeInTheDocument()
    // No badge span with a number inside the button
    const badgeSpan = vendorsButton?.querySelector('span.font-semibold')
    expect(badgeSpan).toBeNull()
  })
})
