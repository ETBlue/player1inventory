import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { DeleteButton } from '@/components/DeleteButton'
import type { ItemFormValues } from '@/components/item/ItemForm'
import { ItemForm } from '@/components/item/ItemForm'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteItem, useItem, useUpdateItem } from '@/hooks'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useItemLayout } from '@/hooks/useItemLayout'
import { useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/$id/')({
  component: ItemDetailTab,
})

function itemToFormValues(item: Item): ItemFormValues {
  return {
    packedQuantity: item.packedQuantity,
    unpackedQuantity: item.unpackedQuantity ?? 0,
    dueDate: item.dueDate
      ? (item.dueDate.toISOString().split('T')[0] ?? '')
      : '',
    estimatedDueDays: item.estimatedDueDays ?? '',
    name: item.name,
    packageUnit: item.packageUnit ?? '',
    measurementUnit: item.measurementUnit ?? '',
    amountPerPackage: item.amountPerPackage ?? '',
    targetUnit: item.targetUnit,
    targetQuantity: item.targetQuantity,
    refillThreshold: item.refillThreshold,
    consumeAmount: item.consumeAmount ?? 1,
    expirationMode: item.estimatedDueDays != null ? 'days' : 'date',
    expirationThreshold: item.expirationThreshold ?? '',
  }
}

// A wider update type that allows explicit `undefined` for optional expiration fields.
// Passing `undefined` tells Dexie to delete those properties from the stored record.
// We need a separate type here because `exactOptionalPropertyTypes: true` prevents assigning
// `undefined` to fields typed as `?: T` on `Partial<Item>`.
type ItemUpdatePayload = Omit<Partial<Item>, 'dueDate' | 'estimatedDueDays'> & {
  dueDate?: Date | undefined
  estimatedDueDays?: number | undefined
}

function buildUpdates(values: ItemFormValues): ItemUpdatePayload {
  const updates: ItemUpdatePayload = {
    packedQuantity: values.packedQuantity,
    unpackedQuantity: values.unpackedQuantity,
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    consumeAmount: values.consumeAmount,
  }

  if (values.expirationMode === 'date') {
    // Explicitly set estimatedDueDays to undefined so Dexie removes the field from the record.
    // Without this, switching from "days" to "date" mode leaves estimatedDueDays in the DB,
    // causing itemToFormValues to re-infer the mode as 'days' on reload.
    updates.estimatedDueDays = undefined
    updates.dueDate = values.dueDate ? new Date(values.dueDate) : undefined
  } else if (values.expirationMode === 'days') {
    // Explicitly set dueDate to undefined so Dexie removes the field from the record.
    updates.dueDate = undefined
    updates.estimatedDueDays = values.estimatedDueDays
      ? Number(values.estimatedDueDays)
      : undefined
  } else {
    updates.dueDate = undefined
    updates.estimatedDueDays = undefined
  }

  if (values.packageUnit) {
    updates.packageUnit = values.packageUnit
  } else {
    delete updates.packageUnit
  }
  if (values.measurementUnit) {
    updates.measurementUnit = values.measurementUnit
  } else {
    delete updates.measurementUnit
  }
  if (values.amountPerPackage) {
    updates.amountPerPackage = Number(values.amountPerPackage)
  } else {
    delete updates.amountPerPackage
  }
  if (values.expirationThreshold) {
    updates.expirationThreshold = Number(values.expirationThreshold)
  } else {
    delete updates.expirationThreshold
  }

  return updates
}

type Adjustment = {
  recipeId: string
  recipeName: string
  oldAmount: number
  newAmount: number
}

function calcNewDefault(oldDefault: number, newConsumeAmount: number): number {
  if (oldDefault === 0) return 0
  const nearest = Math.round(oldDefault / newConsumeAmount) * newConsumeAmount
  return nearest === 0 ? newConsumeAmount : nearest
}

function ItemDetailTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const { registerDirtyState } = useItemLayout()
  const { goBack } = useAppNavigation()
  const [savedAt, setSavedAt] = useState(0)

  const { data: allRecipes } = useRecipes()
  const updateRecipe = useUpdateRecipe()

  const [pendingAdjustments, setPendingAdjustments] = useState<
    Adjustment[] | null
  >(null)
  const [pendingFormValues, setPendingFormValues] =
    useState<ItemFormValues | null>(null)

  if (!item) return null

  const formValues = itemToFormValues(item)

  const doSave = async (values: ItemFormValues) => {
    // Cast to Partial<Item> — the wider ItemUpdatePayload type is compatible at runtime;
    // the cast is needed because exactOptionalPropertyTypes disallows undefined on Partial<Item>.
    await updateItem.mutateAsync({
      id,
      updates: buildUpdates(values) as Partial<Item>,
    })
    setSavedAt((n) => n + 1)
    goBack()
  }

  const handleSubmit = async (values: ItemFormValues) => {
    const oldConsumeAmount = item.consumeAmount ?? 1
    const newConsumeAmount = values.consumeAmount

    if (oldConsumeAmount !== newConsumeAmount && allRecipes) {
      const affected: Adjustment[] = allRecipes
        .filter((r) => r.items.some((ri) => ri.itemId === id))
        .flatMap((r) => {
          const ri = r.items.find((ri) => ri.itemId === id)
          if (!ri) return []
          const newDefault = calcNewDefault(ri.defaultAmount, newConsumeAmount)
          if (newDefault === ri.defaultAmount) return []
          return [
            {
              recipeId: r.id,
              recipeName: r.name,
              oldAmount: ri.defaultAmount,
              newAmount: newDefault,
            },
          ]
        })

      if (affected.length > 0) {
        setPendingFormValues(values)
        setPendingAdjustments(affected)
        return
      }
    }

    await doSave(values)
  }

  const handleConfirmAdjustments = async () => {
    if (!pendingFormValues || !pendingAdjustments || !allRecipes) return
    await doSave(pendingFormValues)
    for (const adj of pendingAdjustments) {
      const recipe = allRecipes.find((r) => r.id === adj.recipeId)
      if (!recipe) continue
      const newItems = recipe.items.map((ri) =>
        ri.itemId === id ? { ...ri, defaultAmount: adj.newAmount } : ri,
      )
      await updateRecipe.mutateAsync({
        id: adj.recipeId,
        updates: { items: newItems },
      })
    }
    setPendingAdjustments(null)
    setPendingFormValues(null)
  }

  const handleCancelAdjustments = () => {
    setPendingAdjustments(null)
    setPendingFormValues(null)
  }

  const handleDelete = async () => {
    await deleteItem.mutateAsync({
      id: item.id,
      ...(item.vendorIds ? { vendorIds: item.vendorIds } : {}),
    })
    goBack()
  }

  return (
    <>
      <ItemForm
        initialValues={formValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={handleSubmit}
        onDirtyChange={registerDirtyState}
        savedAt={savedAt}
      />

      <DeleteButton
        trigger="Delete"
        buttonClassName="w-full max-w-2xl mt-4"
        dialogTitle="Delete Item?"
        dialogDescription={
          <>
            Are you sure you want to delete <strong>{item.name}</strong>? This
            will permanently remove this item and its history.
          </>
        }
        onDelete={handleDelete}
      />

      <AlertDialog
        open={!!pendingAdjustments}
        onOpenChange={(open) => {
          if (!open) handleCancelAdjustments()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update recipe amounts?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            Amount per consume changed from {item.consumeAmount} to{' '}
            {pendingFormValues?.consumeAmount}. The following recipes will be
            adjusted:
          </AlertDialogDescription>
          {pendingAdjustments && (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-1">Recipe</th>
                  <th className="pb-1">Current</th>
                  <th className="pb-1">New</th>
                </tr>
              </thead>
              <tbody>
                {pendingAdjustments.map((adj) => (
                  <tr key={adj.recipeId}>
                    <td className="capitalize">{adj.recipeName}</td>
                    <td>{adj.oldAmount}</td>
                    <td>{adj.newAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelAdjustments}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAdjustments}>
              Update &amp; Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
