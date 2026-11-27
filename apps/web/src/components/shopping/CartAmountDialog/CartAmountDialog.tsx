import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemStockSummary } from '@/components/item/ItemStockSummary'
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
import type { PantryItem } from '@/types'
import { DEFAULT_PACKAGE_UNIT } from '@/types'

interface CartAmountDialogProps {
  // The joined row of the ACTIVE location, so the stock row shows the
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
          {/* A generic title (owner request 2026-11-26). The item name is in
              the body, and the body's first row is the description, so a
              screen reader still hears which item this is. */}
          <DialogTitle>
            {mode === 'edit'
              ? t('shopping.amountDialog.titleEdit')
              : t('shopping.amountDialog.titleAdd')}
          </DialogTitle>
        </DialogHeader>

        <DialogMain>
          {/* The same name, "x / y unit" text and bar as the item card
              (`ItemStockSummary`). Radix renders the description as a <p>,
              which cannot hold the <div>s inside, so `asChild` puts it on a
              <div>. The bars are aria-hidden, so the description reads the
              name and the numbers. */}
          <DialogDescription asChild className="mb-4 text-foreground">
            <div>
              <ItemStockSummary item={item} nameAs="span" />
            </div>
          </DialogDescription>
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="text-sm text-foreground-muted shrink-0"
              >
                {t('shopping.amountDialog.buy')}
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
                  // Just wide enough for a 4-digit amount. The class must
                  // repeat the stepper's own default, because this one
                  // replaces it.
                  className: 'h-7 w-20 rounded-none text-right',
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
              <span
                aria-hidden="true"
                className="text-sm text-foreground-muted min-w-0 truncate"
              >
                {packageUnit}
              </span>
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
