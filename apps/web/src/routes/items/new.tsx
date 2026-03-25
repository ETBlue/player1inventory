import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ItemFormValues } from '@/components/item/ItemForm'
import { ItemForm } from '@/components/item/ItemForm'
import { useCreateItem } from '@/hooks'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/new')({
  component: NewItemPage,
})

function buildCreateData(
  values: ItemFormValues,
): Omit<Item, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    // dueDate is intentionally omitted: the Stock section is not shown on
    // new item creation. estimatedDueDays IS persisted when mode is 'days'
    // because the "Expires in (days)" input lives in the Item Info section.
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
    ...(values.expirationMode === 'days' && values.estimatedDueDays
      ? { estimatedDueDays: Number(values.estimatedDueDays) }
      : {}),
  }
}

function NewItemPage() {
  const navigate = useNavigate()
  const createItem = useCreateItem()

  const handleSubmit = async (values: ItemFormValues) => {
    const newItem = await createItem.mutateAsync(buildCreateData(values))
    navigate({
      to: '/items/$id',
      params: { id: (newItem as { id: string }).id },
    })
  }

  return (
    <div className="min-h-screen">
      {/* Fixed Top Bar */}
      <header
        className={`px-3 flex items-center gap-2
          fixed top-0 left-0 right-0 z-50
          bg-background-surface
          border-b-2 border-accessory-default`}
      >
        <Link
          to="/"
          className="px-3 py-4 hover:bg-background-surface transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-md font-regular truncate">New Item</h1>
      </header>

      {/* Main Content */}
      <div className="pt-16 p-4">
        <ItemForm onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
