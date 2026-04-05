import { ArrowLeft, Check, Filter, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemFilters } from '@/components/item/ItemFilters'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type TemplateTag,
  templateItems,
  templateTags,
  templateTagTypes,
} from '@/data/template'
import { buildDepthFirstTagList } from '@/lib/tagUtils'
import type { Item, Tag, TagColor, TagType } from '@/types'
import { TemplateItemRow } from './TemplateItemRow'

// ---------------------------------------------------------------------------
// Helpers — build mock tag/tagType data for ItemFilters and TemplateItemRow
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

  // Minimal Item-shaped objects so ItemFilters can compute tag counts against
  // the template data set. Only `id` and `tagIds` are needed by calculateTagCount.
  const templateItemsAsItems = useMemo(
    (): Item[] =>
      templateItems.map((item) => ({
        id: item.key,
        name: item.key,
        tagIds: item.tagKeys,
        targetUnit: 'package' as const,
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })),
    [],
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
    <div className="min-h-screen">
      {/* Row 1: Toolbar */}
      <Toolbar className="sticky top-0 z-10">
        <Button
          type="button"
          variant="neutral-ghost"
          size="icon"
          className="lg:w-auto lg:mr-3"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden lg:inline">
            {t('onboarding.templateOverview.back')}
          </span>
        </Button>

        <span className="text-foreground-muted">
          {t('onboarding.itemsBrowser.selected', {
            count: selectedKeys.size,
          })}
        </span>

        <span className="flex-1" />

        <Button
          type="button"
          variant="neutral-outline"
          onClick={handleClearSelection}
        >
          <X />
          {t('onboarding.itemsBrowser.clearSelection')}
        </Button>
      </Toolbar>

      {/* Row 2: Filters / Search / Select All */}
      <Toolbar className="bg-transparent border-none">
        <Button
          size="icon"
          variant={filtersVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => setFiltersVisible((v) => !v)}
          aria-label={t('common.filters')}
          className="lg:w-auto lg:px-3"
        >
          <Filter />
          <span className="hidden lg:inline">{t('common.filters')}</span>
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
          <span className="hidden lg:inline">{t('common.search')}</span>
        </Button>

        <span className="flex-1" />

        <Button
          type="button"
          variant="neutral-outline"
          onClick={handleSelectAllVisible}
        >
          <Check />
          {t('onboarding.itemsBrowser.selectAll')}
        </Button>
      </Toolbar>

      {/* Filters panel (conditional) */}
      {filtersVisible && (
        <>
          <div className="h-px bg-accessory-default" />
          <ItemFilters
            items={templateItemsAsItems}
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

      {/* Search input (conditional) */}
      {searchVisible && (
        <>
          <div className="h-px bg-accessory-default" />
          <div className="flex items-center gap-2 px-3">
            <Input
              placeholder={t('onboarding.itemsBrowser.searchPlaceholder')}
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
        </>
      )}

      {/* Filter status (conditional) */}
      {isFiltered && (
        <>
          <div className="h-px bg-accessory-default" />
          <div className="flex items-center justify-between gap-2 px-3 py-1">
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
        </>
      )}

      <div className="h-px bg-accessory-default" />

      {/* Item list */}
      <div className="flex-1 space-y-px mb-4">
        {visibleItems.map((templateItem) => {
          const resolvedName = t(templateItem.i18nKey)
          const tags = templateItem.tagKeys
            .map((key) => mockTagMap.get(key))
            .filter((tag): tag is Tag => tag !== undefined)
          const isChecked = selectedKeys.has(templateItem.key)

          return (
            <TemplateItemRow
              key={templateItem.key}
              name={resolvedName}
              tags={tags}
              tagTypes={mockTagTypes}
              isChecked={isChecked}
              onToggle={() => {
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
