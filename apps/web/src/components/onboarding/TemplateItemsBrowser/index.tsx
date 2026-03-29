import { ArrowLeft, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type TemplateItem,
  type TemplateTag,
  templateItems,
  templateTags,
  templateTagTypes,
} from '@/data/template'
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

  // Filter state
  const [preservationFilter, setPreservationFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
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

  // Preservation tags (flat list — no parentKey)
  const preservationTags = useMemo(
    () => templateTags.filter((tag) => tag.typeKey === 'preservation'),
    [],
  )

  // Category tags — top-level only (no parentKey) for filter buttons
  const topLevelCategoryTags = useMemo(
    () =>
      templateTags.filter(
        (tag) => tag.typeKey === 'category' && tag.parentKey === undefined,
      ),
    [],
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

      // Preservation filter — pass if no filter active OR item has a matching tag
      if (preservationFilter.length > 0) {
        const hasMatch = item.tagKeys.some((k) =>
          preservationFilter.includes(k),
        )
        if (!hasMatch) return false
      }

      // Category filter — pass if no filter active OR item has a matching tag
      // (including sub-category tags of selected top-level categories)
      if (categoryFilter.length > 0) {
        const hasMatch = item.tagKeys.some((k) => {
          // Direct match
          if (categoryFilter.includes(k)) return true
          // Check if this tag's ancestor (parentKey chain) is in the filter
          const tag = templateTags.find((tt) => tt.key === k)
          if (!tag) return false
          let parent = tag.parentKey
          while (parent !== undefined) {
            if (categoryFilter.includes(parent)) return true
            const parentTag = templateTags.find((tt) => tt.key === parent)
            parent = parentTag?.parentKey
          }
          return false
        })
        if (!hasMatch) return false
      }

      return true
    })
  }, [search, preservationFilter, categoryFilter, t])

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------
  const handleTogglePreservation = (key: string) => {
    setPreservationFilter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const handleToggleCategory = (key: string) => {
    setCategoryFilter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

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
    setPreservationFilter([])
    setCategoryFilter([])
    setSearch('')
  }

  const isFiltered =
    preservationFilter.length > 0 || categoryFilter.length > 0 || search.trim()

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

        {/* Row 2: Preservation filter toggle buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-foreground-muted shrink-0">
            {t('onboarding.itemsBrowser.preservationFilter')}:
          </span>
          {preservationTags.map((tag) => {
            const isActive = preservationFilter.includes(tag.key)
            return (
              <button
                key={tag.key}
                type="button"
                onClick={() => handleTogglePreservation(tag.key)}
                aria-pressed={isActive}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  isActive
                    ? 'bg-cyan text-tint border-cyan'
                    : 'bg-background border-border text-foreground hover:bg-background-elevated'
                }`}
              >
                {t(tag.i18nKey)}
              </button>
            )
          })}
        </div>

        {/* Row 3: Category filter toggle buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-foreground-muted shrink-0">
            {t('onboarding.itemsBrowser.categoryFilter')}:
          </span>
          {topLevelCategoryTags.map((tag) => {
            const isActive = categoryFilter.includes(tag.key)
            return (
              <button
                key={tag.key}
                type="button"
                onClick={() => handleToggleCategory(tag.key)}
                aria-pressed={isActive}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  isActive
                    ? 'bg-lime text-tint border-lime'
                    : 'bg-background border-border text-foreground hover:bg-background-elevated'
                }`}
              >
                {t(tag.i18nKey)}
              </button>
            )
          })}
        </div>

        {/* Row 4: Search input */}
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

        {/* Row 5: Showing X of Y + clear filter button */}
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
