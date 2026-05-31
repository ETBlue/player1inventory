import {
  Blocks,
  BrushCleaning,
  Minus,
  Package,
  PackageOpen,
  Plus,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import {
  computePack,
  computeUnpack,
  getStockStatus,
  isInactive,
} from '@/lib/quantityUtils'
import type { Item } from '@/types'
import { DEFAULT_PACKAGE_UNIT } from '@/types'

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

  // Labels — matches item info tab format exactly
  const packedUnit = item.packageUnit || DEFAULT_PACKAGE_UNIT
  const unpackedUnit =
    item.targetUnit === 'measurement'
      ? item.measurementUnit
      : item.packageUnit || DEFAULT_PACKAGE_UNIT
  const packedAriaLabel = `Packed (${packedUnit})`
  const unpackedAriaLabel = `Unpacked (${unpackedUnit})`

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

  // Text label below progress bar
  const unitLabel =
    item.targetUnit === 'measurement' && item.measurementUnit
      ? item.measurementUnit
      : (item.packageUnit ?? 'unit')

  const quantityLabel =
    localUnpacked > 0
      ? `${localDisplayPacked} (+${localUnpacked}) / ${item.targetQuantity} ${unitLabel}`
      : `${localTotal} / ${item.targetQuantity} ${unitLabel}`

  // Unpack: open one package → unpacked. Mirrors item info tab exactly.
  // Unpack disabled: mirrors item info tab (packedQuantity < 1)
  const unpackDisabled = localPacked < 1 || isPending

  function handleUnpack() {
    const next = computeUnpack(item, {
      packedQuantity: localPacked,
      unpackedQuantity: localUnpacked,
    })
    setLocalPacked(next.packedQuantity)
    setLocalUnpacked(next.unpackedQuantity)
  }

  // Pack: consolidate unpacked → packed. Mirrors item info tab exactly.
  const packDisabled =
    isPending ||
    (item.targetUnit === 'package'
      ? localUnpacked < 1
      : item.targetUnit === 'measurement'
        ? !item.amountPerPackage ||
          localUnpacked < Number(item.amountPerPackage)
        : true)

  function handlePack() {
    const next = computePack(item, {
      packedQuantity: localPacked,
      unpackedQuantity: localUnpacked,
    })
    setLocalPacked(next.packedQuantity)
    setLocalUnpacked(next.unpackedQuantity)
  }

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
          <div className="grid grid-cols-[auto_auto_auto] items-center gap-2">
            {/* Packed row — label format matches item info tab */}
            <span className="text-sm text-foreground-muted shrink-0">
              Packed <span className="text-xs font-normal">({packedUnit})</span>
            </span>
            <div className="flex items-center gap-0">
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -mr-[1px] rounded-tr-none rounded-br-none"
                aria-label="Decrease packed"
                disabled={localPacked === 0 || isPending}
                onClick={() => setLocalPacked((v) => Math.max(0, v - 1))}
                icon={<Minus className="h-4 w-4" />}
              />
              <Input
                type="number"
                min="0"
                aria-label={packedAriaLabel}
                className="h-7 rounded-none text-right"
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
                size="icon-sm"
                className="flex-shrink-0 -ml-[1px] rounded-tl-none rounded-bl-none"
                aria-label="Increase packed"
                disabled={isPending}
                onClick={() => setLocalPacked((v) => v + 1)}
                icon={<Plus className="h-4 w-4" />}
              />
            </div>
            {/* Disabled condition mirrors item info tab: packedQuantity < 1 */}
            <Button
              type="button"
              variant="neutral-outline"
              size="sm"
              disabled={unpackDisabled}
              onClick={handleUnpack}
              icon={<PackageOpen />}
            >
              Unpack
            </Button>

            {/* Unpacked row — label format matches item info tab */}
            <span className="text-sm text-foreground-muted shrink-0">
              Unpacked{' '}
              <span className="text-xs font-normal">({unpackedUnit})</span>
            </span>
            <div className="flex items-center gap-0">
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -mr-[1px] rounded-tr-none rounded-br-none"
                aria-label="Decrease unpacked"
                disabled={localUnpacked === 0 || isPending}
                onClick={() => setLocalUnpacked((v) => Math.max(0, v - step))}
                icon={<Minus className="h-4 w-4" />}
              />
              <Input
                type="number"
                min="0"
                aria-label={unpackedAriaLabel}
                className="h-7 rounded-none text-right"
                value={localUnpacked}
                disabled={isPending}
                onChange={(e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalUnpacked(Number.isNaN(parsed) ? 0 : parsed)
                }}
                onBlur={(e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalUnpacked(
                    Math.max(0, Number.isNaN(parsed) ? 0 : parsed),
                  )
                }}
              />
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -ml-[1px] rounded-tl-none rounded-bl-none"
                aria-label="Increase unpacked"
                disabled={isPending}
                onClick={() => setLocalUnpacked((v) => v + step)}
                icon={<Plus className="h-4 w-4" />}
              />
            </div>
            {/* Disabled condition mirrors item info tab exactly */}
            <Button
              type="button"
              variant="neutral-outline"
              size="sm"
              disabled={packDisabled}
              onClick={handlePack}
              icon={<Package />}
            >
              Pack
            </Button>
          </div>

          {/* Progress bar + clear/fill actions */}
          <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
            <Button
              variant="neutral-outline"
              size="icon-sm"
              aria-label="Clear"
              disabled={isPending}
              onClick={() => {
                setLocalPacked(0)
                setLocalUnpacked(0)
              }}
              icon={<BrushCleaning />}
            />
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
            <Button
              variant="neutral-outline"
              size="icon-sm"
              aria-label="Fill to Full"
              disabled={isPending}
              onClick={() => {
                setLocalPacked(item.targetQuantity)
                setLocalUnpacked(0)
              }}
              icon={<Blocks />}
            />
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
