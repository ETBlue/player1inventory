import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QuantityStepper } from '@/components/item/QuantityStepper'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { PantryItem } from '@/types'
import { DEFAULT_PACKAGE_UNIT } from '@/types'

interface CartAmountDialogProps {
  // The joined row of the ACTIVE location, so the context line shows the
  // stock and target of the cart's own location.
  item: PantryItem
  // `edit`: the item is in the cart and `initialAmount` is its amount there.
  // Save stays off until the amount changes.
  // `add`: the item is not in the cart yet and `initialAmount` is the
  // suggested amount (`suggestedCartAmount`). Save is on from the start.
  mode: 'add' | 'edit'
  initialAmount: number
  onClose: () => void
  // Called ONCE per Save, with the amount in the field. The parent closes the
  // dialog when it resolves. When it rejects, the dialog stays open with the
  // number kept and says the change was not saved.
  onSubmit: (amount: number) => Promise<void>
}

// A whole number, 0 or more. `type="number"` gives an empty string for
// anything it cannot read, so "" and "abc" both fail here.
function parseAmount(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return Number(trimmed)
}

// Stock and target are in the tracking unit and may be fractions (0.7 L).
// Two decimals is enough to read, and drops float noise.
function formatQuantity(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * Sets how many packs of one item the cart buys, with ONE request.
 *
 * Before this dialog the cart row had `− n +` buttons, and each press sent
 * one request, so going from 1 to 10 cost 9 round trips
 * (`docs/features/shopping/2026-11-25-cart-amount-dialog-design.md`).
 *
 * Mount it only while it is open: its state starts from the props once, and
 * a new open is a new mount.
 */
export function CartAmountDialog({
  item,
  mode,
  initialAmount,
  onClose,
  onSubmit,
}: CartAmountDialogProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(String(initialAmount))
  const [isPending, setIsPending] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const zeroNoteId = useId()

  const amount = parseAmount(text)
  const packageUnit = item.packageUnit || DEFAULT_PACKAGE_UNIT
  // The same unit and numbers the item card shows on the cart page.
  const trackingUnit =
    item.targetUnit === 'measurement' && item.measurementUnit
      ? item.measurementUnit
      : packageUnit

  const isUnchanged = mode === 'edit' && amount === initialAmount
  const saveDisabled = amount === null || isUnchanged || isPending

  async function handleSave() {
    if (amount === null) return
    setIsPending(true)
    setSaveFailed(false)
    try {
      await onSubmit(amount)
      // The parent closes the dialog on success.
    } catch {
      setSaveFailed(true)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // No close while a save runs: the result would land on a closed
        // dialog, and a failure would be shown nowhere.
        if (!open && !isPending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="capitalize">{item.name}</DialogTitle>
          <DialogDescription>
            {t('shopping.amountDialog.context', {
              stock: formatQuantity(getCurrentQuantity(item)),
              target: formatQuantity(item.targetQuantity),
              unit: trackingUnit,
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogMain>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground-muted shrink-0">
                {t('shopping.amountDialog.amountLabel', { unit: packageUnit })}
              </span>
              <QuantityStepper
                value={amount ?? 0}
                onStep={(next) => setText(String(next))}
                step={1}
                decreaseLabel={t('shopping.amountDialog.decrease')}
                increaseLabel={t('shopping.amountDialog.increase')}
                disabled={isPending}
                inputProps={{
                  step: 1,
                  inputMode: 'numeric',
                  'aria-label': t('shopping.amountDialog.amountLabel', {
                    unit: packageUnit,
                  }),
                  'aria-describedby': amount === 0 ? zeroNoteId : undefined,
                  value: text,
                  autoFocus: true,
                  onChange: (e) => setText(e.target.value),
                  // Enter in the field saves, like pressing Save
                  onKeyDown: (e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    if (!saveDisabled) void handleSave()
                  },
                }}
              />
            </div>
            {amount === 0 && (
              <p id={zeroNoteId} className="mt-2 text-sm text-foreground-muted">
                {t('shopping.amountDialog.zeroNote')}
              </p>
            )}
          </div>
          {saveFailed && (
            <p
              role="alert"
              className="mt-4 text-sm text-status-error-foreground"
            >
              {t('common.saveFailed')}
            </p>
          )}
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
            variant="primary"
            isLoading={isPending}
            disabled={saveDisabled}
            onClick={handleSave}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
