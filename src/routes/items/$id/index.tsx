import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { ItemFormValues } from '@/components/ItemForm'
import { ItemForm } from '@/components/ItemForm'
import { useItem, useUpdateItem } from '@/hooks'
import { useItemLayout } from '@/hooks/useItemLayout'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/$id/')({
  component: ItemDetailTab,
})

function itemToFormValues(item: Item): ItemFormValues {
  return {
    packedQuantity: item.packedQuantity,
    unpackedQuantity: item.unpackedQuantity ?? 0,
    dueDate: item.dueDate ? item.dueDate.toISOString().split('T')[0] : '',
    estimatedDueDays: item.estimatedDueDays ?? '',
    name: item.name,
    packageUnit: item.packageUnit ?? '',
    measurementUnit: item.measurementUnit ?? '',
    amountPerPackage: item.amountPerPackage ?? '',
    targetUnit: item.targetUnit,
    targetQuantity: item.targetQuantity,
    refillThreshold: item.refillThreshold,
    consumeAmount: item.consumeAmount ?? 1,
    expirationMode: item.estimatedDueDays ? 'days' : 'date',
    expirationThreshold: item.expirationThreshold ?? '',
  }
}

function buildUpdates(values: ItemFormValues) {
  const updates: Record<string, unknown> = {
    packedQuantity: values.packedQuantity,
    unpackedQuantity: values.unpackedQuantity,
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    consumeAmount: values.consumeAmount,
  }

  if (values.expirationMode === 'date' && values.dueDate) {
    updates.dueDate = new Date(values.dueDate as string)
    updates.estimatedDueDays = undefined
  } else if (values.expirationMode === 'days' && values.estimatedDueDays) {
    updates.estimatedDueDays = Number(values.estimatedDueDays)
    updates.dueDate = undefined
  } else {
    updates.dueDate = undefined
    updates.estimatedDueDays = undefined
  }

  updates.packageUnit = values.packageUnit || undefined
  updates.measurementUnit = values.measurementUnit || undefined
  updates.amountPerPackage = values.amountPerPackage
    ? Number(values.amountPerPackage)
    : undefined
  updates.expirationThreshold = values.expirationThreshold
    ? Number(values.expirationThreshold)
    : undefined

  return updates
}

function ItemDetailTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { registerDirtyState } = useItemLayout()
  const [savedAt, setSavedAt] = useState(0)

  if (!item) return null

  const formValues = itemToFormValues(item)

  const handleSubmit = (values: ItemFormValues) => {
    updateItem.mutate(
      { id, updates: buildUpdates(values) },
      { onSuccess: () => setSavedAt((n) => n + 1) },
    )
  }

  return (
    <ItemForm
      initialValues={formValues}
      sections={['stock', 'info', 'advanced']}
      onSubmit={handleSubmit}
      onDirtyChange={registerDirtyState}
      savedAt={savedAt}
    />
  )
}
