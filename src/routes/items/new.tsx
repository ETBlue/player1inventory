import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ItemFormValues } from '@/components/ItemForm'
import { ItemForm } from '@/components/ItemForm'
import { Button } from '@/components/ui/button'
import { useCreateItem } from '@/hooks'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/new')({
  component: NewItemPage,
})

function buildCreateData(
  values: ItemFormValues,
): Omit<Item, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    // dueDate and estimatedDueDays are intentionally omitted:
    // the Stock section is not shown on new item creation, so these fields
    // are never populated. Users set expiration values after creation.
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: values.consumeAmount,
    tagIds: [],
    ...(values.packageUnit ? { packageUnit: values.packageUnit } : {}),
    ...(values.measurementUnit
      ? { measurementUnit: values.measurementUnit }
      : {}),
    ...(values.amountPerPackage
      ? { amountPerPackage: Number(values.amountPerPackage) }
      : {}),
    ...(values.expirationThreshold
      ? { expirationThreshold: Number(values.expirationThreshold) }
      : {}),
  }
}

function NewItemPage() {
  const navigate = useNavigate()
  const createItem = useCreateItem()

  const handleSubmit = (values: ItemFormValues) => {
    createItem.mutate(buildCreateData(values), {
      onSuccess: (newItem) => {
        navigate({ to: '/items/$id', params: { id: newItem.id } })
      },
    })
  }

  return (
    <div className="min-h-screen">
      {/* Fixed Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background-elevated border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="neutral-ghost"
            size="icon"
            onClick={() => navigate({ to: '/' })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">New Item</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-20 p-4">
        <ItemForm onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
