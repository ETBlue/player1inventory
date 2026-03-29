import { describe, expect, it } from 'vitest'
import type { Tag } from '@/types'
import {
  buildDepthFirstTagList,
  getTagAndDescendantIds,
  getTagDepth,
} from './tagUtils'

describe('getTagAndDescendantIds', () => {
  it('returns only the tag itself when it has no children', () => {
    // Given a tag with no children
    const tags: Tag[] = [
      { id: 'a', name: 'Fruit', typeId: 'type1' },
      { id: 'b', name: 'Vegetable', typeId: 'type1' },
    ]

    // When we get the tag and descendant IDs
    const result = getTagAndDescendantIds('a', tags)

    // Then only the tag itself is returned
    expect(result).toEqual(['a'])
  })

  it('returns the tag and all direct children', () => {
    // Given a tag with two direct children
    const tags: Tag[] = [
      { id: 'a', name: 'Produce', typeId: 'type1' },
      { id: 'b', name: 'Fruit', typeId: 'type1', parentId: 'a' },
      { id: 'c', name: 'Vegetable', typeId: 'type1', parentId: 'a' },
    ]

    // When we get the tag and descendant IDs
    const result = getTagAndDescendantIds('a', tags)

    // Then the tag and its direct children are returned
    expect(result).toHaveLength(3)
    expect(result).toContain('a')
    expect(result).toContain('b')
    expect(result).toContain('c')
  })

  it('returns the tag and all descendants recursively', () => {
    // Given a tag with nested descendants (grandchildren)
    const tags: Tag[] = [
      { id: 'a', name: 'Food', typeId: 'type1' },
      { id: 'b', name: 'Produce', typeId: 'type1', parentId: 'a' },
      { id: 'c', name: 'Fruit', typeId: 'type1', parentId: 'b' },
      { id: 'd', name: 'Apple', typeId: 'type1', parentId: 'c' },
      { id: 'e', name: 'Dairy', typeId: 'type1', parentId: 'a' },
    ]

    // When we get the tag and descendant IDs
    const result = getTagAndDescendantIds('a', tags)

    // Then all descendants at every depth are included
    expect(result).toHaveLength(5)
    expect(result).toContain('a')
    expect(result).toContain('b')
    expect(result).toContain('c')
    expect(result).toContain('d')
    expect(result).toContain('e')
  })
})

describe('getTagDepth', () => {
  it('returns 0 for a top-level tag', () => {
    // Given a tag with no parentId
    const tags: Tag[] = [{ id: 'a', name: 'Food', typeId: 'type1' }]

    // When we get the tag depth
    const result = getTagDepth('a', tags)

    // Then depth is 0
    expect(result).toBe(0)
  })

  it('returns 1 for a direct child', () => {
    // Given a tag whose parent is a top-level tag
    const tags: Tag[] = [
      { id: 'a', name: 'Food', typeId: 'type1' },
      { id: 'b', name: 'Produce', typeId: 'type1', parentId: 'a' },
    ]

    // When we get the tag depth
    const result = getTagDepth('b', tags)

    // Then depth is 1
    expect(result).toBe(1)
  })

  it('returns 2 for a grandchild', () => {
    // Given a tag whose parent is a direct child (depth 1)
    const tags: Tag[] = [
      { id: 'a', name: 'Food', typeId: 'type1' },
      { id: 'b', name: 'Produce', typeId: 'type1', parentId: 'a' },
      { id: 'c', name: 'Fruit', typeId: 'type1', parentId: 'b' },
    ]

    // When we get the tag depth
    const result = getTagDepth('c', tags)

    // Then depth is 2
    expect(result).toBe(2)
  })
})

// ─── buildDepthFirstTagList ────────────────────────────────────────────────────

describe('buildDepthFirstTagList', () => {
  it('returns an empty array when given no tags', () => {
    // Given no tags
    const result = buildDepthFirstTagList([])

    // Then the result is empty
    expect(result).toEqual([])
  })

  it('returns top-level tags with depth 0', () => {
    // Given two sibling top-level tags
    const tags: Tag[] = [
      { id: 'a', name: 'Fruit', typeId: 'type1' },
      { id: 'b', name: 'Vegetable', typeId: 'type1' },
    ]

    // When we build the depth-first list
    const result = buildDepthFirstTagList(tags)

    // Then both have depth 0
    expect(result).toHaveLength(2)
    expect(result.find((t) => t.id === 'a')?.depth).toBe(0)
    expect(result.find((t) => t.id === 'b')?.depth).toBe(0)
  })

  it('emits parent before its children (depth-first order)', () => {
    // Given a parent with two children (Fruit < Vegetable alphabetically, so order preserved)
    const tags: Tag[] = [
      { id: 'parent', name: 'Produce', typeId: 'type1' },
      { id: 'child1', name: 'Fruit', typeId: 'type1', parentId: 'parent' },
      { id: 'child2', name: 'Vegetable', typeId: 'type1', parentId: 'parent' },
    ]

    // When we build the depth-first list
    const result = buildDepthFirstTagList(tags)

    // Then parent is first, children follow in alphabetical order
    expect(result[0].id).toBe('parent')
    expect(result[0].depth).toBe(0)
    expect(result[1].id).toBe('child1')
    expect(result[1].depth).toBe(1)
    expect(result[2].id).toBe('child2')
    expect(result[2].depth).toBe(1)
  })

  it('recurses into grandchildren before the next top-level sibling', () => {
    // Given: topA → childA → grandchild, topB
    const tags: Tag[] = [
      { id: 'topA', name: 'Food', typeId: 'type1' },
      { id: 'childA', name: 'Produce', typeId: 'type1', parentId: 'topA' },
      {
        id: 'grandchild',
        name: 'Fruit',
        typeId: 'type1',
        parentId: 'childA',
      },
      { id: 'topB', name: 'Non-food', typeId: 'type1' },
    ]

    // When we build the depth-first list
    const result = buildDepthFirstTagList(tags)

    // Then all descendants of topA appear before topB
    const ids = result.map((t) => t.id)
    expect(ids.indexOf('topA')).toBeLessThan(ids.indexOf('childA'))
    expect(ids.indexOf('childA')).toBeLessThan(ids.indexOf('grandchild'))
    expect(ids.indexOf('grandchild')).toBeLessThan(ids.indexOf('topB'))

    // And depths are correct
    expect(result.find((t) => t.id === 'topA')?.depth).toBe(0)
    expect(result.find((t) => t.id === 'childA')?.depth).toBe(1)
    expect(result.find((t) => t.id === 'grandchild')?.depth).toBe(2)
    expect(result.find((t) => t.id === 'topB')?.depth).toBe(0)
  })

  it('filters by typeId when provided', () => {
    // Given tags of two different types
    const tags: Tag[] = [
      { id: 'a', name: 'Fruit', typeId: 'type1' },
      { id: 'b', name: 'Vegetable', typeId: 'type1' },
      { id: 'c', name: 'Pantry', typeId: 'type2' },
    ]

    // When we build the depth-first list for type1 only
    const result = buildDepthFirstTagList(tags, 'type1')

    // Then only type1 tags are returned
    expect(result).toHaveLength(2)
    expect(result.every((t) => t.typeId === 'type1')).toBe(true)
  })

  it('treats a child whose parent is outside the filter set as top-level', () => {
    // Given a child whose parent belongs to a different typeId
    const tags: Tag[] = [
      { id: 'parent', name: 'Food', typeId: 'type1' },
      { id: 'child', name: 'Fruit', typeId: 'type2', parentId: 'parent' },
    ]

    // When we build the depth-first list for type2 only
    const result = buildDepthFirstTagList(tags, 'type2')

    // Then the child is treated as top-level (depth 0) since parent is excluded
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('child')
    expect(result[0].depth).toBe(0)
  })

  it('does not mutate the original tags array', () => {
    // Given a list of tags
    const tags: Tag[] = [
      { id: 'a', name: 'Fruit', typeId: 'type1' },
      { id: 'b', name: 'Vegetable', typeId: 'type1' },
    ]
    const originalRef = tags

    // When we build the depth-first list
    buildDepthFirstTagList(tags)

    // Then the original array is not mutated
    expect(tags).toBe(originalRef)
    expect(tags).toHaveLength(2)
  })

  describe('alphabetical ordering of top-level tags', () => {
    it('returns top-level tags in alphabetical order', () => {
      // Given tags stored in non-alphabetical order
      const tags: Tag[] = [
        { id: '1', name: 'Zucchini', typeId: 'type1' },
        { id: '2', name: 'apple', typeId: 'type1' },
        { id: '3', name: 'Banana', typeId: 'type1' },
      ]

      // When we build the depth-first list
      const result = buildDepthFirstTagList(tags)

      // Then top-level tags appear A→Z (case-insensitive)
      expect(result.map((t) => t.name)).toEqual(['apple', 'Banana', 'Zucchini'])
    })

    it('sorts top-level tags case-insensitively', () => {
      // Given tags where uppercase letters would sort differently under ASCII ordering
      const tags: Tag[] = [
        { id: '1', name: 'mango', typeId: 'type1' },
        { id: '2', name: 'Apple', typeId: 'type1' },
        { id: '3', name: 'banana', typeId: 'type1' },
      ]

      // When we build the depth-first list
      const result = buildDepthFirstTagList(tags)

      // Then Apple sorts before banana before mango (case-insensitive)
      expect(result.map((t) => t.name)).toEqual(['Apple', 'banana', 'mango'])
    })
  })

  describe('alphabetical ordering of children', () => {
    it('returns children of a parent in alphabetical order', () => {
      // Given a parent with children stored in reverse alphabetical order
      const tags: Tag[] = [
        { id: 'parent', name: 'Fruit', typeId: 'type1' },
        {
          id: 'child-z',
          name: 'Zucchini',
          typeId: 'type1',
          parentId: 'parent',
        },
        { id: 'child-a', name: 'Avocado', typeId: 'type1', parentId: 'parent' },
        { id: 'child-m', name: 'Mango', typeId: 'type1', parentId: 'parent' },
      ]

      // When we build the depth-first list
      const result = buildDepthFirstTagList(tags)

      // Then children appear A→Z after their parent
      expect(result.map((t) => t.name)).toEqual([
        'Fruit',
        'Avocado',
        'Mango',
        'Zucchini',
      ])
    })

    it('sorts children case-insensitively', () => {
      // Given a parent with mixed-case children
      const tags: Tag[] = [
        { id: 'parent', name: 'Category', typeId: 'type1' },
        { id: 'child-z', name: 'zebra', typeId: 'type1', parentId: 'parent' },
        { id: 'child-a', name: 'Apple', typeId: 'type1', parentId: 'parent' },
        { id: 'child-m', name: 'mango', typeId: 'type1', parentId: 'parent' },
      ]

      // When we build the depth-first list
      const result = buildDepthFirstTagList(tags)

      // Then children are sorted case-insensitively
      expect(result.map((t) => t.name)).toEqual([
        'Category',
        'Apple',
        'mango',
        'zebra',
      ])
    })
  })

  describe('hierarchy preservation with alphabetical sort', () => {
    it('keeps children after their parent, not mixed with root tags', () => {
      // Given two root tags where one has children
      const tags: Tag[] = [
        { id: 'root-b', name: 'Broccoli', typeId: 'type1' },
        { id: 'root-a', name: 'Apple', typeId: 'type1' },
        { id: 'child-1', name: 'Fuji', typeId: 'type1', parentId: 'root-a' },
        { id: 'child-2', name: 'Gala', typeId: 'type1', parentId: 'root-a' },
      ]

      // When we build the depth-first list
      const result = buildDepthFirstTagList(tags)

      // Then Apple sorts first, its children follow, then Broccoli
      expect(result.map((t) => t.name)).toEqual([
        'Apple',
        'Fuji',
        'Gala',
        'Broccoli',
      ])
    })

    it('preserves depth annotation after sorting', () => {
      // Given a parent and two children in reverse alphabetical order
      const tags: Tag[] = [
        { id: 'parent', name: 'Fruit', typeId: 'type1' },
        { id: 'child-1', name: 'Mango', typeId: 'type1', parentId: 'parent' },
        { id: 'child-2', name: 'Apple', typeId: 'type1', parentId: 'parent' },
      ]

      // When we build the depth-first list
      const result = buildDepthFirstTagList(tags)

      // Then depth 0 for root, depth 1 for children (sorted A→Z)
      expect(result[0]).toMatchObject({ name: 'Fruit', depth: 0 })
      expect(result[1]).toMatchObject({ name: 'Apple', depth: 1 })
      expect(result[2]).toMatchObject({ name: 'Mango', depth: 1 })
    })

    it('sorts multiple root tags and their children independently', () => {
      // Given two root tags each with children in reverse alphabetical order
      const tags: Tag[] = [
        { id: 'root-z', name: 'Vegetable', typeId: 'type1' },
        { id: 'root-a', name: 'Fruit', typeId: 'type1' },
        {
          id: 'v-child-z',
          name: 'Zucchini',
          typeId: 'type1',
          parentId: 'root-z',
        },
        {
          id: 'v-child-a',
          name: 'Artichoke',
          typeId: 'type1',
          parentId: 'root-z',
        },
        {
          id: 'f-child-z',
          name: 'Watermelon',
          typeId: 'type1',
          parentId: 'root-a',
        },
        { id: 'f-child-a', name: 'Apple', typeId: 'type1', parentId: 'root-a' },
      ]

      // When we build the depth-first list
      const result = buildDepthFirstTagList(tags)

      // Then Fruit (A) before Vegetable (V); children of each group sorted independently
      expect(result.map((t) => t.name)).toEqual([
        'Fruit',
        'Apple',
        'Watermelon',
        'Vegetable',
        'Artichoke',
        'Zucchini',
      ])
    })
  })
})
