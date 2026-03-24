import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent } from '@/components/ui/card'
import { useItem, useItemLogs } from '@/hooks'
import { DEFAULT_PACKAGE_UNIT } from '@/types'

export const Route = createFileRoute('/items/$id/log')({
  component: ItemHistory,
})

function ItemHistory() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: logs = [], isLoading } = useItemLogs(id)

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-foreground-muted">
        <p>No history yet.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
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
                  {log.note && (
                    <p className="text-sm text-foreground-muted">{log.note}</p>
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
