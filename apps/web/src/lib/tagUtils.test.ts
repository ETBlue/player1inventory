import { describe, expect, it } from 'vitest'
import type { Tag } from '@/types'
import { getTagAndDescendantIds, getTagDepth } from './tagUtils'

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
