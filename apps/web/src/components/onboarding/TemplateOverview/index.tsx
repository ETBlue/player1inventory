import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface TemplateOverviewProps {
  selectedItemCount: number
  selectedVendorCount: number
  totalItemCount: number
  totalVendorCount: number
  onEditItems: () => void
  onEditVendors: () => void
  onBack: () => void
  onConfirm: () => void
}

export function TemplateOverview({
  selectedItemCount,
  selectedVendorCount,
  totalItemCount,
  totalVendorCount,
  onEditItems,
  onEditVendors,
  onBack,
  onConfirm,
}: TemplateOverviewProps) {
  const { t } = useTranslation()

  const isConfirmDisabled = selectedItemCount === 0 && selectedVendorCount === 0

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
      {/* Heading */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          {t('onboarding.templateOverview.title')}
        </h1>
      </div>

      {/* Selection rows */}
      <div className="w-full max-w-sm space-y-3">
        {/* Items row */}
        <button
          type="button"
          onClick={onEditItems}
          className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-background text-foreground font-medium text-left hover:bg-background-elevated transition-colors"
        >
          <span>
            <span className="font-bold">{totalItemCount}</span>{' '}
            {t('onboarding.templateOverview.items')}
          </span>
          <span className="flex items-center gap-2 text-foreground-muted">
            <span>
              {selectedItemCount} {t('onboarding.templateOverview.selected')}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </span>
        </button>

        {/* Vendors row */}
        <button
          type="button"
          onClick={onEditVendors}
          className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-background text-foreground font-medium text-left hover:bg-background-elevated transition-colors"
        >
          <span>
            <span className="font-bold">{totalVendorCount}</span>{' '}
            {t('onboarding.templateOverview.vendors')}
          </span>
          <span className="flex items-center gap-2 text-foreground-muted">
            <span>
              {selectedVendorCount} {t('onboarding.templateOverview.selected')}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </span>
        </button>
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-sm flex gap-3">
        <Button
          type="button"
          variant="neutral-outline"
          className="flex-1"
          onClick={onBack}
        >
          {t('onboarding.templateOverview.back')}
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1"
          onClick={onConfirm}
          disabled={isConfirmDisabled}
        >
          {t('onboarding.templateOverview.confirm')}
        </Button>
      </div>
    </div>
  )
}
