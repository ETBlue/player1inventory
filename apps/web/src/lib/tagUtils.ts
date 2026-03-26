import type { Tag } from '@/types'

/**
 * Returns the given tagId plus the IDs of ALL its descendants recursively.
 * If the tag has no children, returns [tagId].
 */
export function getTagAndDescendantIds(
  tagId: string,
  allTags: Tag[],
): string[] {
  const result: string[] = [tagId]
  const directChildren = allTags.filter((tag) => tag.parentId === tagId)

  for (const child of directChildren) {
    result.push(...getTagAndDescendantIds(child.id, allTags))
  }

  return result
}

/**
 * Returns the depth of a tag in the hierarchy.
 * Top-level tags (no parentId) return 0.
 * Direct children return 1, grandchildren return 2, etc.
 */
export function getTagDepth(tagId: string, allTags: Tag[]): number {
  const tag = allTags.find((t) => t.id === tagId)

  if (!tag || !tag.parentId) {
    return 0
  }

  return 1 + getTagDepth(tag.parentId, allTags)
}
