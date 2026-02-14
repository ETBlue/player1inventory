import type { Tag, TagType } from '@/types'

/**
 * Sort tags alphabetically by name (case-insensitive, ascending)
 */
export function sortTagsByName(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}

/**
 * Sort tags by tag type name, then by tag name (both case-insensitive, ascending)
 */
export function sortTagsByTypeAndName(tags: Tag[], tagTypes: TagType[]): Tag[] {
  // Create map for O(1) typeId lookup
  const typeMap = new Map(tagTypes.map((type) => [type.id, type]))

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
    const typeComparison = typeA.name.localeCompare(typeB.name, undefined, {
      sensitivity: 'base',
    })

    if (typeComparison !== 0) {
      return typeComparison
    }

    // If same type, compare tag names
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}
