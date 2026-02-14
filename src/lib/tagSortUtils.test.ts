import { describe, expect, it } from 'vitest'
import type { Tag, TagType } from '@/types'
import { TagColor } from '@/types'
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

describe('sortTagsByTypeAndName', () => {
  it('sorts by tag type name first, then tag name', () => {
    const tagTypes: TagType[] = [
      { id: 'type1', name: 'Storage', color: TagColor.blue },
      { id: 'type2', name: 'Category', color: TagColor.green },
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
      { id: 'type1', name: 'storage', color: TagColor.blue },
      { id: 'type2', name: 'Category', color: TagColor.green },
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
      { id: 'type1', name: 'Category', color: TagColor.blue },
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
      { id: 'type1', name: 'Category', color: TagColor.blue },
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
