import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ItemFormValues } from '@/components/item/ItemForm'
import { ItemForm } from '@/components/item/ItemForm'
import { DeleteButton } from '@/components/shared/DeleteButton'
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
import { useDataMode } from '@/hooks/useDataMode'
import { useItemLayout } from '@/hooks/useItemLayout'
import { useItemStocks } from '@/hooks/useItemStocks'
import { useLocations } from '@/hooks/useLocations'
import { useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'
import type { TrackedQuantities } from '@/lib/quantityUtils'
import { convertTrackedQuantities } from '@/lib/quantityUtils'
import type { Item, PantryItem, StockConfigFields, StockFields } from '@/types'
import { DEFAULT_PACKAGE_UNIT } from '@/types'

export const Route = createFileRoute('/items/$id/')({
  component: ItemInfoTab,
})

function itemToFormValues(item: PantryItem): ItemFormValues {
  return {
    packedQuantity: item.packedQuantity,
    unpackedQuantity: item.unpackedQuantity ?? 0,
    dueDate: item.dueDate
      ? (item.dueDate.toISOString().split('T')[0] ?? '')
      : '',
    estimatedDueDays: item.estimatedDueDays ?? '',
    name: item.name,
    wikidataUrl: item.wikidataUrl ?? '',
    note: item.note ?? '',
    packageUnit: item.packageUnit ?? '',
    measurementUnit: item.measurementUnit ?? '',
    amountPerPackage: item.amountPerPackage ?? '',
    targetUnit: item.targetUnit,
    targetQuantity: item.targetQuantity,
    refillThreshold: item.refillThreshold,
    consumeAmount: item.consumeAmount ?? 1,
    // Read explicit expirationMode; fall back to inference for items created
    // before this field was added (pre-migration existing data).
    expirationMode:
      item.expirationMode ??
      (item.estimatedDueDays != null
        ? 'days from purchase'
        : item.dueDate
          ? 'date'
          : 'disabled'),
    expirationThreshold: item.expirationThreshold ?? '',
  }
}

// A wider update type that allows explicit `undefined` for optional fields.
// Passing `undefined` tells Dexie (local) to clear those properties and
// tells toUpdateItemInput() (cloud) to send null so the server clears them.
// We need a separate type here because `exactOptionalPropertyTypes: true`
// prevents assigning `undefined` to fields typed as `?: T` on `Partial<Item>`.
type ItemInfoUpdatePayload = Omit<
  Partial<Item>,
  | 'wikidataUrl'
  | 'note'
  | 'packageUnit'
  | 'measurementUnit'
  | 'amountPerPackage'
  | 'estimatedDueDays'
  | 'expirationThreshold'
  | 'expirationMode'
> & {
  wikidataUrl?: string | undefined
  note?: string | undefined
  packageUnit?: string | undefined
  measurementUnit?: string | undefined
  amountPerPackage?: number | undefined
  estimatedDueDays?: number | undefined
  expirationThreshold?: number | undefined
  expirationMode?: StockConfigFields['expirationMode']
}

// Build the Info-tab update payload: the item's identity plus its GLOBAL stock
// configuration. Per-location state (quantities, targets, this location's due
// date) is persisted separately by the Stock tab and is intentionally absent.
function buildInfoUpdates(values: ItemFormValues): ItemInfoUpdatePayload {
  const updates: ItemInfoUpdatePayload = {
    name: values.name,
    targetUnit: values.targetUnit,
    consumeAmount: values.consumeAmount,
    expirationMode: values.expirationMode,
  }

  // Assign undefined (not delete) so toUpdateItemInput() sees the key as
  // present and sends null to the server — intentionally clearing the field
  // when the user leaves it blank.
  updates.wikidataUrl = values.wikidataUrl.trim()
    ? values.wikidataUrl.trim()
    : undefined
  updates.note = values.note.trim() ? values.note : undefined
  updates.packageUnit = values.packageUnit ? values.packageUnit : undefined
  updates.measurementUnit = values.measurementUnit
    ? values.measurementUnit
    : undefined
  updates.amountPerPackage = values.amountPerPackage
    ? Number(values.amountPerPackage)
    : undefined
  updates.expirationThreshold = values.expirationThreshold
    ? Number(values.expirationThreshold)
    : undefined
  // "Expires in N days" only exists in that mode; clear it otherwise. The
  // per-location `dueDate` is the Stock tab's to clear.
  updates.estimatedDueDays =
    values.expirationMode === 'days from purchase' && values.estimatedDueDays
      ? Number(values.estimatedDueDays)
      : undefined

  return updates
}

type Adjustment = {
  recipeId: string
  recipeName: string
  oldAmount: number
  newAmount: number
}

// One location's tracked quantities before and after a unit switch. Every
// location the item is stocked in gets one, because the conversion factor
// (`amountPerPackage`) is global — see convertTrackedQuantities.
type StockConversion = {
  locationId: string
  locationName: string
  before: TrackedQuantities
  after: TrackedQuantities
}

// Everything the confirm dialog previews, captured at submit time so what it
// shows is exactly what it will write: the first write invalidates the stock
// queries, and a preview recomputed from those must not shift under the user.
type PendingSave = {
  values: ItemFormValues
  adjustments: Adjustment[]
  conversions: StockConversion[]
}

function calcNewDefault(oldDefault: number, newConsumeAmount: number): number {
  if (oldDefault === 0) return 0
  const nearest = Math.round(oldDefault / newConsumeAmount) * newConsumeAmount
  return nearest === 0 ? newConsumeAmount : nearest
}

function calcRecipeDefaultAfterUnitSwitch(
  oldDefault: number,
  amountPerPackage: number,
  newTargetUnit: 'measurement' | 'package',
  newConsumeAmount: number,
): number {
  if (oldDefault === 0) return 0
  const ratio =
    newTargetUnit === 'measurement'
      ? oldDefault * amountPerPackage
      : oldDefault / amountPerPackage
  const nearest = Math.round(ratio / newConsumeAmount) * newConsumeAmount
  return nearest === 0 ? newConsumeAmount : nearest
}

function sameQuantities(a: TrackedQuantities, b: TrackedQuantities): boolean {
  return (
    a.unpackedQuantity === b.unpackedQuantity &&
    a.targetQuantity === b.targetQuantity &&
    a.refillThreshold === b.refillThreshold
  )
}

function ItemInfoTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const { registerDirtyState } = useItemLayout()
  const { goBack } = useAppNavigation()
  const [savedAt, setSavedAt] = useState(0)

  const { data: allRecipes } = useRecipes()
  const updateRecipe = useUpdateRecipe()

  // Every location's stock row for this item, plus the locations to name and
  // order them by. Local-mode data: cloud has no locations and no ItemStock (a
  // cloud Item carries its stock inline), so no conversion is built there.
  const { mode } = useDataMode()
  const isLocal = mode === 'local'
  const { data: stocks } = useItemStocks(id)
  const { data: locations } = useLocations()

  const [pending, setPending] = useState<PendingSave | null>(null)

  if (!item) return null

  const formValues = itemToFormValues(item)

  const persistInfo = async (values: ItemFormValues) => {
    // Cast to Partial<Item> — the wider payload type is compatible at runtime;
    // the cast is needed because exactOptionalPropertyTypes disallows undefined on Partial<Item>.
    await updateItem.mutateAsync({
      id,
      updates: buildInfoUpdates(values) as Partial<Item>,
    })
  }

  const finishSave = () => {
    setSavedAt((n) => n + 1)
    goBack()
  }

  const doSave = async (values: ItemFormValues) => {
    await persistInfo(values)
    finishSave()
  }

  // A recipe's `defaultAmount` is stored in the item's own unit and snapped to
  // its consume amount, so changing either invalidates it. Both are GLOBAL
  // fields and live on this tab since v16 — this is a global → global rewrite.
  // (It used to hang off the Stock tab, where one location's edit rescaled
  // every recipe; that was the defect the field move fixes.)
  //
  // A unit switch invalidates the per-location quantities for the same reason:
  // `unpackedQuantity` / `targetQuantity` / `refillThreshold` are all held in
  // whichever unit the item is tracked in. Since v16 the factor
  // (`amountPerPackage`) is global too, so every location converts by the same
  // factor — which is what makes rewriting all of them well defined rather than
  // arbitrary, and why this shipped only once the field move had landed.
  // `packedQuantity` is deliberately never converted: it counts sealed
  // packages, which are packages in either mode.
  const handleSubmit = async (values: ItemFormValues) => {
    const oldConsumeAmount = item.consumeAmount ?? 1
    const newConsumeAmount = values.consumeAmount
    const targetUnitChanged = item.targetUnit !== values.targetUnit

    const buildAdjustments = (): Adjustment[] => {
      if (!allRecipes) return []
      const affectedRecipes = allRecipes.filter((r) =>
        r.items.some((ri) => ri.itemId === id),
      )
      if (targetUnitChanged) {
        const amountPerPackage = Number(values.amountPerPackage)
        if (!amountPerPackage || amountPerPackage <= 0) return []
        return affectedRecipes.flatMap((r) => {
          const ri = r.items.find((ri) => ri.itemId === id)
          if (!ri) return []
          const newDefault = calcRecipeDefaultAfterUnitSwitch(
            ri.defaultAmount,
            amountPerPackage,
            values.targetUnit,
            newConsumeAmount,
          )
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
      }
      // When targetUnit also changed, the unit-switch branch above already snaps
      // to newConsumeAmount, so a separate consume-amount adjustment is not needed.
      if (oldConsumeAmount !== newConsumeAmount) {
        return affectedRecipes.flatMap((r) => {
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
      }
      return []
    }

    // One entry per stocked location whose numbers actually move. Built from
    // each ItemStock row's OWN stored values, never from the form: the form
    // holds the ACTIVE location's quantities (already rescaled in its local
    // state by the toggle), which are the wrong numbers for every other row.
    const buildStockConversions = (): StockConversion[] => {
      if (!isLocal || !targetUnitChanged || !stocks) return []
      const amountPerPackage = Number(values.amountPerPackage)
      const order = new Map(locations?.map((l, i) => [l.id, i]))
      return stocks
        .flatMap((stock) => {
          const before: TrackedQuantities = {
            unpackedQuantity: stock.unpackedQuantity,
            targetQuantity: stock.targetQuantity,
            refillThreshold: stock.refillThreshold,
          }
          const after = convertTrackedQuantities(
            before,
            amountPerPackage,
            values.targetUnit,
          )
          // No usable factor (missing / zero / negative amountPerPackage), or
          // nothing actually moves (all-zero row, 1:1 package size): leave the
          // row alone rather than list a no-op for the user to reason about.
          if (!after || sameQuantities(before, after)) return []
          return [
            {
              locationId: stock.locationId,
              locationName:
                locations?.find((l) => l.id === stock.locationId)?.name ??
                stock.locationId,
              before,
              after,
            },
          ]
        })
        .sort(
          (a, b) =>
            (order.get(a.locationId) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.locationId) ?? Number.MAX_SAFE_INTEGER),
        )
    }

    const adjustments = buildAdjustments()
    const conversions = buildStockConversions()
    if (adjustments.length > 0 || conversions.length > 0) {
      setPending({ values, adjustments, conversions })
      return
    }

    await doSave(values)
  }

  // Writes in dependency order — the item's own configuration first, then the
  // per-location rows and the recipe amounts that are expressed in it — and
  // navigates away only once every write has landed.
  const handleConfirmAdjustments = async () => {
    if (!pending) return
    await persistInfo(pending.values)

    for (const conversion of pending.conversions) {
      await updateItem.mutateAsync({
        id,
        updates: conversion.after as Partial<StockFields>,
        locationId: conversion.locationId,
      })
    }

    for (const adj of pending.adjustments) {
      const recipe = allRecipes?.find((r) => r.id === adj.recipeId)
      if (!recipe) continue
      const newItems = recipe.items.map((ri) =>
        ri.itemId === id ? { ...ri, defaultAmount: adj.newAmount } : ri,
      )
      await updateRecipe.mutateAsync({
        id: adj.recipeId,
        updates: { items: newItems },
      })
    }

    setPending(null)
    finishSave()
  }

  const handleCancelAdjustments = () => {
    setPending(null)
  }

  const handleDelete = async () => {
    await deleteItem.mutateAsync({
      id: item.id,
      ...(item.vendorIds ? { vendorIds: item.vendorIds } : {}),
      ...(item.tagIds ? { tagIds: item.tagIds } : {}),
    })
    goBack()
  }

  const hasConversions = (pending?.conversions.length ?? 0) > 0
  const hasAdjustments = (pending?.adjustments.length ?? 0) > 0
  const switchedToUnit =
    pending?.values.targetUnit === 'measurement'
      ? pending.values.measurementUnit
      : (pending?.values.packageUnit ?? '') || DEFAULT_PACKAGE_UNIT

  return (
    <div className="p-4 pb-16 bg-background-elevated min-h-[100cqh]">
      <ItemForm
        initialValues={formValues}
        sections={['info']}
        onSubmit={handleSubmit}
        onDirtyChange={registerDirtyState}
        savedAt={savedAt}
        isPending={updateItem.isPending}
      />

      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) handleCancelAdjustments()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasConversions
                ? t('items.detail.unitSwitchDialog.title')
                : t('items.detail.recipeAdjustDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          {/* Exactly one description element: Radix points the dialog's
              aria-describedby at it, so a second would duplicate the id. */}
          <AlertDialogDescription>
            {hasConversions && (
              <span className="block">
                {t('items.detail.unitSwitchDialog.description', {
                  unit: switchedToUnit,
                })}
              </span>
            )}
            {hasAdjustments && pending && (
              <span className={hasConversions ? 'mt-2 block' : 'block'}>
                {t('items.detail.recipeAdjustDialog.description', {
                  from: item.consumeAmount,
                  to: pending.values.consumeAmount,
                })}
              </span>
            )}
          </AlertDialogDescription>

          {/* Grouped one row per location: three fields × N locations listed
              field-by-field would be an unreadable wall, and the location is
              the thing the user needs to recognise. */}
          {hasConversions && pending && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-foreground-muted">
                    <th className="pb-1 pr-2">
                      {t('items.detail.unitSwitchDialog.locationHeader')}
                    </th>
                    <th className="pb-1 pr-2">
                      {t('items.detail.unitSwitchDialog.unpackedHeader')}
                    </th>
                    <th className="pb-1 pr-2">
                      {t('items.detail.unitSwitchDialog.targetHeader')}
                    </th>
                    <th className="pb-1">
                      {t('items.detail.unitSwitchDialog.refillHeader')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pending.conversions.map((c) => (
                    <tr key={c.locationId}>
                      <td className="capitalize pr-2">{c.locationName}</td>
                      <td className="pr-2 whitespace-nowrap">
                        {c.before.unpackedQuantity} → {c.after.unpackedQuantity}
                      </td>
                      <td className="pr-2 whitespace-nowrap">
                        {c.before.targetQuantity} → {c.after.targetQuantity}
                      </td>
                      <td className="whitespace-nowrap">
                        {c.before.refillThreshold} → {c.after.refillThreshold}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasAdjustments && pending && (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-foreground-muted">
                  <th className="pb-1">
                    {t('items.detail.recipeAdjustDialog.recipeHeader')}
                  </th>
                  <th className="pb-1">
                    {t('items.detail.recipeAdjustDialog.currentHeader')}
                  </th>
                  <th className="pb-1">
                    {t('items.detail.recipeAdjustDialog.newHeader')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pending.adjustments.map((adj) => (
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
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAdjustments}>
              {t('items.detail.recipeAdjustDialog.updateButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="max-w-2xl mx-auto">
        <DeleteButton
          trigger="Delete"
          buttonClassName="w-full max-w-2xl mt-4"
          dialogTitle={t('items.detail.deleteDialog.title')}
          dialogDescription={t('items.detail.deleteDialog.description', {
            name: item.name,
          })}
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
