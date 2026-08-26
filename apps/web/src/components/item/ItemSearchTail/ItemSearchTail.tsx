import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ListSectionDivider } from '@/components/shared/ListSectionDivider'
import { Button } from '@/components/ui/button'
import type { PantryItem } from '@/types'

export interface ItemSearchTailAction {
  /** Already-translated button label, e.g. "Apply Costco" / "Add to My Home". */
  label: string
  onAction: (item: PantryItem) => void
  /**
   * The row whose button shows a spinner. While set, EVERY button in that
   * section is disabled — one mutation at a time keeps the two-step gate
   * unambiguous.
   */
  pendingItemId?: string | null
  icon?: ReactNode
}

interface ItemSearchTailProps {
  /** Bucket 2 — stocked here, absent from the page's list. */
  inLocationItems: PantryItem[]
  /** Bucket 3 — exists globally, not stocked here. */
  notStockedHereItems: PantryItem[]
  /** The caller's own card renderer, so each page keeps its card configuration. */
  renderItem: (item: PantryItem) => ReactNode
  /** Bucket 2's action button. */
  groupAction?: ItemSearchTailAction
  /**
   * Bucket 2's fallback when the group cannot be joined by a press — renders
   * inert explanatory text in the button's place, so the row still says WHY it
   * is not actionable rather than sitting there silently. The no-vendor cart
   * uses it to name the vendor groups holding the item, because "join this
   * group" there would mean stripping every vendor from it.
   *
   * Ignored when `groupAction` is also set; pass exactly one.
   */
  groupNote?: (item: PantryItem) => ReactNode
  /**
   * Bucket 3's action. OMIT to suppress the section: cloud mode (no
   * `ItemStock` backend — `useAddItemToLocation` throws there), or while the
   * active location has not resolved yet (its name is in the label).
   */
  addToLocationAction?: ItemSearchTailAction
}

// The two tail sections beneath a location-scoped item list while searching.
//
// The sections are ordered and labelled to make the two-step gate structural:
// an item in the lower section is not here yet, and its ONLY action stocks it
// at the active location — which moves the row up into the section above,
// where the group action lives as a SECOND, separate press. Stocking an item
// at a location should be prudent and explicit, not something a single press
// achieves by accident.
export function ItemSearchTail({
  inLocationItems,
  notStockedHereItems,
  renderItem,
  groupAction,
  groupNote,
  addToLocationAction,
}: ItemSearchTailProps) {
  const { t } = useTranslation()

  // Each section is "on" only when it has both rows to show and a way to act
  // on them. Deriving that once — rather than testing it in the boolean and
  // again in the JSX — keeps the answer in a single place, and lets the
  // derived value carry the non-undefined action into the render.
  const notStockedHereAction =
    addToLocationAction && notStockedHereItems.length > 0
      ? addToLocationAction
      : null
  const showInLocation =
    (!!groupAction || !!groupNote) && inLocationItems.length > 0

  if (!showInLocation && !notStockedHereAction) return null

  const actionButton = (item: PantryItem, action: ItemSearchTailAction) => (
    <Button
      size="sm"
      variant="neutral-outline"
      className="mx-2 shrink-0"
      // Every row's button carries the same visible label, so the accessible
      // name has to name the row too — otherwise the whole section is a pile
      // of identically-named buttons to a screen reader and to a role query.
      aria-label={t('items.searchTail.rowAction', {
        action: action.label,
        name: item.name,
      })}
      disabled={!!action.pendingItemId}
      isLoading={action.pendingItemId === item.id}
      {...(action.icon ? { icon: action.icon } : {})}
      onClick={() => action.onAction(item)}
    >
      {action.label}
    </Button>
  )

  const renderRow = (item: PantryItem, trailing: ReactNode) => (
    <div key={item.id} className="flex items-center bg-background-surface">
      <div className="min-w-0 flex-1">{renderItem(item)}</div>
      {trailing}
    </div>
  )

  return (
    <div className="space-y-px">
      {showInLocation && (
        <>
          <ListSectionDivider>
            {t('common.notInThisList', { count: inLocationItems.length })}
          </ListSectionDivider>
          {inLocationItems.map((item) =>
            renderRow(
              item,
              groupAction ? (
                actionButton(item, groupAction)
              ) : (
                // Not actionable — but never silent. The note says which other
                // group already holds the item, so the row explains itself.
                <span className="mx-3 shrink-0 text-foreground-muted text-xs">
                  {groupNote?.(item)}
                </span>
              ),
            ),
          )}
        </>
      )}
      {notStockedHereAction && (
        <>
          <ListSectionDivider>
            {t('common.notStockedHere', { count: notStockedHereItems.length })}
          </ListSectionDivider>
          {notStockedHereItems.map((item) =>
            renderRow(item, actionButton(item, notStockedHereAction)),
          )}
        </>
      )}
    </div>
  )
}
