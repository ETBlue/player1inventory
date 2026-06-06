import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { ItemFormValues } from '@/components/item/ItemForm'
import { ItemForm } from '@/components/item/ItemForm'
import { LayoutInnerPages } from '@/components/shared/LayoutInnerPages'
import { useCreateItem } from '@/hooks'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/new')({
  component: NewItemPage,
})

function buildCreateData(
  values: ItemFormValues,
): Omit<Item, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: values.consumeAmount,
    tagIds: [],
    expirationMode: values.expirationMode,
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
    ...(values.expirationMode === 'date' && values.dueDate
      ? { dueDate: new Date(values.dueDate) }
      : {}),
    ...(values.expirationMode === 'days from purchase' &&
    values.estimatedDueDays
      ? { estimatedDueDays: Number(values.estimatedDueDays) }
      : {}),
  }
}

function NewItemPage() {
  // Fallback route — users do not reach this page through normal app navigation.
  // New items are created via NewItemDialog. This route exists for direct URL access only.
  const { t } = useTranslation()
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
    <LayoutInnerPages title={t('items.newButton')}>
      <div className="p-4 max-w-2xl mx-auto">
        <ItemForm onSubmit={handleSubmit} isPending={createItem.isPending} />
      </div>
    </LayoutInnerPages>
  )
}
