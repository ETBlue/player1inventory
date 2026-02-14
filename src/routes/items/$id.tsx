import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
} from '@tanstack/react-router'
import { ArrowLeft, History, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDeleteItem, useItem } from '@/hooks'
import { ItemLayoutProvider } from '@/hooks/useItemLayout'

export const Route = createFileRoute('/items/$id')({
  component: ItemLayout,
})

function ItemLayout() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: item, isLoading } = useItem(id)
  const deleteItem = useDeleteItem()

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  if (!item) {
    return <div className="p-4">Item not found</div>
  }

  return (
    <ItemLayoutProvider>
      <div className="min-h-screen">
        {/* Fixed Top Bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background-elevated border-b">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Button
                variant="neutral-ghost"
                size="icon"
                onClick={() => navigate({ to: '/' })}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold truncate max-w-[300px]">
                {item.name}
              </h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              <Link
                to="/items/$id"
                params={{ id }}
                activeOptions={{ exact: true }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
              >
                Stock
              </Link>
              <Link
                to="/items/$id/info"
                params={{ id }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
              >
                Info
              </Link>
              <Link
                to="/items/$id/tags"
                params={{ id }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
              >
                Tags
              </Link>
            </div>

            <div className="flex gap-2">
              <Link to="/items/$id/log" params={{ id }}>
                <Button variant="neutral-ghost" size="icon">
                  <History className="h-5 w-5" />
                </Button>
              </Link>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => {
                  if (confirm('Delete this item?')) {
                    deleteItem.mutate(id, {
                      onSuccess: () => navigate({ to: '/' }),
                    })
                  }
                }}
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content with padding to clear fixed bar */}
        <div className="pt-20 p-4">
          <Outlet />
        </div>
      </div>
    </ItemLayoutProvider>
  )
}
