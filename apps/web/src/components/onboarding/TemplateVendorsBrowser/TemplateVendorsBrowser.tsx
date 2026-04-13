import { ArrowLeft, Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { templateVendors } from '@/data/template'
import { TemplateVendorRow } from './TemplateVendorRow'

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
          {t('onboarding.vendorsBrowser.selected', {
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
          {t('onboarding.vendorsBrowser.clearSelection')}
        </Button>
      </Toolbar>

      {/* Row 2: Search input + Select All */}
      <Toolbar className="bg-transparent border-none">
        <Input
          placeholder={t('onboarding.vendorsBrowser.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearch('')
          }}
          className="flex-1 border-none shadow-none bg-transparent h-auto py-2 text-sm -my-2"
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
        <Button
          type="button"
          variant="neutral-outline"
          onClick={handleSelectAllVisible}
        >
          <Check />
          {t('onboarding.vendorsBrowser.selectAll')}
        </Button>
      </Toolbar>

      {/* Filter status (conditional) */}
      {isFiltered && (
        <>
          <div className="h-px bg-accessory-default" />
          <div className="flex items-center justify-between gap-2 px-3 py-1">
            <span className="text-xs text-foreground-muted">
              {t('onboarding.vendorsBrowser.showing', {
                count: visibleVendors.length,
                total: templateVendors.length,
              })}
            </span>
            <button
              type="button"
              onClick={handleClearFilter}
              className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              {t('onboarding.vendorsBrowser.clearFilter')}
            </button>
          </div>
        </>
      )}

      <div className="h-px bg-accessory-default" />

      {/* Vendor list */}
      <div className="flex-1 mb-4 space-y-px">
        {visibleVendors.map((templateVendor) => {
          const resolvedName = t(templateVendor.i18nKey)
          const isChecked = selectedKeys.has(templateVendor.key)

          return (
            <TemplateVendorRow
              key={templateVendor.key}
              name={resolvedName}
              isChecked={isChecked}
              onToggle={() => {
                const next = new Set(selectedKeys)
                if (isChecked) {
                  next.delete(templateVendor.key)
                } else {
                  next.add(templateVendor.key)
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
