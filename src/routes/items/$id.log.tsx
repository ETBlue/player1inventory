import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useItem, useItemLogs } from '@/hooks'

export const Route = createFileRoute('/items/$id/log')({
  component: ItemHistory,
})

function ItemHistory() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: item } = useItem(id)
  const { data: logs = [], isLoading } = useItemLogs(id)

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="neutral-ghost"
          size="icon"
          onClick={() => navigate({ to: '/items/$id', params: { id } })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">{item?.name} History</h1>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-foreground-muted">
          <p>No history yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...logs].reverse().map((log) => (
            <Card key={log.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">
                      {log.delta > 0 ? '+' : ''}
                      {log.delta} → {log.quantity} {item?.unit ?? 'units'}
                    </p>
                    {log.note && (
                      <p className="text-sm text-foreground-muted">
                        {log.note}
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
      )}
    </div>
  )
}
