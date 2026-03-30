import { ArrowLeft, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VendorCard } from '@/components/vendor/VendorCard'
import { type TemplateVendor, templateVendors } from '@/data/template'
import type { Vendor } from '@/types'

// ---------------------------------------------------------------------------
// Helpers — convert template data to the shapes VendorCard expects
// ---------------------------------------------------------------------------

/**
 * Build a mock Vendor object from a TemplateVendor.
 * The resolved `name` is passed in (already translated by the caller).
 */
function buildMockVendor(
  templateVendor: TemplateVendor,
  resolvedName: string,
): Vendor {
  return {
    id: templateVendor.key,
    name: resolvedName,
    createdAt: new Date(),
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateVendorsBrowserProps {
  selectedKeys: Set<string>
  onSelectionChange: (keys: Set<string>) => void
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateVendorsBrowser({
  selectedKeys,
  onSelectionChange,
  onBack,
}: TemplateVendorsBrowserProps) {
  const { t } = useTranslation()

  // Filter state
  const [search, setSearch] = useState('')

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  const visibleVendors = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return templateVendors
    return templateVendors.filter((vendor) =>
      t(vendor.i18nKey).toLowerCase().includes(q),
    )
  }, [search, t])

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------
  const handleSelectAllVisible = () => {
    const next = new Set(selectedKeys)
    for (const vendor of visibleVendors) {
      next.add(vendor.key)
    }
    onSelectionChange(next)
  }

  const handleClearSelection = () => {
    onSelectionChange(new Set())
  }

  const handleClearFilter = () => {
    setSearch('')
  }

  const isFiltered = search.trim().length > 0

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
            aria-label={t('onboarding.templateOverview.back')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('onboarding.templateOverview.back')}
          </Button>

          <span className="text-sm text-foreground-muted flex-1">
            {t('onboarding.vendorsBrowser.selected', {
              count: selectedKeys.size,
            })}
          </span>

          <Button
            type="button"
            variant="neutral-outline"
            size="sm"
            onClick={handleSelectAllVisible}
          >
            {t('onboarding.vendorsBrowser.selectAll')}
          </Button>

          <Button
            type="button"
            variant="neutral-ghost"
            size="sm"
            onClick={handleClearSelection}
          >
            {t('onboarding.vendorsBrowser.clearSelection')}
          </Button>
        </div>

        {/* Row 2: Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted pointer-events-none" />
          <Input
            type="search"
            placeholder={t('onboarding.vendorsBrowser.title')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label={t('onboarding.vendorsBrowser.title')}
          />
        </div>

        {/* Row 3: Showing X of Y + clear filter button */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-foreground-muted">
            {t('onboarding.vendorsBrowser.showing', {
              count: visibleVendors.length,
              total: templateVendors.length,
            })}
          </span>
          {isFiltered && (
            <button
              type="button"
              onClick={handleClearFilter}
              className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              {t('onboarding.vendorsBrowser.clearFilter')}
            </button>
          )}
        </div>
      </div>

      {/* ---- Vendor list ---- */}
      <div className="flex-1 px-4 py-3 space-y-2">
        {visibleVendors.map((templateVendor) => {
          const resolvedName = t(templateVendor.i18nKey)
          const vendor = buildMockVendor(templateVendor, resolvedName)
          const isSelected = selectedKeys.has(templateVendor.key)

          return (
            <VendorCard
              key={templateVendor.key}
              vendor={vendor}
              variant="template"
              selected={isSelected}
              onToggle={() => {
                const next = new Set(selectedKeys)
                if (isSelected) {
                  next.delete(templateVendor.key)
                } else {
                  next.add(templateVendor.key)
                }
                onSelectionChange(next)
              }}
              onDelete={() => {
                // No-op: delete is hidden in template variant
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
