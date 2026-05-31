import { useEffect, useState } from 'react'
import { ItemProgressBar } from '@/components/item/ItemProgressBar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import { getStockStatus, isInactive } from '@/lib/quantityUtils'
import type { Item } from '@/types'

interface QuickUpdateDialogProps {
  item: Item
  isOpen: boolean
  onClose: () => void
  onSubmit: (updates: {
    packedQuantity: number
    unpackedQuantity: number
  }) => Promise<void>
}

export function QuickUpdateDialog({
  item,
  isOpen,
  onClose,
  onSubmit,
}: QuickUpdateDialogProps) {
  const [localPacked, setLocalPacked] = useState(item.packedQuantity)
  const [localUnpacked, setLocalUnpacked] = useState(item.unpackedQuantity)
  const [isPending, setIsPending] = useState(false)

  // Reset local state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalPacked(item.packedQuantity)
      setLocalUnpacked(item.unpackedQuantity)
    }
  }, [isOpen, item.packedQuantity, item.unpackedQuantity])

  const step = item.consumeAmount ?? 1

  // Row labels
  const packedLabel = item.packageUnit ?? 'Packed'
  const unpackedLabel = item.measurementUnit ?? 'Unpacked'

  // Progress display values
  const localDisplayPacked =
    item.targetUnit === 'measurement' && item.amountPerPackage
      ? localPacked * item.amountPerPackage
      : localPacked

  const localTotal =
    item.targetUnit === 'measurement' && item.amountPerPackage
      ? localPacked * item.amountPerPackage + localUnpacked
      : localPacked + localUnpacked

  const localStatus = getStockStatus(localTotal, item.refillThreshold)
  const localProgressStatus = isInactive(item) ? 'inactive' : localStatus

  // Text label below bar
  const unitLabel =
    item.targetUnit === 'measurement' && item.measurementUnit
      ? item.measurementUnit
      : (item.packageUnit ?? 'unit')

  const quantityLabel =
    localUnpacked > 0
      ? `${localDisplayPacked} (+${localUnpacked}) / ${item.targetQuantity} ${unitLabel}`
      : `${localTotal} / ${item.targetQuantity} ${unitLabel}`

  async function handleSubmit() {
    setIsPending(true)
    try {
      await onSubmit({
        packedQuantity: localPacked,
        unpackedQuantity: localUnpacked,
      })
      // onClose() is called by the parent on success — don't call it here
    } catch {
      // Keep dialog open on error
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Update <span className="capitalize">{item.name}</span>
          </DialogTitle>
        </DialogHeader>

        <DialogMain className="space-y-4">
          {/* Packed row */}
          <div className="flex items-center gap-2">
            <span className="w-20 text-sm text-foreground-muted shrink-0">
              {packedLabel}
            </span>
            <Button
              variant="neutral-outline"
              size="icon"
              aria-label="Decrease packed"
              disabled={localPacked === 0 || isPending}
              onClick={() => setLocalPacked((v) => Math.max(0, v - step))}
            >
              −
            </Button>
            <input
              type="number"
              min="0"
              className="w-16 text-center border border-accessory-default rounded-sm bg-background-surface px-2 py-1 text-sm disabled:opacity-50"
              value={localPacked}
              disabled={isPending}
              onChange={(e) => {
                const parsed = Number.parseFloat(e.target.value)
                setLocalPacked(Number.isNaN(parsed) ? 0 : parsed)
              }}
              onBlur={(e) => {
                const parsed = Number.parseFloat(e.target.value)
                setLocalPacked(Math.max(0, Number.isNaN(parsed) ? 0 : parsed))
              }}
            />
            <Button
              variant="neutral-outline"
              size="icon"
              aria-label="Increase packed"
              disabled={isPending}
              onClick={() => setLocalPacked((v) => v + step)}
            >
              +
            </Button>
          </div>

          {/* Unpacked row */}
          <div className="flex items-center gap-2">
            <span className="w-20 text-sm text-foreground-muted shrink-0">
              {unpackedLabel}
            </span>
            <Button
              variant="neutral-outline"
              size="icon"
              aria-label="Decrease unpacked"
              disabled={localUnpacked === 0 || isPending}
              onClick={() => setLocalUnpacked((v) => Math.max(0, v - step))}
            >
              −
            </Button>
            <input
              type="number"
              min="0"
              className="w-16 text-center border border-accessory-default rounded-sm bg-background-surface px-2 py-1 text-sm disabled:opacity-50"
              value={localUnpacked}
              disabled={isPending}
              onChange={(e) => {
                const parsed = Number.parseFloat(e.target.value)
                setLocalUnpacked(Number.isNaN(parsed) ? 0 : parsed)
              }}
              onBlur={(e) => {
                const parsed = Number.parseFloat(e.target.value)
                setLocalUnpacked(Math.max(0, Number.isNaN(parsed) ? 0 : parsed))
              }}
            />
            <Button
              variant="neutral-outline"
              size="icon"
              aria-label="Increase unpacked"
              disabled={isPending}
              onClick={() => setLocalUnpacked((v) => v + step)}
            >
              +
            </Button>
          </div>

          {/* Quick action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="neutral-outline"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setLocalPacked(0)
                setLocalUnpacked(0)
              }}
            >
              Clear
            </Button>
            <Button
              variant="neutral"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setLocalPacked(item.targetQuantity)
                setLocalUnpacked(0)
              }}
            >
              Fill to Full
            </Button>
            {item.packageUnit && (
              <Button
                variant="neutral-outline"
                size="sm"
                disabled={localPacked === 0 || isPending}
                onClick={() => {
                  setLocalPacked((v) => Math.max(0, v - 1))
                  setLocalUnpacked((v) => v + (item.amountPerPackage ?? 1))
                }}
              >
                Open Package
              </Button>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <ItemProgressBar
              current={localTotal}
              target={item.targetQuantity}
              status={localProgressStatus}
              targetUnit={item.targetUnit}
              packed={localDisplayPacked}
              unpacked={localUnpacked}
              {...(item.measurementUnit
                ? { measurementUnit: item.measurementUnit }
                : {})}
              {...(item.amountPerPackage
                ? { amountPerPackage: item.amountPerPackage }
                : {})}
            />
            <p className="text-xs text-foreground-muted">{quantityLabel}</p>
          </div>
        </DialogMain>

        <DialogFooter>
          <Button
            variant="neutral-outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            isLoading={isPending}
            disabled={isPending}
            onClick={handleSubmit}
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
