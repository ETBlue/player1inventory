import { ArrowLeft, Blocks, Check, ChevronRight, Loader2 } from 'lucide-react'
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
  isLoading?: boolean
  error?: Error | null
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
  isLoading = false,
  error = null,
}: TemplateOverviewProps) {
  const { t } = useTranslation()

  const isConfirmDisabled = selectedItemCount === 0 && selectedVendorCount === 0

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-xl flex gap-2 items-center">
          <Blocks />
          {t('onboarding.templateOverview.title')}
        </h2>
      </div>

      {/* Selection rows */}
      <div className="w-full max-w-sm">
        {/* Items row */}
        <Button
          type="button"
          variant="neutral-outline"
          size="lg"
          onClick={onEditItems}
          className="w-full justify-between py-4 h-auto
          rounded-bl-none rounded-br-none
          bg-background-elevated"
        >
          <span>
            <span className="font-bold">{totalItemCount}</span>{' '}
            {t('onboarding.templateOverview.items')}
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-2 text-foreground-muted">
            <span>
              {selectedItemCount} {t('onboarding.templateOverview.selected')}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </span>
        </Button>

        {/* Vendors row */}
        <Button
          type="button"
          variant="neutral-outline"
          size="lg"
          onClick={onEditVendors}
          className="w-full justify-between py-4 h-auto
          rounded-tl-none rounded-tr-none -mt-px
          bg-background-elevated"
        >
          <span>
            <span className="font-bold">{totalVendorCount}</span>{' '}
            {t('onboarding.templateOverview.vendors')}
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-2 text-foreground-muted">
            <span>
              {selectedVendorCount} {t('onboarding.templateOverview.selected')}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </span>
        </Button>
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-sm flex gap-6">
        <Button
          type="button"
          variant="neutral-outline"
          className="flex-1"
          onClick={onBack}
        >
          <ArrowLeft />
          {t('onboarding.templateOverview.back')}
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1"
          onClick={onConfirm}
          disabled={isConfirmDisabled || isLoading}
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <Check />}
          {t('onboarding.templateOverview.confirm')}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive text-center">
          {t('onboarding.templateOverview.importError')}
        </p>
      )}
    </div>
  )
}
