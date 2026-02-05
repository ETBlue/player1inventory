import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ItemForm } from '@/components/ItemForm'
import { Button } from '@/components/ui/button'
import { useCreateItem } from '@/hooks'

export const Route = createFileRoute('/items/new')({
  component: NewItem,
})

function NewItem() {
  const navigate = useNavigate()
  const createItem = useCreateItem()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: '/' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Add Item</h1>
      </div>

      <ItemForm
        submitLabel="Add Item"
        onSubmit={(data) => {
          createItem.mutate(data, {
            onSuccess: () => navigate({ to: '/' }),
          })
        }}
      />
    </div>
  )
}
