import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  hasVisibleTail,
  type ItemSearchTailAction,
  type ItemSearchTailProps,
} from '@/components/item/ItemSearchTail'
import { showSaveError } from '@/lib/saveError'
import type { PantryItem } from '@/types'
import { useActiveLocation } from './useActiveLocation'
import { useItemSearchTail } from './useItemSearchTail'
import { useAddItemToLocation } from './useItems'
import { usePermissions } from './usePermissions'

export interface ItemSearchTailGroupAction {
  /** Already-translated button label, e.g. "Apply Costco". */
  label: string
  // ASYNC — the hook awaits this to know when to clear the pending id, so
  // callers stop hand-writing { onSuccess: clear, onError: clear } pairs.
  // Use `mutateAsync`, not `mutate`.
  onAction: (item: PantryItem) => Promise<void>
  icon?: ReactNode
}

export interface UseItemSearchTailWiringOptions {
  /**
   * The ids the calling page is ALREADY rendering — must be memoized by the
   * caller; it is a dependency of `useItemSearchTail`'s derivation.
   */
  inGroupIds: ReadonlySet<string>
  /** The raw search box value. */
  query: string
  /** The caller's own card renderer, passed straight through to `tailProps`. */
  renderItem: (item: PantryItem) => ReactNode
  /** Applied to both buckets, in the caller's own sort order. */
  sortTail?: (list: PantryItem[]) => PantryItem[]
  /** Bucket 2's action. Omit to hide bucket 2 unless `groupNote` is given. */
  groupAction?: ItemSearchTailGroupAction
  /** Bucket 2's inert fallback when the group cannot be joined by a press. */
  groupNote?: (item: PantryItem) => ReactNode
}

export interface ItemSearchTailWiring {
  /** Spread straight into <ItemSearchTail>. */
  tailProps: ItemSearchTailProps
  /** hasVisibleTail(tailProps) — suppress the caller's own empty state with this. */
  hasTail: boolean
  /** Pass to ItemListToolbar's hasExactMatch (the #245 fix). */
  hasExactGlobalMatch: boolean
}

// The shared wiring behind every location-scoped item search's two-section
// tail: derives the buckets via useItemSearchTail, owns the one-mutation-at-a-
// time pending id, gates bucket 3's "Add to <location>" action on a resolved
// active location and the location role (a viewer gets the rows with no
// action), and assembles a complete, spreadable ItemSearchTailProps.
export function useItemSearchTailWiring({
  inGroupIds,
  query,
  renderItem,
  sortTail,
  groupAction,
  groupNote,
}: UseItemSearchTailWiringOptions): ItemSearchTailWiring {
  const { t } = useTranslation()
  const { activeLocation } = useActiveLocation()
  const addItemToLocation = useAddItemToLocation()
  // Every bucket-2 action (Apply vendor, Add to recipe, Add to shelf) writes
  // the CATALOG, which a household member may not do (households H5 task
  // F.5). For a member the action becomes a note that says why, so the row
  // still shows instead of vanishing. A caller's own `groupNote` is kept.
  // While the role is unknown (loading, or `GetHousehold` failed) there is
  // neither the action nor the member note: the note could be untrue.
  const { canEditCatalog, roleKnown, canEditLocation, roleAt } =
    usePermissions()
  const catalogNote = () => <span>{t('items.searchTail.catalogReadOnly')}</span>
  const effectiveAction = canEditCatalog ? groupAction : undefined
  const effectiveNote =
    groupNote ??
    (groupAction && roleKnown && !canEditCatalog ? catalogNote : undefined)
  // One tail mutation at a time — see ItemSearchTailAction.pendingItemId.
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)

  const { inLocation, notStockedHere, hasExactGlobalMatch } = useItemSearchTail(
    { inGroupIds, query },
  )

  const inLocationItems = sortTail ? sortTail(inLocation) : inLocation
  const notStockedHereItems = sortTail
    ? sortTail(notStockedHere)
    : notStockedHere

  // Wraps a caller's async onAction with the pending-id bookkeeping, so the
  // caller cannot forget it and every action clears the same way regardless
  // of outcome. A failure shows `failMessage(item)` as a toast, or
  // `common.saveFailed` when none is given (`showSaveError`, which shows
  // nothing more offline: `offlineWriteLink` already did).
  const wrapAction = (
    action: ItemSearchTailGroupAction,
    failMessage?: (item: PantryItem) => string,
  ): ItemSearchTailAction => ({
    label: action.label,
    icon: action.icon,
    pendingItemId,
    onAction: async (item: PantryItem) => {
      setPendingItemId(item.id)
      try {
        await action.onAction(item)
      } catch (err) {
        // Shown as a toast. Until 2026-11-19 this catch showed nothing: it
        // kept the behaviour of the code it replaced, whose `onError` only
        // cleared the pending id. Nothing else reports the failure — there is
        // no MutationCache-level onError and no error boundary
        // (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
        showSaveError(err, failMessage?.(item))
      } finally {
        setPendingItemId(null)
      }
    },
  })

  // Gated on the active location resolving (its name is in the button label,
  // the same guard NewItemDialog applies) and, since households H5 task F.6,
  // on the caller being `participant` or higher there: stocking an item is a
  // location write, and the server refuses it for a viewer. When false, omit
  // addToLocationAction entirely rather than passing a disabled one. Both
  // modes stock through `useAddItemToLocation`; local mode allows it always.
  const canAddToLocation =
    !!activeLocation && canEditLocation(activeLocation.id)
  // A KNOWN viewer of the active location still sees bucket 3, with no
  // action (owner decision 2026-11-17): the household's items are readable,
  // only stocking one here is not. While the role loads, or for no role,
  // bucket 3 stays hidden, as before.
  const listNotStockedHereReadOnly =
    !canAddToLocation &&
    !!activeLocation &&
    roleAt(activeLocation.id) === 'viewer'

  const tailProps: ItemSearchTailProps = {
    inLocationItems,
    notStockedHereItems,
    renderItem,
    ...(effectiveAction ? { groupAction: wrapAction(effectiveAction) } : {}),
    ...(effectiveNote ? { groupNote: effectiveNote } : {}),
    ...(canAddToLocation
      ? {
          addToLocationAction: wrapAction(
            {
              label: t('items.searchTail.addToLocation', {
                location: activeLocation?.name ?? '',
              }),
              onAction: async (item) => {
                await addItemToLocation.mutateAsync({ itemId: item.id })
              },
              icon: <Plus />,
            },
            (item) =>
              t('items.detail.locationPager.addFailed', {
                name: item.name,
                location: activeLocation?.name ?? '',
              }),
          ),
        }
      : {}),
    ...(listNotStockedHereReadOnly ? { notStockedHereReadOnly: true } : {}),
  }

  return {
    tailProps,
    hasTail: hasVisibleTail(tailProps),
    hasExactGlobalMatch,
  }
}
