import { ArrowLeft, Filter, Search, Tags, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemFilters } from '@/components/item/ItemFilters'
import { Toolbar } from '@/components/shared/Toolbar'
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

function buildMockTagType(key: string, name: string, color: TagColor): TagType {
  return { id: key, name, color }
}

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

  // Toggle visibility — all start closed
  const [tagsVisible, setTagsVisible] = useState(false)
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)

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

  const mockTagMap = useMemo(
    () =>
      new Map<string, Tag>(
        templateTags.map((tag) => [tag.key, buildMockTag(tag, t(tag.i18nKey))]),
      ),
    [t],
  )

  const mockTags: Tag[] = useMemo(
    () => templateTags.map((tag) => buildMockTag(tag, t(tag.i18nKey))),
    [t],
  )

  const mockTagsWithDepth = useMemo(
    () => buildDepthFirstTagList(mockTags),
    [mockTags],
  )

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
      if (q) {
        const name = t(item.i18nKey).toLowerCase()
        if (!name.includes(q)) return false
      }

      for (const [tagTypeId, selectedTagIds] of Object.entries(filterState)) {
        if (selectedTagIds.length === 0) continue

        const hasMatch = item.tagKeys.some((k) => {
          if (selectedTagIds.includes(k)) return true
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
    Object.values(filterState).some((ids) => ids.length > 0) || !!search.trim()

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col">
      {/* Row 1: Toolbar */}
      <Toolbar className="sticky top-0 z-10">
        <Button
          type="button"
          variant="neutral-ghost"
          size="sm"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t('onboarding.templateOverview.back')}
        </Button>

        <span className="text-sm text-foreground-muted">
          {t('onboarding.itemsBrowser.selected', {
            count: selectedKeys.size,
          })}
        </span>

        <Button
          size="icon"
          variant={tagsVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => setTagsVisible((v) => !v)}
          aria-label={t('common.tags')}
          className="lg:w-auto lg:px-3"
        >
          <Tags />
          <span className="hidden lg:inline ml-1">{t('common.tags')}</span>
        </Button>

        <Button
          size="icon"
          variant={filtersVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => setFiltersVisible((v) => !v)}
          aria-label={t('common.filters')}
          className="lg:w-auto lg:px-3"
        >
          <Filter />
          <span className="hidden lg:inline ml-1">{t('common.filters')}</span>
        </Button>

        <Button
          size="icon"
          variant={searchVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => {
            if (searchVisible) setSearch('')
            setSearchVisible((v) => !v)
          }}
          aria-label={t('common.search')}
          className="lg:w-auto lg:px-3"
        >
          <Search />
          <span className="hidden lg:inline ml-1">{t('common.search')}</span>
        </Button>

        <span className="flex-1" />

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
      </Toolbar>

      {/* Row 2: Filters (conditional) */}
      {filtersVisible && (
        <>
          <div className="h-px bg-accessory-default" />
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
        </>
      )}

      {/* Row 3: Search (conditional) */}
      {searchVisible && (
        <div className="flex items-center gap-2 border-t border-accessory-default px-3">
          <Input
            placeholder={t('onboarding.itemsBrowser.title')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearch('')
            }}
            className="border-none shadow-none bg-transparent h-auto py-2 text-sm"
            autoFocus
          />
          {search && (
            <Button
              size="icon"
              variant="neutral-ghost"
              className="h-6 w-6 shrink-0"
              onClick={() => setSearch('')}
              aria-label={t('itemListToolbar.clearSearch')}
            >
              <X />
            </Button>
          )}
        </div>
      )}

      {/* Row 4: Filter status (conditional) */}
      {isFiltered && (
        <div className="flex items-center justify-between gap-2 border-t border-accessory-default px-3 py-1">
          <span className="text-xs text-foreground-muted">
            {t('onboarding.itemsBrowser.showing', {
              count: visibleItems.length,
              total: templateItems.length,
            })}
          </span>
          <button
            type="button"
            onClick={handleClearFilters}
            className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
            {t('onboarding.itemsBrowser.clearFilter')}
          </button>
        </div>
      )}

      {/* Item list */}
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
              showTags={tagsVisible}
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
