import { Package, PackageOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QuantityStepper } from '@/components/item/QuantityStepper'
import { StockProgressRow } from '@/components/item/StockProgressRow'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  computeFillToFull,
  computePack,
  computeUnpack,
  getStockPreview,
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

  // Progress display values — every display below reads the LOCAL
  // target/refill, never the stored ones, so the preview follows what has
  // been typed but not yet saved.
  const preview = getStockPreview(
    {
      targetUnit: item.targetUnit,
      ...(item.measurementUnit
        ? { measurementUnit: item.measurementUnit }
        : {}),
      ...(item.packageUnit ? { packageUnit: item.packageUnit } : {}),
      ...(item.amountPerPackage
        ? { amountPerPackage: item.amountPerPackage }
        : {}),
      consumeAmount: item.consumeAmount,
    },
    {
      packedQuantity: localPacked,
      unpackedQuantity: localUnpacked,
      targetQuantity: localTarget,
      refillThreshold: localRefill,
    },
  )
  const localDisplayPacked = preview.displayPacked
  const localTotal = preview.current
  const localProgressStatus = preview.status
  const unitLabel = preview.unitLabel
  const quantityLabel = preview.quantityLabel
  const isAtZero = preview.isAtZero
  const isAtFull = preview.isAtFull
  // Fill to Full aims at the target currently in the input, not the stored
  // one — computed separately (not read off `preview`) because `onFill`
  // below needs the destination quantities, not just whether they're reached.
  const fillToFullState = computeFillToFull({
    ...item,
    targetQuantity: localTarget,
  })
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
          {/* Progress bar + clear/fill actions */}
          <StockProgressRow
            quantityLabel={quantityLabel}
            unitLabel={unitLabel}
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
            onClear={() => {
              setLocalPacked(0)
              setLocalUnpacked(0)
            }}
            onFill={() => {
              setLocalPacked(fillToFullState.packedQuantity)
              setLocalUnpacked(fillToFullState.unpackedQuantity)
            }}
            clearDisabled={isPending || isAtZero}
            fillDisabled={isPending || isAtFull}
            clearLabel={t('common.clear')}
            fillLabel={t('common.fillToFull')}
          />

          <div className="grid grid-cols-[auto_auto_auto] items-center gap-2">
            {/* Stock settings — the same per-location target/refill pair the item
                form owns, editable here so a low-stock warning can be tuned from
                the pantry list. Shares one grid with the Packed/Unpacked rows
                below rather than opening a second one, so all four steppers line
                up in one column: label, joined stepper, then a muted hint on
                these two rows and Unpack/Pack on the two below. */}
            {/* Target row */}
            <span className="text-sm text-foreground-muted shrink-0">
              {t('pantry.quickUpdate.targetLabel')}{' '}
              <span className="text-xs font-normal">({unpackedUnit})</span>
            </span>
            <QuantityStepper
              value={localTarget}
              onStep={setLocalTarget}
              step={targetStep}
              round={normalizeTarget}
              decreaseLabel={t('pantry.quickUpdate.decreaseTarget')}
              increaseLabel={t('pantry.quickUpdate.increaseTarget')}
              disabled={isPending}
              inputProps={{
                step: targetStep,
                'aria-label': targetAriaLabel,
                value: localTarget,
                onChange: (e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalTarget(
                    Number.isNaN(parsed) ? 0 : normalizeTarget(parsed),
                  )
                },
                onBlur: (e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalTarget(
                    Math.max(
                      0,
                      Number.isNaN(parsed) ? 0 : normalizeTarget(parsed),
                    ),
                  )
                },
              }}
            />
            <span className="text-xs text-foreground-muted">
              {t('pantry.quickUpdate.targetHint')}
            </span>

            {/* Refill row */}
            <span className="text-sm text-foreground-muted shrink-0">
              {t('pantry.quickUpdate.refillLabel')}{' '}
              <span className="text-xs font-normal">({unpackedUnit})</span>
            </span>
            <QuantityStepper
              value={localRefill}
              onStep={setLocalRefill}
              step={step}
              round={normalizeRefill}
              decreaseLabel={t('pantry.quickUpdate.decreaseRefill')}
              increaseLabel={t('pantry.quickUpdate.increaseRefill')}
              disabled={isPending}
              inputProps={{
                step,
                'aria-label': refillAriaLabel,
                value: localRefill,
                onChange: (e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalRefill(
                    Number.isNaN(parsed) ? 0 : normalizeRefill(parsed),
                  )
                },
                onBlur: (e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalRefill(
                    Math.max(
                      0,
                      Number.isNaN(parsed) ? 0 : normalizeRefill(parsed),
                    ),
                  )
                },
              }}
            />
            <span className="text-xs text-foreground-muted">
              {t('pantry.quickUpdate.refillHint')}
            </span>

            {/* Packed row — label format matches item info tab */}
            <span className="text-sm text-foreground-muted shrink-0">
              {t('pantry.quickUpdate.packedLabel')}{' '}
              <span className="text-xs font-normal">({packedUnit})</span>
            </span>
            <QuantityStepper
              value={localPacked}
              onStep={setLocalPacked}
              step={1}
              decreaseLabel={t('pantry.quickUpdate.decreasePacked')}
              increaseLabel={t('pantry.quickUpdate.increasePacked')}
              disabled={isPending}
              inputProps={{
                'aria-label': packedAriaLabel,
                value: localPacked,
                onChange: (e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalPacked(Number.isNaN(parsed) ? 0 : parsed)
                },
                onBlur: (e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalPacked(Math.max(0, Number.isNaN(parsed) ? 0 : parsed))
                },
              }}
            />
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
            <QuantityStepper
              value={localUnpacked}
              onStep={setLocalUnpacked}
              step={step}
              round={(n) => roundToStep(n, step)}
              decreaseLabel={t('pantry.quickUpdate.decreaseUnpacked')}
              increaseLabel={t('pantry.quickUpdate.increaseUnpacked')}
              disabled={isPending}
              inputProps={{
                step,
                'aria-label': unpackedAriaLabel,
                value: localUnpacked,
                onChange: (e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalUnpacked(
                    Number.isNaN(parsed) ? 0 : roundToStep(parsed, step),
                  )
                },
                onBlur: (e) => {
                  const parsed = Number.parseFloat(e.target.value)
                  setLocalUnpacked(
                    Math.max(
                      0,
                      Number.isNaN(parsed) ? 0 : roundToStep(parsed, step),
                    ),
                  )
                },
              }}
            />
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
