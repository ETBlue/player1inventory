import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Minus,
  Package,
  PackageOpen,
  Plus,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemProgressBar } from '@/components/item/ItemProgressBar'
import { UnitBadge } from '@/components/shared/UnitBadge'
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
  computeFillToFull,
  computePack,
  computeUnpack,
  getStockStatus,
  isInactive,
  roundToStep,
} from '@/lib/quantityUtils'
import type { PantryItem } from '@/types'
import { DEFAULT_PACKAGE_UNIT } from '@/types'

interface QuickUpdateDialogProps {
  item: PantryItem
  isOpen: boolean
  onClose: () => void
  onSubmit: (updates: {
    packedQuantity: number
    unpackedQuantity: number
    targetQuantity: number
    refillThreshold: number
  }) => Promise<void>
}

export function QuickUpdateDialog({
  item,
  isOpen,
  onClose,
  onSubmit,
}: QuickUpdateDialogProps) {
  const { t } = useTranslation()
  const [localPacked, setLocalPacked] = useState(item.packedQuantity)
  const [localUnpacked, setLocalUnpacked] = useState(item.unpackedQuantity)
  const [localTarget, setLocalTarget] = useState(item.targetQuantity)
  const [localRefill, setLocalRefill] = useState(item.refillThreshold)
  const [isPending, setIsPending] = useState(false)

  // Reset local state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalPacked(item.packedQuantity)
      setLocalUnpacked(item.unpackedQuantity)
      setLocalTarget(item.targetQuantity)
      setLocalRefill(item.refillThreshold)
    }
  }, [
    isOpen,
    item.packedQuantity,
    item.unpackedQuantity,
    item.targetQuantity,
    item.refillThreshold,
  ])

  // Guard on `> 0`, not on nullish: `?? 1` does not fire for a stored 0, which
  // left `step` at 0 and made both +/− a no-op and `step="0"` invalid HTML.
  // Matches cooking.tsx and the recipe items tab.
  //
  // A stepper falls back to 1 where ItemForm deliberately does the opposite
  // (`quantityStep` → `step="any"`, no rounding, see ItemForm.tsx). That is not
  // an inconsistency to unify: a +/− increment must be non-zero to be usable at
  // all, so it needs *some* unit; a free-text number field can simply accept
  // whatever the user types and leave the unset consume amount visible as the
  // unconfigured setting it is.
  const step = item.consumeAmount > 0 ? item.consumeAmount : 1

  // Labels — matches item info tab format exactly
  const packedUnit = item.packageUnit || DEFAULT_PACKAGE_UNIT
  const unpackedUnit =
    item.targetUnit === 'measurement'
      ? item.measurementUnit
      : item.packageUnit || DEFAULT_PACKAGE_UNIT
  const packedAriaLabel = t('pantry.quickUpdate.packedField', {
    unit: packedUnit,
  })
  const unpackedAriaLabel = t('pantry.quickUpdate.unpackedField', {
    unit: unpackedUnit,
  })
  // Target and refill are stored in the item's TRACKING unit — the same unit
  // the unpacked row uses, not the package unit.
  const targetAriaLabel = t('pantry.quickUpdate.targetField', {
    unit: unpackedUnit,
  })
  const refillAriaLabel = t('pantry.quickUpdate.refillField', {
    unit: unpackedUnit,
  })

  // Stock-settings steps mirror ItemForm's `step` values for the same two
  // fields: the target counts whole packages in package mode
  // (`targetUnit === 'package' ? 1 : quantityStep`), while the refill threshold
  // always moves by the consume amount. Only the fallback differs — see the
  // `step` comment above.
  const targetStep = item.targetUnit === 'package' ? 1 : step
  const normalizeTarget = (value: number) =>
    item.targetUnit === 'package' ? value : roundToStep(value, step)
  const normalizeRefill = (value: number) => roundToStep(value, step)
  const bumpTarget = (value: number, delta: number) =>
    Math.max(0, normalizeTarget(value + delta))
  const bumpRefill = (value: number, delta: number) =>
    Math.max(0, normalizeRefill(value + delta))

  // Progress display values
  const localDisplayPacked =
    item.targetUnit === 'measurement' && item.amountPerPackage
      ? localPacked * item.amountPerPackage
      : localPacked

  const localTotal =
    item.targetUnit === 'measurement' && item.amountPerPackage
      ? localPacked * item.amountPerPackage + localUnpacked
      : localPacked + localUnpacked

  // Every display below reads the LOCAL target/refill, never the stored ones,
  // so the preview follows what has been typed but not yet saved.
  const localStatus = getStockStatus(localTotal, localRefill)
  const localProgressStatus = isInactive({
    ...item,
    targetQuantity: localTarget,
  })
    ? 'inactive'
    : localStatus

  // Text label below progress bar
  const unitLabel =
    item.targetUnit === 'measurement' && item.measurementUnit
      ? item.measurementUnit
      : (item.packageUnit ?? 'unit')

  const quantityLabel =
    localUnpacked > 0
      ? `${localDisplayPacked} (+${localUnpacked}) / ${localTarget}`
      : `${localTotal} / ${localTarget}`

  const isAtZero = localPacked === 0 && localUnpacked === 0
  // Fill to Full aims at the target currently in the input, not the stored one.
  const fillToFullState = computeFillToFull({
    ...item,
    targetQuantity: localTarget,
  })
  const isAtFull =
    localPacked === fillToFullState.packedQuantity &&
    localUnpacked === fillToFullState.unpackedQuantity
  const isUntouched =
    localPacked === item.packedQuantity &&
    localUnpacked === item.unpackedQuantity &&
    localTarget === item.targetQuantity &&
    localRefill === item.refillThreshold

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
        targetQuantity: localTarget,
        refillThreshold: localRefill,
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
            {t('pantry.quickUpdate.title')}{' '}
            <span className="capitalize">{item.name}</span>
          </DialogTitle>
        </DialogHeader>

        <DialogMain className="space-y-4">
          <div className="grid grid-cols-[auto_auto_auto] items-center gap-2">
            {/* Packed row — label format matches item info tab */}
            <span className="text-sm text-foreground-muted shrink-0">
              {t('pantry.quickUpdate.packedLabel')}{' '}
              <span className="text-xs font-normal">({packedUnit})</span>
            </span>
            <div className="flex items-center gap-0">
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -mr-[1px] rounded-tr-none rounded-br-none"
                aria-label={t('pantry.quickUpdate.decreasePacked')}
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
                aria-label={t('pantry.quickUpdate.increasePacked')}
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
              {t('pantry.quickUpdate.unpack')}
            </Button>

            {/* Unpacked row — label format matches item info tab */}
            <span className="text-sm text-foreground-muted shrink-0">
              {t('pantry.quickUpdate.unpackedLabel')}{' '}
              <span className="text-xs font-normal">({unpackedUnit})</span>
            </span>
            <div className="flex items-center gap-0">
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -mr-[1px] rounded-tr-none rounded-br-none"
                aria-label={t('pantry.quickUpdate.decreaseUnpacked')}
                disabled={localUnpacked === 0 || isPending}
                onClick={() =>
                  setLocalUnpacked((v) =>
                    Math.max(0, roundToStep(v - step, step)),
                  )
                }
                icon={<Minus className="h-4 w-4" />}
              />
              <Input
                type="number"
                min="0"
                step={step}
                aria-label={unpackedAriaLabel}
                className="h-7 rounded-none text-right"
                value={localUnpacked}
                disabled={isPending}
                onChange={(e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalUnpacked(
                    Number.isNaN(parsed) ? 0 : roundToStep(parsed, step),
                  )
                }}
                onBlur={(e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalUnpacked(
                    Math.max(
                      0,
                      Number.isNaN(parsed) ? 0 : roundToStep(parsed, step),
                    ),
                  )
                }}
              />
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -ml-[1px] rounded-tl-none rounded-bl-none"
                aria-label={t('pantry.quickUpdate.increaseUnpacked')}
                disabled={isPending}
                onClick={() =>
                  setLocalUnpacked((v) => roundToStep(v + step, step))
                }
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
              {t('pantry.quickUpdate.pack')}
            </Button>
          </div>

          {/* Progress bar + clear/fill actions */}
          <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
            <Button
              variant="neutral-outline"
              size="icon-sm"
              aria-label={t('common.clear')}
              disabled={isPending || isAtZero}
              onClick={() => {
                setLocalPacked(0)
                setLocalUnpacked(0)
              }}
              icon={<ArrowLeftToLine />}
            />
            <div className="space-y-1">
              <div className="flex gap-1 items-baseline text-xs text-right text-foreground-muted">
                <span className="flex-1" />
                <span>{quantityLabel}</span>
                <UnitBadge unit={unitLabel} />
              </div>
              <ItemProgressBar
                current={localTotal}
                target={localTarget}
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
            </div>
            <Button
              variant="neutral-outline"
              size="icon-sm"
              aria-label={t('pantry.quickUpdate.fillToFull')}
              disabled={isPending || isAtFull}
              onClick={() => {
                setLocalPacked(fillToFullState.packedQuantity)
                setLocalUnpacked(fillToFullState.unpackedQuantity)
              }}
              icon={<ArrowRightToLine />}
            />
          </div>

          {/* Stock settings — the same per-location target/refill pair the item
              form owns, editable here so a low-stock warning can be tuned from
              the pantry list. Row shape mirrors the Packed/Unpacked rows above:
              label, joined stepper, then a hint where Unpack/Pack sit. */}
          <div className="grid grid-cols-[auto_auto_auto] items-center gap-2">
            {/* Target row */}
            <span className="text-sm text-foreground-muted shrink-0">
              {t('pantry.quickUpdate.targetLabel')}{' '}
              <span className="text-xs font-normal">({unpackedUnit})</span>
            </span>
            <div className="flex items-center gap-0">
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -mr-[1px] rounded-tr-none rounded-br-none"
                aria-label={t('pantry.quickUpdate.decreaseTarget')}
                disabled={localTarget === 0 || isPending}
                onClick={() =>
                  setLocalTarget((v) => bumpTarget(v, -targetStep))
                }
                icon={<Minus className="h-4 w-4" />}
              />
              <Input
                type="number"
                min="0"
                step={targetStep}
                aria-label={targetAriaLabel}
                className="h-7 rounded-none text-right"
                value={localTarget}
                disabled={isPending}
                onChange={(e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalTarget(
                    Number.isNaN(parsed) ? 0 : normalizeTarget(parsed),
                  )
                }}
                onBlur={(e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalTarget(
                    Math.max(
                      0,
                      Number.isNaN(parsed) ? 0 : normalizeTarget(parsed),
                    ),
                  )
                }}
              />
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -ml-[1px] rounded-tl-none rounded-bl-none"
                aria-label={t('pantry.quickUpdate.increaseTarget')}
                disabled={isPending}
                onClick={() => setLocalTarget((v) => bumpTarget(v, targetStep))}
                icon={<Plus className="h-4 w-4" />}
              />
            </div>
            <span className="text-xs text-foreground-muted">
              {t('pantry.quickUpdate.targetHint')}
            </span>

            {/* Refill row */}
            <span className="text-sm text-foreground-muted shrink-0">
              {t('pantry.quickUpdate.refillLabel')}{' '}
              <span className="text-xs font-normal">({unpackedUnit})</span>
            </span>
            <div className="flex items-center gap-0">
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -mr-[1px] rounded-tr-none rounded-br-none"
                aria-label={t('pantry.quickUpdate.decreaseRefill')}
                disabled={localRefill === 0 || isPending}
                onClick={() => setLocalRefill((v) => bumpRefill(v, -step))}
                icon={<Minus className="h-4 w-4" />}
              />
              <Input
                type="number"
                min="0"
                step={step}
                aria-label={refillAriaLabel}
                className="h-7 rounded-none text-right"
                value={localRefill}
                disabled={isPending}
                onChange={(e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalRefill(
                    Number.isNaN(parsed) ? 0 : normalizeRefill(parsed),
                  )
                }}
                onBlur={(e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalRefill(
                    Math.max(
                      0,
                      Number.isNaN(parsed) ? 0 : normalizeRefill(parsed),
                    ),
                  )
                }}
              />
              <Button
                variant="neutral-outline"
                size="icon-sm"
                className="flex-shrink-0 -ml-[1px] rounded-tl-none rounded-bl-none"
                aria-label={t('pantry.quickUpdate.increaseRefill')}
                disabled={isPending}
                onClick={() => setLocalRefill((v) => bumpRefill(v, step))}
                icon={<Plus className="h-4 w-4" />}
              />
            </div>
            <span className="text-xs text-foreground-muted">
              {t('pantry.quickUpdate.refillHint')}
            </span>
          </div>
        </DialogMain>

        <DialogFooter>
          <Button
            variant="neutral-outline"
            onClick={onClose}
            disabled={isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            isLoading={isPending}
            disabled={isPending || isUntouched}
            onClick={handleSubmit}
          >
            {t('pantry.quickUpdate.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
