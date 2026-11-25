import type React from 'react'
import { ItemCountBar } from '@/components/item/ItemCountBar'
import { ItemProgressBar } from '@/components/item/ItemProgressBar'
import { CardTitle } from '@/components/ui/card'
import {
  getCurrentQuantity,
  getStockStatus,
  isInactive,
} from '@/lib/quantityUtils'
import type { PantryItem } from '@/types'
import { DEFAULT_PACKAGE_UNIT, isConsumable } from '@/types'

export interface ItemStockSummaryProps {
  // The joined per-location row, so the numbers and the bar are the active
  // location's.
  item: PantryItem
  // false: only the name. No quantity text, no bar, no "Inactive" word.
  // `ItemCard` passes false on the Settings assignment tabs.
  showStock?: boolean
  // Shown in place of `item.name`, for example the name with the search
  // match marked.
  name?: React.ReactNode
  // `h3` in `ItemCard`, where each card is a heading in the list. `span`
  // where a heading would be wrong, for example inside a dialog's
  // description (`CartAmountDialog`).
  nameAs?: 'h3' | 'span'
}

/**
 * The item name, the "x / y unit" text and the stock bar, as `ItemCard`
 * shows them. `ItemCard` and `CartAmountDialog` both render this, so the
 * two cannot show different numbers or bars.
 *
 * It returns two siblings (the name row and the bar) with no wrapper, so
 * the card's DOM is the same as before this was taken out of it. The
 * caller gives the wrapper.
 */
export function ItemStockSummary({
  item,
  showStock = true,
  name,
  nameAs = 'h3',
}: ItemStockSummaryProps) {
  const currentQuantity = getCurrentQuantity(item)
  const status = getStockStatus(currentQuantity, item.refillThreshold)
  const progressStatus = isInactive(item) ? 'inactive' : status
  // Convert packed quantity to measurement units for display when tracking in measurement
  const displayPacked =
    item.targetUnit === 'measurement' && item.amountPerPackage
      ? item.packedQuantity * item.amountPerPackage
      : item.packedQuantity

  const unitLabel =
    item.targetUnit === 'measurement' && item.measurementUnit
      ? item.measurementUnit
      : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)

  // A non-consumable item (cups, slippers) counts whole pieces: one square
  // per piece (`ItemCountBar`), no opened packs, no expiry. Turning the
  // switch off moves the item to packages, but an item that still tracks in a
  // measurement unit (for example from an old backup) is converted to pieces
  // here, the same way `ItemProgressBar` converts to segments.
  const consumable = isConsumable(item)
  const pieceScale =
    item.targetUnit === 'measurement' &&
    item.amountPerPackage &&
    item.amountPerPackage > 0
      ? item.amountPerPackage
      : 1
  const piecesInStock = Math.floor(currentQuantity / pieceScale)
  const piecesWanted = Math.floor(item.targetQuantity / pieceScale)

  // "Inactive" is targetQuantity === 0, a per-location fact. With stock
  // hidden the name must not say "Inactive" either.
  const showsInactive = showStock && isInactive(item)

  const NameTag = nameAs

  return (
    <>
      <CardTitle className="flex gap-1 items-baseline justify-between mb-1">
        <NameTag className="truncate capitalize">
          {showsInactive && <span className="sr-only">Inactive </span>}
          {name ?? item.name}
        </NameTag>
        <div className="flex-1" />
        {showStock && (
          // The unit is a trailing bare word inside the quantity's own
          // span (no parentheses, no pill) so it inherits
          // `text-foreground-muted` at FULL opacity. It used to be a
          // separate bordered `UnitBadge` at `opacity-75`, which
          // composited to 4.44:1 on the card surface and failed WCAG AA
          // — see docs/global/bugs/2026-08-29-bug-unit-badge-contrast.md.
          <span className="text-xs font-normal text-foreground-muted whitespace-nowrap">
            {!consumable
              ? `${piecesInStock} / ${piecesWanted} ${item.packageUnit || DEFAULT_PACKAGE_UNIT}`
              : item.unpackedQuantity > 0
                ? `${displayPacked} (+${item.unpackedQuantity}) / ${item.targetQuantity} ${unitLabel}`
                : `${currentQuantity} / ${item.targetQuantity} ${unitLabel}`}
          </span>
        )}
      </CardTitle>
      {showStock && !consumable && (
        <ItemCountBar
          current={piecesInStock}
          target={piecesWanted}
          status={progressStatus}
          refillThreshold={item.refillThreshold / pieceScale}
        />
      )}
      {showStock && consumable && (
        <ItemProgressBar
          current={currentQuantity}
          target={item.targetQuantity}
          status={progressStatus}
          targetUnit={item.targetUnit}
          packed={displayPacked}
          unpacked={item.unpackedQuantity}
          {...(item.measurementUnit
            ? { measurementUnit: item.measurementUnit }
            : {})}
          {...(item.amountPerPackage
            ? { amountPerPackage: item.amountPerPackage }
            : {})}
          // `item` is the joined per-location row, so this is the
          // active location's threshold.
          refillThreshold={item.refillThreshold}
        />
      )}
    </>
  )
}
