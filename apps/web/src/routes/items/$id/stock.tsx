import { createFileRoute } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ItemFormValues } from '@/components/item/ItemForm'
import { ItemForm } from '@/components/item/ItemForm'
import { LocationPager } from '@/components/item/LocationPager'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
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
import { Button } from '@/components/ui/button'
import { joinItemStock, stripStockFields } from '@/db/operations'
import {
  useAddItemToLocation,
  useCartItemCountByItem,
  useInventoryLogCountByItem,
  useItem,
  useRemoveItemFromLocation,
  useUpdateItem,
} from '@/hooks'
import { useActiveLocation } from '@/hooks/useActiveLocation'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useDataMode } from '@/hooks/useDataMode'
import { useItemLayout } from '@/hooks/useItemLayout'
import { useItemStocks } from '@/hooks/useItemStocks'
import { useLocations } from '@/hooks/useLocations'
import { useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'
import type { ItemStock, PantryItem, StockFields } from '@/types'

export const Route = createFileRoute('/items/$id/stock')({
  component: ItemStockTab,
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

// Re-join an item with the stock of ONE location — the page the pager is
// showing, which is not necessarily the active location.
//
// `item` arrives from `useItem()` ALREADY joined with the ACTIVE location's
// stock, so the previous join has to be stripped first. Spreading the viewed
// row straight over it would let every optional key that row omits fall
// through to the active location's value — and Save would then persist the
// active location's package unit / expiry into the viewed location's row.
// `stripStockFields` + `joinItemStock` are the single shared implementation
// the operations layer already uses for the active-location join.
function withLocationStock(item: PantryItem, stock: ItemStock): PantryItem {
  return joinItemStock(stripStockFields(item), stock, stock.locationId)
}

// A wider update type that allows explicit `undefined` for optional fields.
// Passing `undefined` tells Dexie (local) to clear those properties and
// tells toUpdateItemInput() (cloud) to send null so the server clears them.
// We need a separate type here because `exactOptionalPropertyTypes: true`
// prevents assigning `undefined` to fields typed as `?: T` on `Partial<Item>`.
type ItemUpdatePayload = Omit<
  Partial<StockFields>,
  | 'dueDate'
  | 'estimatedDueDays'
  | 'expirationMode'
  | 'packageUnit'
  | 'measurementUnit'
  | 'amountPerPackage'
  | 'expirationThreshold'
> & {
  dueDate?: Date | undefined
  estimatedDueDays?: number | undefined
  expirationMode?: StockFields['expirationMode']
  packageUnit?: string | undefined
  measurementUnit?: string | undefined
  amountPerPackage?: number | undefined
  expirationThreshold?: number | undefined
}

// Build the stock-only update payload. Item-info fields (name, wikidataUrl,
// note) are persisted separately by the Info tab and are intentionally not
// included here.
function buildStockUpdates(values: ItemFormValues): ItemUpdatePayload {
  const updates: ItemUpdatePayload = {
    packedQuantity: values.packedQuantity,
    unpackedQuantity: values.unpackedQuantity,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    consumeAmount: values.consumeAmount,
    expirationMode: values.expirationMode,
  }

  if (values.expirationMode === 'date') {
    updates.estimatedDueDays = undefined
    updates.dueDate = values.dueDate ? new Date(values.dueDate) : undefined
  } else if (values.expirationMode === 'days from purchase') {
    updates.dueDate = undefined
    updates.estimatedDueDays = values.estimatedDueDays
      ? Number(values.estimatedDueDays)
      : undefined
  } else {
    // 'disabled'
    updates.dueDate = undefined
    updates.estimatedDueDays = undefined
  }

  // Assign undefined (not delete) so toUpdateItemInput() sees the key as
  // present and sends null to the server — intentionally clearing the field
  // when the user leaves it blank in the full ItemForm.
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

// The editable stock form for ONE (item × location) stock, plus the
// recipe-adjust confirmation that a consumeAmount/targetUnit change triggers.
// `item` already carries the stock fields of the location being edited;
// `locationId` routes the save to that location's ItemStock (omitted in cloud
// mode, which has no locations and writes inline stock on the Item).
function StockFormPanel({
  item,
  locationId,
}: {
  item: PantryItem
  locationId?: string
}) {
  const { t } = useTranslation()
  const updateItem = useUpdateItem()
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

  const id = item.id

  const doSave = async (values: ItemFormValues) => {
    // Cast to Partial<StockFields> — the wider ItemUpdatePayload type is
    // compatible at runtime; the cast is needed because exactOptionalPropertyTypes
    // disallows undefined on Partial<StockFields>. updateItem routes these stock
    // fields to `locationId`'s ItemStock (the active location when omitted).
    await updateItem.mutateAsync({
      id,
      updates: buildStockUpdates(values) as Partial<StockFields>,
      ...(locationId ? { locationId } : {}),
    })
    setSavedAt((n) => n + 1)
    goBack()
  }

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

    const affected = buildAdjustments()
    if (affected.length > 0) {
      setPendingFormValues(values)
      setPendingAdjustments(affected)
      return
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

  return (
    <>
      <ItemForm
        initialValues={itemToFormValues(item)}
        sections={['stock']}
        onSubmit={handleSubmit}
        onDirtyChange={registerDirtyState}
        savedAt={savedAt}
        isPending={updateItem.isPending}
      />

      <AlertDialog
        open={!!pendingAdjustments}
        onOpenChange={(open) => {
          if (!open) handleCancelAdjustments()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('items.detail.recipeAdjustDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('items.detail.recipeAdjustDialog.description', {
              from: item.consumeAmount,
              to: pendingFormValues?.consumeAmount,
            })}
          </AlertDialogDescription>
          {pendingAdjustments && (
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
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAdjustments}>
              {t('items.detail.recipeAdjustDialog.updateButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Cloud mode has no locations and no ItemStock (deferred in PR D): a cloud
// Item carries its stock inline. So there is nothing to page over, nothing to
// add the item to and nothing to remove it from — this branch renders the bare
// form, exactly as the tab did before the pager existed. It deliberately does
// not mount the local-only hooks (useLocations / useItemStocks / the two
// location mutations, which throw in cloud mode) at all.
function CloudStockTab({ itemId }: { itemId: string }) {
  const { data: item } = useItem(itemId)
  if (!item) return null

  return (
    <div className="p-4 pb-16 bg-background-elevated min-h-[100cqh]">
      <StockFormPanel item={item} />
    </div>
  )
}

// Local mode: a pager across every location. Each page shows that location's
// own ItemStock — its form plus "Remove from location" when stocked, an empty
// state plus "Add to location" when not.
function LocalStockTab({ itemId }: { itemId: string }) {
  const { t } = useTranslation()
  const { data: item } = useItem(itemId)
  const { data: locations } = useLocations()
  const { data: stocks } = useItemStocks(itemId)
  const { activeLocationId } = useActiveLocation()
  const { isDirty, registerDirtyState } = useItemLayout()
  const addItemToLocation = useAddItemToLocation()
  const removeItemFromLocation = useRemoveItemFromLocation()

  const panelId = useId()
  const tabIdPrefix = useId()

  // null = "not paged yet", i.e. follow the active location.
  const [viewedLocationId, setViewedLocationId] = useState<string | null>(null)
  const [pendingPageIndex, setPendingPageIndex] = useState<number | null>(null)

  const ordered = locations ?? []
  const wantedIndex = ordered.findIndex(
    (l) => l.id === (viewedLocationId ?? activeLocationId),
  )
  const currentIndex = wantedIndex === -1 ? 0 : wantedIndex
  const viewed = ordered[currentIndex]

  // Scoped to the page being viewed, so the remove confirmation counts exactly
  // the rows that removal would delete.
  const logCount = useInventoryLogCountByItem(itemId, viewed?.id)
  const cartCount = useCartItemCountByItem(itemId, viewed?.id)

  if (!item || !locations || !stocks) return <LoadingSpinner />
  if (!viewed) return null

  const stock = stocks.find((s) => s.locationId === viewed.id)
  const showPager = ordered.length > 1

  const goToPage = (index: number) => {
    const target = ordered[index]
    if (!target) return
    // The form is remounted per page (`key={viewed.id}`), which drops its
    // edits — ask first rather than losing them silently. Turning the page
    // needs no explicit dirty reset: the remounted ItemForm reports
    // `onDirtyChange(false)` on mount.
    if (isDirty) {
      setPendingPageIndex(index)
      return
    }
    setViewedLocationId(target.id)
  }

  const confirmPageChange = () => {
    const target = pendingPageIndex === null ? null : ordered[pendingPageIndex]
    setPendingPageIndex(null)
    if (!target) return
    setViewedLocationId(target.id)
  }

  const handleAdd = async () => {
    await addItemToLocation.mutateAsync({ itemId, locationId: viewed.id })
  }

  const handleRemove = async () => {
    // Unlike turning the page, removing replaces the form with the not-stocked
    // empty state — no ItemForm mounts to report the dirty state back down. A
    // form left dirty would otherwise keep the tab guard armed for edits that
    // no longer exist anywhere.
    registerDirtyState(false)
    await removeItemFromLocation.mutateAsync({ itemId, locationId: viewed.id })
  }

  return (
    <div className="p-4 pb-16 bg-background-elevated min-h-[100cqh]">
      {showPager && (
        <LocationPager
          locations={ordered}
          currentIndex={currentIndex}
          activeLocationId={activeLocationId}
          onChange={goToPage}
          panelId={panelId}
          tabIdPrefix={tabIdPrefix}
        />
      )}

      <div
        id={panelId}
        {...(showPager
          ? {
              role: 'tabpanel',
              'aria-labelledby': `${tabIdPrefix}-${viewed.id}`,
            }
          : {})}
      >
        {stock ? (
          <>
            <StockFormPanel
              key={viewed.id}
              item={withLocationStock(item, stock)}
              locationId={viewed.id}
            />
            <div className="max-w-2xl mx-auto">
              <DeleteButton
                trigger={t('items.detail.locationPager.removeFromLocation')}
                buttonVariant="destructive-outline"
                buttonClassName="w-full max-w-2xl mt-4"
                dialogTitle={t('items.detail.removeLocationDialog.title', {
                  name: item.name,
                  location: viewed.name,
                })}
                dialogDescription={
                  <>
                    {t('items.detail.removeLocationDialog.description', {
                      name: item.name,
                      location: viewed.name,
                    })}
                    {/* Only once both counts have resolved — a half-rendered
                        "Inventory logs:  · Cart entries: " helps nobody. */}
                    {logCount.data !== undefined &&
                      cartCount.data !== undefined && (
                        <span className="mt-2 block">
                          {t('items.detail.removeLocationDialog.affected', {
                            logs: logCount.data,
                            carts: cartCount.data,
                          })}
                        </span>
                      )}
                  </>
                }
                confirmLabel={t('items.detail.removeLocationDialog.confirm')}
                onDelete={handleRemove}
              />
            </div>
          </>
        ) : (
          <div className="max-w-2xl mx-auto">
            <EmptyState
              title={t('items.detail.locationPager.notStockedTitle')}
              description={t(
                'items.detail.locationPager.notStockedDescription',
                { name: item.name, location: viewed.name },
              )}
            />
            <div className="flex justify-center">
              <Button
                type="button"
                onClick={handleAdd}
                disabled={addItemToLocation.isPending}
              >
                {t('items.detail.locationPager.addToLocation')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={pendingPageIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPageIndex(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.unsavedTitle')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('common.unsavedDescription')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPageIndex(null)}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmPageChange}>
              {t('common.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ItemStockTab() {
  const { id } = Route.useParams()
  const { mode } = useDataMode()
  // Split at the top so the cloud branch never mounts a location hook. The
  // two location mutations throw in cloud mode by design (Task 1), so a shared
  // component with runtime `if (isLocal)` guards would be one missed branch
  // away from a runtime error — the PR D trap.
  return mode === 'local' ? (
    <LocalStockTab itemId={id} />
  ) : (
    <CloudStockTab itemId={id} />
  )
}
