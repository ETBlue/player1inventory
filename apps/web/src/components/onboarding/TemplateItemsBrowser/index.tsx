import { ArrowLeft, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemFilters } from '@/components/item/ItemFilters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type TemplateItem,
  type TemplateTag,
  templateItems,
  templateTags,
  templateTagTypes,
} from '@/data/template'
import { buildDepthFirstTagList } from '@/lib/tagUtils'
import type { Item, Tag, TagColor, TagType } from '@/types'

// ---------------------------------------------------------------------------
// Helpers — convert template data to the shapes ItemCard expects
// ---------------------------------------------------------------------------

/**
 * Build a mock Tag object from a TemplateTag.
 * The resolved `name` is passed in (already translated by the caller).
 */
function buildMockTag(templateTag: TemplateTag, resolvedName: string): Tag {
  return {
    id: templateTag.key,
    name: resolvedName,
    typeId: templateTag.typeKey,
    ...(templateTag.parentKey !== undefined
      ? { parentId: templateTag.parentKey }
      : {}),
  }
}

/**
 * Build a mock TagType from a template tag type key and resolved name.
 */
function buildMockTagType(key: string, name: string, color: TagColor): TagType {
  return { id: key, name, color }
}

/**
 * Convert a TemplateItem + resolved Tag objects into the Item shape that
 * ItemCard expects. All quantity fields are set to sensible display-only
 * defaults (0/0) since template mode hides quantity controls.
 */
function templateItemToItem(
  templateItem: TemplateItem,
  resolvedName: string,
): Item {
  const now = new Date()
  return {
    id: templateItem.key,
    name: resolvedName,
    tagIds: templateItem.tagKeys,
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: now,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateItemsBrowserProps {
  selectedKeys: Set<string>
  onSelectionChange: (keys: Set<string>) => void
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateItemsBrowser({
  selectedKeys,
  onSelectionChange,
  onBack,
}: TemplateItemsBrowserProps) {
  const { t } = useTranslation()

  // Unified filter state: tagTypeId → selected tag ids
  const [filterState, setFilterState] = useState<Record<string, string[]>>({})
  const [search, setSearch] = useState('')

  // ---------------------------------------------------------------------------
  // Build resolved mock tag & tagType data (translated)
  // ---------------------------------------------------------------------------
  const mockTagTypes: TagType[] = useMemo(
    () =>
      templateTagTypes.map((tt) =>
        buildMockTagType(tt.key, t(tt.i18nKey), tt.color),
      ),
    [t],
  )

  // Map from tag key → resolved Tag
  const mockTagMap = useMemo(
    () =>
      new Map<string, Tag>(
        templateTags.map((tag) => [tag.key, buildMockTag(tag, t(tag.i18nKey))]),
      ),
    [t],
  )

  // Flat list of all mock tags (for ItemFilters)
  const mockTags: Tag[] = useMemo(
    () => templateTags.map((tag) => buildMockTag(tag, t(tag.i18nKey))),
    [t],
  )

  // Depth-first ordered tags (for ItemFilters hierarchical display)
  const mockTagsWithDepth = useMemo(
    () => buildDepthFirstTagList(mockTags),
    [mockTags],
  )

  // Items list (all template items as Item shape, for ItemFilters count computation)
  const allMockItems: Item[] = useMemo(
    () => templateItems.map((ti) => templateItemToItem(ti, t(ti.i18nKey))),
    [t],
  )

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()

    return templateItems.filter((item) => {
      // Search — check translated name
      if (q) {
        const name = t(item.i18nKey).toLowerCase()
        if (!name.includes(q)) return false
      }

      // Tag filters — for each active tag type filter, item must match at least one selected tag
      // (including sub-tags of selected tags via parentKey chain)
      for (const [tagTypeId, selectedTagIds] of Object.entries(filterState)) {
        if (selectedTagIds.length === 0) continue

        const hasMatch = item.tagKeys.some((k) => {
          // Direct match
          if (selectedTagIds.includes(k)) return true
          // Check if this tag's ancestor (parentKey chain) is in the selected ids
          const tag = templateTags.find((tt) => tt.key === k)
          if (!tag || tag.typeKey !== tagTypeId) return false
          let parent = tag.parentKey
          while (parent !== undefined) {
            if (selectedTagIds.includes(parent)) return true
            const parentTag = templateTags.find((tt) => tt.key === parent)
            parent = parentTag?.parentKey
          }
          return false
        })
        if (!hasMatch) return false
      }

      return true
    })
  }, [search, filterState, t])

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------
  const handleSelectAllVisible = () => {
    const next = new Set(selectedKeys)
    for (const item of visibleItems) {
      next.add(item.key)
    }
    onSelectionChange(next)
  }

  const handleClearSelection = () => {
    onSelectionChange(new Set())
  }

  const handleClearFilters = () => {
    setFilterState({})
    setSearch('')
  }

  const isFiltered =
    Object.values(filterState).some((ids) => ids.length > 0) || search.trim()

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col">
      {/* ---- Header ---- */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 space-y-3">
        {/* Row 1: Back · N selected · Select all · Clear */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="neutral-ghost"
            size="sm"
            onClick={onBack}
            aria-label={t('common.back')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('common.back')}
          </Button>

          <span className="text-sm text-foreground-muted flex-1">
            {t('onboarding.itemsBrowser.selected', {
              count: selectedKeys.size,
            })}
          </span>

          <Button
            type="button"
            variant="neutral-outline"
            size="sm"
            onClick={handleSelectAllVisible}
          >
            {t('onboarding.itemsBrowser.selectAll')}
          </Button>

          <Button
            type="button"
            variant="neutral-ghost"
            size="sm"
            onClick={handleClearSelection}
          >
            {t('onboarding.itemsBrowser.clearSelection')}
          </Button>
        </div>

        {/* Row 2: Tag filters via ItemFilters (controlled, no DB hooks, no vendor/recipe/edit-tags) */}
        <ItemFilters
          items={allMockItems}
          tagTypes={mockTagTypes}
          tags={mockTags}
          tagsWithDepth={mockTagsWithDepth}
          filterState={filterState}
          onFilterStateChange={setFilterState}
          hideVendorFilter
          hideRecipeFilter
          hideEditTagsLink
        />

        {/* Row 3: Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted pointer-events-none" />
          <Input
            type="search"
            placeholder={t('onboarding.itemsBrowser.title')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label={t('onboarding.itemsBrowser.title')}
          />
        </div>

        {/* Row 4: Showing X of Y + clear filter button */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-foreground-muted">
            {t('onboarding.itemsBrowser.showing', {
              count: visibleItems.length,
              total: templateItems.length,
            })}
          </span>
          {isFiltered && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              {t('onboarding.itemsBrowser.clearFilter')}
            </button>
          )}
        </div>
      </div>

      {/* ---- Item list ---- */}
      <div className="flex-1 px-4 py-3 space-y-2">
        {visibleItems.map((templateItem) => {
          const resolvedName = t(templateItem.i18nKey)
          const item = templateItemToItem(templateItem, resolvedName)

          const tags = templateItem.tagKeys
            .map((key) => mockTagMap.get(key))
            .filter((tag): tag is Tag => tag !== undefined)

          const isChecked = selectedKeys.has(templateItem.key)

          return (
            <ItemCard
              key={templateItem.key}
              item={item}
              tags={tags}
              tagTypes={mockTagTypes}
              variant="template"
              isChecked={isChecked}
              onCheckboxToggle={() => {
                const next = new Set(selectedKeys)
                if (isChecked) {
                  next.delete(templateItem.key)
                } else {
                  next.add(templateItem.key)
                }
                onSelectionChange(next)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
