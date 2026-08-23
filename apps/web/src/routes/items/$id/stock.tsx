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
import type { ItemStock, Location, PantryItem, StockFields } from '@/types'

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
    // Shown as stored — see the same field in `$id/index.tsx`. 0 means "not
    // configured", not "a step of 1"; it is no longer the create default but
    // is still reachable.
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

// A wider update type that allows explicit `undefined` for the optional
// per-location due date. Passing `undefined` tells Dexie (local) to clear the
// property and tells toUpdateItemInput() (cloud) to send null so the server
// clears it. A separate type is needed because `exactOptionalPropertyTypes:
// true` prevents assigning `undefined` to a field typed `?: T`.
type ItemUpdatePayload = Omit<Partial<StockFields>, 'dueDate'> & {
  dueDate?: Date | undefined
}

// Build the per-location stock update. Everything global to the item — its
// identity AND its stock configuration (units, packaging, expiration mode,
// consume amount) — is persisted by the Info tab and is intentionally absent
// here: writing it from this page would mean one location editing all of them.
//
// `expirationMode` is read (never written) to decide whether this location's
// own due date applies at all.
function buildStockUpdates(values: ItemFormValues): ItemUpdatePayload {
  return {
    packedQuantity: values.packedQuantity,
    unpackedQuantity: values.unpackedQuantity,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    dueDate:
      values.expirationMode === 'date' && values.dueDate
        ? new Date(values.dueDate)
        : undefined,
  }
}

// The editable stock form for ONE (item × location) stock.
// `item` already carries the stock state of the location being edited;
// `locationId` routes the save to that location's ItemStock (omitted in cloud
// mode, which has no locations and writes inline stock on the Item).
//
// The recipe-adjust dialog is NOT here any more: it fires on a consumeAmount /
// targetUnit change, and both are global fields edited on the Info tab since
// v16. Hanging it off this page meant one location's edit rescaled every
// recipe — see routes/items/$id/index.tsx.
function StockFormPanel({
  item,
  locationId,
}: {
  item: PantryItem
  locationId?: string
}) {
  const updateItem = useUpdateItem()
  const { registerDirtyState } = useItemLayout()
  const { goBack } = useAppNavigation()
  const [savedAt, setSavedAt] = useState(0)

  const id = item.id

  const handleSubmit = async (values: ItemFormValues) => {
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

  return (
    <ItemForm
      initialValues={itemToFormValues(item)}
      sections={['stock']}
      onSubmit={handleSubmit}
      onDirtyChange={registerDirtyState}
      savedAt={savedAt}
      isPending={updateItem.isPending}
    />
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

// "Remove from location" and its confirmation. This is a component rather than
// inline JSX so the two count queries only exist while a stocked page is on
// screen: declared up in LocalStockTab they would run once against
// `locationId: undefined` (an item-global scan) before `useLocations()`
// resolves, then re-key and run again.
function RemoveFromLocationButton({
  itemId,
  itemName,
  location,
  onRemove,
}: {
  itemId: string
  itemName: string
  location: Location
  onRemove: () => Promise<void>
}) {
  const { t } = useTranslation()
  // Scoped to this page, so the confirmation counts exactly the rows removal
  // would delete — an item-global count would over-report.
  const logCount = useInventoryLogCountByItem(itemId, location.id)
  const cartCount = useCartItemCountByItem(itemId, location.id)

  return (
    <DeleteButton
      trigger={t('items.detail.locationPager.removeFromLocation')}
      buttonVariant="destructive-outline"
      buttonClassName="w-full max-w-2xl mt-4"
      dialogTitle={t('items.detail.removeLocationDialog.title', {
        name: itemName,
        location: location.name,
      })}
      dialogDescription={
        <>
          {t('items.detail.removeLocationDialog.description', {
            name: itemName,
            location: location.name,
          })}
          {/* Only once both counts have resolved — a half-rendered
              "Inventory logs:  · Cart entries: " helps nobody. */}
          {logCount.data !== undefined && cartCount.data !== undefined && (
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
      onDelete={onRemove}
    />
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
  const [addFailed, setAddFailed] = useState(false)

  const ordered = locations ?? []
  const wantedIndex = ordered.findIndex(
    (l) => l.id === (viewedLocationId ?? activeLocationId),
  )
  const currentIndex = wantedIndex === -1 ? 0 : wantedIndex
  const viewed = ordered[currentIndex]

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
    // Caught rather than left to reject: this runs straight off an onClick, so
    // a failure would otherwise be an unhandled rejection with nothing on
    // screen to tell the user the add never happened.
    setAddFailed(false)
    try {
      await addItemToLocation.mutateAsync({ itemId, locationId: viewed.id })
    } catch {
      setAddFailed(true)
    }
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
              <RemoveFromLocationButton
                itemId={itemId}
                itemName={item.name}
                location={viewed}
                onRemove={handleRemove}
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
            <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                onClick={handleAdd}
                disabled={addItemToLocation.isPending}
              >
                {t('items.detail.locationPager.addToLocation')}
              </Button>
              {addFailed && (
                <p
                  role="alert"
                  className="text-sm text-status-error-foreground"
                >
                  {t('items.detail.locationPager.addFailed', {
                    name: item.name,
                    location: viewed.name,
                  })}
                </p>
              )}
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
