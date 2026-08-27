import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  defaultPicksFor,
  type FilterAxis,
  type FilterPicks,
} from '@/lib/shelfUtils'

export interface ShelfFilterPicksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Name of the item being added — used in the title only. */
  itemName: string
  /** Name of the filter shelf being joined — used in the title only. */
  shelfName: string
  /** From `deriveFilterAxes`. Axes carrying `metBy` render read-only. */
  axes: FilterAxis[]
  /** Rejects to surface an inline error and keep the dialog open. */
  onConfirm: (picks: FilterPicks) => Promise<void>
}

export function ShelfFilterPicksDialog({
  open,
  onOpenChange,
  itemName,
  shelfName,
  axes,
  onConfirm,
}: ShelfFilterPicksDialogProps) {
  const { t } = useTranslation()
  const idPrefix = useId()

  // Local picks: one entry per axis key (only unmet axes ever get a value).
  const [picks, setPicks] = useState<Record<string, string | undefined>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  // Reset whenever the dialog opens or the axes change, so reopening on a
  // different row does not carry the previous row's picks.
  useEffect(() => {
    if (!open) return
    const defaults = defaultPicksFor(axes)
    const seeded: Record<string, string | undefined> = {}
    for (const axis of axes) {
      if (axis.metBy !== undefined) continue
      if (axis.kind === 'tag') {
        const tagId = defaults.tagIds.find((id) =>
          axis.options.some((o) => o.id === id),
        )
        if (tagId) seeded[axis.key] = tagId
      } else if (axis.kind === 'vendor') {
        if (defaults.vendorId) seeded[axis.key] = defaults.vendorId
      } else if (axis.kind === 'recipe') {
        if (defaults.recipeId) seeded[axis.key] = defaults.recipeId
      }
    }
    setPicks(seeded)
    setError(undefined)
    setIsSubmitting(false)
  }, [open, axes])

  const openAxes = axes.filter((axis) => axis.metBy === undefined)
  const canConfirm = openAxes.every((axis) => !!picks[axis.key])

  const handleClose = () => {
    onOpenChange(false)
  }

  const handleConfirm = async () => {
    if (!canConfirm || isSubmitting) return
    setIsSubmitting(true)
    setError(undefined)

    const filterPicks: FilterPicks = {
      tagIds: axes
        .filter((axis) => axis.kind === 'tag' && axis.metBy === undefined)
        .map((axis) => picks[axis.key])
        .filter((id): id is string => !!id),
    }
    const vendorAxis = axes.find(
      (axis) => axis.kind === 'vendor' && axis.metBy === undefined,
    )
    if (vendorAxis) {
      const vendorId = picks[vendorAxis.key]
      if (vendorId) filterPicks.vendorId = vendorId
    }
    const recipeAxis = axes.find(
      (axis) => axis.kind === 'recipe' && axis.metBy === undefined,
    )
    if (recipeAxis) {
      const recipeId = picks[recipeAxis.key]
      if (recipeId) filterPicks.recipeId = recipeId
    }

    try {
      await onConfirm(filterPicks)
      setIsSubmitting(false)
      onOpenChange(false)
    } catch {
      setIsSubmitting(false)
      setError(t('items.searchTail.filterPicks.error'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('items.searchTail.filterPicks.title', {
              name: itemName,
              shelf: shelfName,
            })}
          </DialogTitle>
        </DialogHeader>
        <DialogMain className="space-y-4">
          {axes.map((axis) => {
            const labelId = `${idPrefix}-${axis.key}-label`
            const axisLabel =
              axis.kind === 'tag'
                ? axis.typeName
                : axis.kind === 'vendor'
                  ? t('items.searchTail.filterPicks.vendorAxis')
                  : t('items.searchTail.filterPicks.recipeAxis')

            if (axis.metBy !== undefined) {
              const metOption = axis.options.find((o) => o.id === axis.metBy)
              return (
                <div key={axis.key} className="space-y-2">
                  <Label id={labelId}>{axisLabel}</Label>
                  <p className="text-sm text-foreground-muted">
                    {t('items.searchTail.filterPicks.met', {
                      name: metOption?.name ?? '',
                    })}
                  </p>
                </div>
              )
            }

            const nameClassName =
              axis.kind === 'vendor' ? 'normal-case' : 'capitalize'

            return (
              <div key={axis.key} className="space-y-2">
                <Label id={labelId}>{axisLabel}</Label>
                <RadioGroup
                  aria-labelledby={labelId}
                  value={picks[axis.key] ?? ''}
                  onValueChange={(value) =>
                    setPicks((prev) => ({ ...prev, [axis.key]: value }))
                  }
                >
                  {axis.options.map((option) => {
                    const optionId = `${idPrefix}-${axis.key}-${option.id}`
                    return (
                      <div key={option.id} className="flex items-center gap-2">
                        <RadioGroupItem value={option.id} id={optionId} />
                        <Label
                          htmlFor={optionId}
                          className={`font-normal cursor-pointer ${nameClassName}`}
                        >
                          {option.name}
                        </Label>
                      </div>
                    )
                  })}
                </RadioGroup>
              </div>
            )
          })}

          {error && (
            <p role="alert" className="text-sm text-status-error-foreground">
              {error}
            </p>
          )}
        </DialogMain>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={handleClose}>
            {t('items.searchTail.filterPicks.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || isSubmitting}
            isLoading={isSubmitting}
          >
            {t('items.searchTail.filterPicks.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
