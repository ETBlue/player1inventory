import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  hasVisibleTail,
  type ItemSearchTailAction,
  type ItemSearchTailProps,
} from '@/components/item/ItemSearchTail'
import type { PantryItem } from '@/types'
import { useActiveLocation } from './useActiveLocation'
import { useDataMode } from './useDataMode'
import { useItemSearchTail } from './useItemSearchTail'
import { useAddItemToLocation } from './useItems'

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
// time pending id, gates bucket 3's "Add to <location>" action on local mode +
// a resolved active location (useAddItemToLocation THROWS in cloud mode), and
// assembles a complete, spreadable ItemSearchTailProps.
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
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const addItemToLocation = useAddItemToLocation()
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
  // of outcome — the mutation hook itself owns surfacing the error.
  const wrapAction = (
    action: ItemSearchTailGroupAction,
  ): ItemSearchTailAction => ({
    label: action.label,
    icon: action.icon,
    pendingItemId,
    onAction: async (item: PantryItem) => {
      setPendingItemId(item.id)
      try {
        await action.onAction(item)
      } catch {
        // the mutation hook owns surfacing; pending must clear regardless
      } finally {
        setPendingItemId(null)
      }
    },
  })

  // Local-mode only (useAddItemToLocation throws in cloud), and gated on the
  // active location resolving because its name is in the button label — the
  // same guard NewItemDialog applies for the same reason. When false, omit
  // addToLocationAction entirely rather than passing a disabled one.
  const canAddToLocation = !isCloud && !!activeLocation

  const tailProps: ItemSearchTailProps = {
    inLocationItems,
    notStockedHereItems,
    renderItem,
    ...(groupAction ? { groupAction: wrapAction(groupAction) } : {}),
    ...(groupNote ? { groupNote } : {}),
    ...(canAddToLocation
      ? {
          addToLocationAction: wrapAction({
            label: t('items.searchTail.addToLocation', {
              location: activeLocation?.name ?? '',
            }),
            onAction: async (item) => {
              await addItemToLocation.mutateAsync({ itemId: item.id })
            },
            icon: <Plus />,
          }),
        }
      : {}),
  }

  return {
    tailProps,
    hasTail: hasVisibleTail(tailProps),
    hasExactGlobalMatch,
  }
}
