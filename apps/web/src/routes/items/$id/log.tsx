import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { NoLocationsGate } from '@/components/location/NoLocationsGate'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'
import { useItem, useItemLogs, useVendors } from '@/hooks'
import { useRecipes } from '@/hooks/useRecipes'
import {
  formatLogDelta,
  formatLogNumber,
  formatLogTime,
  type LogNameLookup,
  logAmountsOf,
  logLabelOf,
} from '@/lib/inventoryLogDisplay'
import { convertDetectedLanguage } from '@/lib/language'

export const Route = createFileRoute('/items/$id/log')({
  component: ItemHistoryRoute,
})

// Households H5, review of task F.7: with no location the tab shows the
// empty locations screen. Before, `useItemLogs` waited for a location that
// never came, so the tab showed a spinner forever.
function ItemHistoryRoute() {
  return (
    <NoLocationsGate>
      <ItemHistory />
    </NoLocationsGate>
  )
}

// One row per log, newest first (design 2026-11-25, inventory log layout):
//
//   −30 g · Stock count                470 g
//   Wed, Nov 25, 2026 · 14:30
//
// Every rule (the unit, the label, the date) is in
// `lib/inventoryLogDisplay.ts`; this component only lays it out.
function ItemHistory() {
  const { t, i18n } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: logs = [], isLoading } = useItemLogs(id)
  const { data: vendors } = useVendors()
  const { data: recipes } = useRecipes()
  const language = convertDetectedLanguage(i18n.language)

  // Current names, so a renamed vendor or recipe shows its new name. A
  // deleted one falls back to the name the row stored.
  const names = useMemo<LogNameLookup>(() => {
    const vendorById = new Map((vendors ?? []).map((v) => [v.id, v.name]))
    const recipeById = new Map((recipes ?? []).map((r) => [r.id, r.name]))
    return {
      vendorName: (vendorId) => vendorById.get(vendorId),
      recipeName: (recipeId) => recipeById.get(recipeId),
    }
  }, [vendors, recipes])

  // Older purchase rows of the no-vendor cart stored the translated text
  // "No vendor" as the vendor name, in the language of the day.
  const noVendorNames = useMemo(
    () => [
      i18n.getFixedT('en')('shopping.noVendor'),
      i18n.getFixedT('tw')('shopping.noVendor'),
    ],
    [i18n],
  )

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-foreground-muted">
        <p>{t('items.history.empty')}</p>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Named by the tab's own label ("Log"), so a reader and a test can
          find the list. */}
      <ul
        aria-label={t('items.detail.tabs.history')}
        className="space-y-px -m-4"
      >
        {[...logs].reverse().map((log) => {
          const amounts = logAmountsOf(log, item)
          const label = logLabelOf(log, t, names, noVendorNames)
          return (
            <li key={log.id}>
              <Card className="bg-background-surface">
                <CardContent className="space-y-1">
                  <div className="flex justify-between items-baseline gap-4">
                    <p className="font-medium min-w-0">
                      <span className="tabular-nums whitespace-nowrap">
                        {formatLogDelta(amounts.delta, amounts.unit)}
                      </span>
                      {label && (
                        <>
                          <span
                            aria-hidden="true"
                            className="text-foreground-muted"
                          >
                            {' · '}
                          </span>
                          <span className="font-normal normal-case">
                            {label}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="shrink-0 tabular-nums text-foreground-muted">
                      <span className="sr-only">
                        {t('items.history.afterLabel')}{' '}
                      </span>
                      {formatLogNumber(amounts.quantity)} {amounts.unit}
                    </p>
                  </div>
                  <p className="text-sm text-foreground-muted">
                    <time dateTime={log.occurredAt.toISOString()}>
                      {formatLogTime(log.occurredAt, language, t)}
                    </time>
                  </p>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
