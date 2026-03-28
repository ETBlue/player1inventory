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
 * Recursively emits a tag and all its descendants in depth-first order,
 * annotating each tag with its depth in the hierarchy.
 */
function collectDepthFirst(
  tag: Tag,
  allTags: Tag[],
  depth: number,
  result: Array<Tag & { depth: number }>,
): void {
  result.push({ ...tag, depth })
  const children = allTags.filter((t) => t.parentId === tag.id)
  for (const child of children) {
    collectDepthFirst(child, allTags, depth + 1, result)
  }
}

/**
 * Returns tags in depth-first order (parent before its children, recursively),
 * with each tag annotated with its depth (0 = top-level).
 *
 * If `typeId` is provided, only tags with that typeId are included.
 * Top-level tags are those with no parentId (or whose parent is outside the
 * filtered set when typeId is applied).
 */
export function buildDepthFirstTagList(
  allTags: Tag[],
  typeId?: string,
): Array<Tag & { depth: number }> {
  const filteredTags = typeId
    ? allTags.filter((t) => t.typeId === typeId)
    : allTags

  // Top-level: no parentId, or parentId not present in the filtered set
  const filteredIds = new Set(filteredTags.map((t) => t.id))
  const topLevel = filteredTags.filter(
    (t) => !t.parentId || !filteredIds.has(t.parentId),
  )

  const result: Array<Tag & { depth: number }> = []
  for (const tag of topLevel) {
    collectDepthFirst(tag, filteredTags, 0, result)
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
