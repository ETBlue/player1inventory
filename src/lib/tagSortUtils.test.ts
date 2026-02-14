import { describe, expect, it } from 'vitest'
import type { Tag } from '@/types'
import { sortTagsByName } from './tagSortUtils'

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
