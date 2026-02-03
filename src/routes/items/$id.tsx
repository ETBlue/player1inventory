import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { ArrowLeft, Trash2, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ItemForm } from '@/components/ItemForm'
import { useItem, useUpdateItem, useDeleteItem } from '@/hooks'

export const Route = createFileRoute('/items/$id')({
  component: ItemDetail,
})

function ItemDetail() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: item, isLoading } = useItem(id)
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  if (!item) {
    return <div className="p-4">Item not found</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/' })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">{item.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/items/$id/log" params={{ id }}>
            <Button variant="outline" size="icon">
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

      <ItemForm
        initialData={item}
        submitLabel="Save Changes"
        onSubmit={(data) => {
          updateItem.mutate(
            { id, updates: data },
            { onSuccess: () => navigate({ to: '/' }) }
          )
        }}
      />
    </div>
  )
}
