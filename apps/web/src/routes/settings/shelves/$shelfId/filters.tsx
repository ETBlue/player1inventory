import { createFileRoute } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { useRecipes } from '@/hooks/useRecipes'
import { useShelfQuery, useUpdateShelfMutation } from '@/hooks/useShelves'
import { useTagsWithDepth, useTagTypes } from '@/hooks/useTags'
import { useVendors } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/shelves/$shelfId/filters')({
  component: ShelfFiltersTab,
})

function ShelfFiltersTab() {
  const { shelfId } = Route.useParams()
  const { data: shelf } = useShelfQuery(shelfId)
  const updateShelf = useUpdateShelfMutation()

  const { data: tagTypes = [] } = useTagTypes()
  const { data: tagsWithDepth = [] } = useTagsWithDepth()
  const { data: vendors = [] } = useVendors()
  const { data: recipes = [] } = useRecipes()

  const updateFilterConfig = (patch: {
    tagIds?: string[]
    vendorIds?: string[]
    recipeIds?: string[]
  }) => {
    if (!shelf) return
    const base = shelf.filterConfig ?? {}
    const merged = {
      ...(patch.tagIds !== undefined
        ? patch.tagIds.length > 0
          ? { tagIds: patch.tagIds }
          : {}
        : base.tagIds && base.tagIds.length > 0
          ? { tagIds: base.tagIds }
          : {}),
      ...(patch.vendorIds !== undefined
        ? patch.vendorIds.length > 0
          ? { vendorIds: patch.vendorIds }
          : {}
        : base.vendorIds && base.vendorIds.length > 0
          ? { vendorIds: base.vendorIds }
          : {}),
      ...(patch.recipeIds !== undefined
        ? patch.recipeIds.length > 0
          ? { recipeIds: patch.recipeIds }
          : {}
        : base.recipeIds && base.recipeIds.length > 0
          ? { recipeIds: base.recipeIds }
          : {}),
      ...(base.sortBy !== undefined ? { sortBy: base.sortBy } : {}),
      ...(base.sortDir !== undefined ? { sortDir: base.sortDir } : {}),
    }
    updateShelf.mutate({ id: shelf.id, data: { filterConfig: merged } })
  }

  const toggleTag = (tagId: string) => {
    const current = shelf?.filterConfig?.tagIds ?? []
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId]
    updateFilterConfig({ tagIds: next })
  }

  const toggleVendor = (vendorId: string) => {
    const current = shelf?.filterConfig?.vendorIds ?? []
    const next = current.includes(vendorId)
      ? current.filter((id) => id !== vendorId)
      : [...current, vendorId]
    updateFilterConfig({ vendorIds: next })
  }

  const toggleRecipe = (recipeId: string) => {
    const current = shelf?.filterConfig?.recipeIds ?? []
    const next = current.includes(recipeId)
      ? current.filter((id) => id !== recipeId)
      : [...current, recipeId]
    updateFilterConfig({ recipeIds: next })
  }

  if (!shelf) return null

  if (shelf.type !== 'filter') {
    return (
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        <EmptyState
          title="Not applicable"
          description="Only filter shelves use filter configuration."
        />
      </div>
    )
  }

  const sortedTagTypes = [...tagTypes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Tags */}
      {sortedTagTypes.length === 0 ? (
        <EmptyState
          title="No tags"
          description="Add tag types and tags in settings."
        />
      ) : (
        <div className="space-y-3">
          {sortedTagTypes.map((tagType) => {
            const typeTags = tagsWithDepth.filter(
              (t) => t.typeId === tagType.id,
            )
            return (
              <div key={tagType.id}>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center my-2">
                  <div className="h-px bg-accessory-emphasized" />
                  <h2 className="text-sm font-medium uppercase">
                    {tagType.name}
                  </h2>
                  <div className="h-px bg-accessory-emphasized" />
                </div>
                <div className="space-y-1">
                  {typeTags.map((tag) => {
                    const isSelected =
                      shelf.filterConfig?.tagIds?.includes(tag.id) ?? false
                    const depth = tag.depth ?? 0
                    return (
                      <div
                        key={tag.id}
                        className="relative"
                        style={
                          depth > 0 ? { marginLeft: depth * 16 } : undefined
                        }
                      >
                        {Array.from(
                          { length: depth },
                          (_, i) => i * 16 + 8,
                        ).map((leftPx) => (
                          <div
                            key={`connector-at-${leftPx}px`}
                            className="border-r border-accessory-emphasized absolute"
                            style={{
                              right: 'auto',
                              top: '-14px',
                              bottom: '10px',
                              left: `-${leftPx}px`,
                            }}
                          />
                        ))}
                        {depth > 0 && (
                          <div className="absolute w-2 h-px bg-accessory-emphasized -left-2 top-3" />
                        )}
                        <Badge
                          role="button"
                          aria-pressed={isSelected}
                          variant={
                            isSelected
                              ? tagType.color
                              : `${tagType.color}-inverse`
                          }
                          className="cursor-pointer z-10 relative"
                          onClick={() => toggleTag(tag.id)}
                        >
                          {tag.name}
                          {isSelected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Vendors */}
      {vendors.length > 0 && (
        <div>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center my-2">
            <div className="h-px bg-accessory-emphasized" />
            <h2 className="text-sm font-medium uppercase">Vendors</h2>
            <div className="h-px bg-accessory-emphasized" />
          </div>
          <div className="flex flex-wrap gap-1">
            {vendors.map((vendor) => {
              const isSelected =
                shelf.filterConfig?.vendorIds?.includes(vendor.id) ?? false
              return (
                <Badge
                  key={vendor.id}
                  role="button"
                  aria-pressed={isSelected}
                  variant={isSelected ? 'neutral' : 'neutral-outline'}
                  className="cursor-pointer normal-case"
                  onClick={() => toggleVendor(vendor.id)}
                >
                  {vendor.name}
                  {isSelected && <X className="ml-1 h-3 w-3" />}
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {/* Recipes */}
      {recipes.length > 0 && (
        <div>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center my-2">
            <div className="h-px bg-accessory-emphasized" />
            <h2 className="text-sm font-medium uppercase">Recipes</h2>
            <div className="h-px bg-accessory-emphasized" />
          </div>
          <div className="flex flex-wrap gap-1">
            {recipes.map((recipe) => {
              const isSelected =
                shelf.filterConfig?.recipeIds?.includes(recipe.id) ?? false
              return (
                <Badge
                  key={recipe.id}
                  role="button"
                  aria-pressed={isSelected}
                  variant={isSelected ? 'neutral' : 'neutral-outline'}
                  className="cursor-pointer capitalize"
                  onClick={() => toggleRecipe(recipe.id)}
                >
                  {recipe.name}
                  {isSelected && <X className="ml-1 h-3 w-3" />}
                </Badge>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
