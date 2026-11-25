import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ItemFormValues } from '@/components/item/ItemForm'
import { ItemForm } from '@/components/item/ItemForm'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { ReadOnlyNote } from '@/components/shared/ReadOnlyNote'
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
import {
  useApplyUnitSwitch,
  useDeleteItem,
  useItem,
  useUpdateItem,
} from '@/hooks'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useItemLayout } from '@/hooks/useItemLayout'
import { useItemStocks } from '@/hooks/useItemStocks'
import { useLocations } from '@/hooks/useLocations'
import { usePermissions } from '@/hooks/usePermissions'
import { useRecipes } from '@/hooks/useRecipes'
import type { TrackedQuantities } from '@/lib/quantityUtils'
import {
  convertTrackedQuantities,
  toNonConsumableQuantities,
} from '@/lib/quantityUtils'
import { showSaveError } from '@/lib/saveError'
import type { Item, PantryItem, StockConfigFields, StockFields } from '@/types'
import { DEFAULT_PACKAGE_UNIT, isConsumable } from '@/types'

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
    // 0 means "no step size configured" and is shown as stored — the
    // fabricated 1 made an unconfigured item look set up. New items no longer
    // start at 0 (the default became 1 on 2026-08-24), but an explicit 0, an
    // imported 0 or an item created while that default was live still reaches
    // here. (`??` never fires: `consumeAmount` is a required number on `Item`,
    // backfilled for every pre-v16 row by the v16 upgrade and always set by
    // `createItem`.)
    consumeAmount: item.consumeAmount ?? 0,
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
    // A missing value means consumable (`isConsumable`).
    consumable: isConsumable(item),
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
    // The measurement and expiration fields below are sent as they are in
    // the form, also when the item is not consumable: hidden values are
    // KEPT, so turning Consumable on again restores them (design, PR 2).
    consumable: values.consumable,
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
  // The save turns Consumable off: the dialog says opened stock is removed,
  // not "now tracking in {unit}".
  toNonConsumable: boolean
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
  // A household member sees the item's catalog fields read only (households
  // H5 task F.5): readOnly fields, no Save and no Delete. The unit-switch
  // dialog is reached only through Save, so it cannot open either.
  const { canEditCatalog, roleKnown } = usePermissions()
  const deleteItem = useDeleteItem()
  const { registerDirtyState, registerSaveControl, saveSlot } = useItemLayout()
  const { goBack } = useAppNavigation()
  const [savedAt, setSavedAt] = useState(0)

  const { data: allRecipes } = useRecipes()
  // The atomic unit switch — the item, every location's stock and every
  // affected recipe in one transaction. Dual-mode since PR 3c.
  const applyUnitSwitch = useApplyUnitSwitch()

  // Every location's stock row for this item, plus the locations to name and
  // order them by. Both hooks are dual-mode since PR 2, and since PR 3c so is
  // `useApplyUnitSwitch` — so `buildStockConversions` runs in BOTH modes and
  // the dialog lists the same conversions either way.
  const { data: stocks } = useItemStocks(id)
  const { data: locations } = useLocations()

  const [pending, setPending] = useState<PendingSave | null>(null)
  // While the converted amounts dialog is open, the answer to the save that
  // opened it: `true` once Confirm's write worked, `false` on Cancel or a
  // failed write. The unsaved-changes dialog's Save waits on it (owner's flow,
  // design 2026-11-25): that dialog stays open under this one.
  const pendingAnswerRef = useRef<((saved: boolean) => void) | null>(null)
  const answerPending = (saved: boolean) => {
    const answer = pendingAnswerRef.current
    pendingAnswerRef.current = null
    answer?.(saved)
  }

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

  // A save stays on the page (design 2026-11-24, part A). Bumping `savedAt`
  // makes `ItemForm` take the saved values as its new clean state, so Save is
  // disabled again and the tab's dirty guard is not armed. Only Delete leaves.
  const finishSave = () => {
    setSavedAt((n) => n + 1)
    toast.success(t('items.detail.saved'))
  }

  // Caught here because `ItemForm` does not await `onSubmit`: a failed save
  // would otherwise be an unhandled rejection with nothing on screen. The form
  // keeps the typed values and stays dirty, so Save can be pressed again.
  const doSave = async (values: ItemFormValues): Promise<boolean> => {
    try {
      await persistInfo(values)
    } catch (err) {
      showSaveError(err)
      return false
    }
    finishSave()
    return true
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
  //
  // It answers whether the save worked. The top bar Save ignores the answer;
  // the unsaved-changes dialog's Save leaves the page only on `true`. When the
  // converted amounts dialog opens, the answer waits for it.
  const handleSubmit = async (values: ItemFormValues): Promise<boolean> => {
    const oldConsumeAmount = item.consumeAmount ?? 0
    const newConsumeAmount = values.consumeAmount
    const targetUnitChanged = item.targetUnit !== values.targetUnit
    // Turning Consumable off (owner decision 2026-11-26): at EVERY location
    // opened stock is dropped, and the target and the refill threshold become
    // whole packs. Turning it on again changes no stock.
    const toNonConsumable = isConsumable(item) && !values.consumable

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
      if ((!targetUnitChanged && !toNonConsumable) || !stocks) return []
      const amountPerPackage = Number(values.amountPerPackage)
      const order = new Map(locations?.map((l, i) => [l.id, i]))
      return stocks
        .flatMap((stock) => {
          const before: TrackedQuantities = {
            unpackedQuantity: stock.unpackedQuantity,
            targetQuantity: stock.targetQuantity,
            refillThreshold: stock.refillThreshold,
          }
          // To non-consumable: the stored numbers are in the item's OLD unit
          // (`item.targetUnit`), and the switch to packages (the form turns
          // "Track in measurement" off with it) is folded into the same
          // divide-by-amountPerPackage rule. Even an item already tracked in
          // packages gets a row when it holds opened stock or a fraction.
          const after = toNonConsumable
            ? toNonConsumableQuantities(before, {
                targetUnit: item.targetUnit,
                ...(amountPerPackage > 0 ? { amountPerPackage } : {}),
              })
            : convertTrackedQuantities(
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
      // A save already waiting (not reachable today: the dialog is modal)
      // is answered "not saved" before a new one starts.
      answerPending(false)
      setPending({ values, adjustments, conversions, toNonConsumable })
      return new Promise<boolean>((resolve) => {
        pendingAnswerRef.current = resolve
      })
    }

    return doSave(values)
  }

  // Writes the item's own configuration, the per-location rows and the recipe
  // amounts expressed in it — and navigates away only once every write has
  // landed.
  //
  // ONE transaction in BOTH modes since PR 3c: a Dexie transaction locally, a
  // `prisma.$transaction` in cloud behind the `applyUnitSwitch` mutation. They
  // are not independent edits — a failure partway would leave the item on the
  // new unit while some locations and recipes still hold old-unit numbers,
  // mixed units, silently, with nothing surfaced to the user.
  const handleConfirmAdjustments = async () => {
    if (!pending) return
    // Taken now, before the first `await`: `AlertDialogAction` closes the
    // dialog right after this handler starts, and that close runs
    // `handleCancelAdjustments`, which would answer `false` first.
    const answer = pendingAnswerRef.current
    pendingAnswerRef.current = null

    // Resolved up front, outside any transaction: the Dexie batch must be
    // handed finished rows (see applyUnitSwitchBatch on why it may not await
    // anything of its own).
    const recipeUpdates = pending.adjustments.flatMap((adj) => {
      const recipe = allRecipes?.find((r) => r.id === adj.recipeId)
      if (!recipe) return []
      return [
        {
          recipeId: adj.recipeId,
          items: recipe.items.map((ri) =>
            ri.itemId === id ? { ...ri, defaultAmount: adj.newAmount } : ri,
          ),
        },
      ]
    })

    // A failure is caught and shown: this runs straight off the dialog's
    // button. The dialog has already closed (`AlertDialogAction` closes it on
    // click), and nothing was written, because it is one transaction. The form
    // stays dirty, so Save opens the dialog again.
    try {
      await applyUnitSwitch.mutateAsync({
        itemId: id,
        updates: buildInfoUpdates(pending.values) as Partial<Item>,
        stockConversions: pending.conversions.map((conversion) => ({
          locationId: conversion.locationId,
          quantities: conversion.after as Partial<StockFields>,
        })),
        recipeUpdates,
      })
    } catch (err) {
      showSaveError(err)
      answer?.(false)
      return
    }

    setPending(null)
    finishSave()
    answer?.(true)
  }

  const handleCancelAdjustments = () => {
    setPending(null)
    answerPending(false)
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
      {roleKnown && !canEditCatalog && (
        <ReadOnlyNote
          className="max-w-2xl mx-auto px-0"
          text={t('settings.catalogReadOnlyItem')}
        />
      )}
      <ItemForm
        initialValues={formValues}
        sections={['info']}
        onSubmit={handleSubmit}
        onDirtyChange={registerDirtyState}
        onSaveControlChange={registerSaveControl}
        savedAt={savedAt}
        isPending={updateItem.isPending}
        readOnly={!canEditCatalog}
        submitSlot={saveSlot}
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
                {pending?.toNonConsumable
                  ? t(
                      'items.detail.unitSwitchDialog.nonConsumableDescription',
                      {
                        unit: switchedToUnit,
                      },
                    )
                  : t('items.detail.unitSwitchDialog.description', {
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

      {canEditCatalog && (
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
      )}
    </div>
  )
}
