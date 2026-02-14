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
export function sortTagsByTypeAndName(
  tags: Tag[],
  _tagTypes: TagType[],
): Tag[] {
  // TODO: Implement in next step
  return tags
}
