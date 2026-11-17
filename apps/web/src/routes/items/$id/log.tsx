import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { NoLocationsGate } from '@/components/location/NoLocationsGate'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'
import { useItem, useItemLogs } from '@/hooks'
import { DEFAULT_PACKAGE_UNIT } from '@/types'

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

function ItemHistory() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: logs = [], isLoading } = useItemLogs(id)

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
      <div className="space-y-px -m-4">
        {[...logs].reverse().map((log) => (
          <Card key={log.id} className="bg-background-surface">
            <CardContent>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">
                    {log.delta > 0 ? '+' : ''}
                    {log.delta} → {log.quantity}{' '}
                    {item?.packageUnit ?? DEFAULT_PACKAGE_UNIT}
                  </p>
                  {(log.logKey || log.note) && (
                    <p className="text-sm text-foreground-muted">
                      {log.logKey
                        ? log.logParams
                          ? t(log.logKey, log.logParams)
                          : t(log.logKey)
                        : log.note}
                    </p>
                  )}
                </div>
                <div className="text-right text-sm text-foreground-muted">
                  <p>{log.occurredAt.toLocaleDateString()}</p>
                  <p>{log.occurredAt.toLocaleTimeString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
