import {
  Calendar,
  Clock,
  Infinity as InfinityIcon,
  Package,
  PackageOpen,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { QuantityStepper } from '@/components/item/QuantityStepper'
import { StockProgressRow } from '@/components/item/StockProgressRow'
import { UnitInline } from '@/components/shared/UnitInline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  type RegisterSaveControl,
  useRegisterSaveControl,
} from '@/hooks/useSaveControl'
import {
  computeFillToFull,
  computePack,
  computeUnpack,
  getStockPreview,
  roundToStep,
} from '@/lib/quantityUtils'
import type { ExpirationMode } from '@/types'

// The form always holds every value — both sections read from them (the
// per-location quantity labels need the global units, for instance) — but each
// section only RENDERS its own half.
export type ItemFormValues = {
  // Per-location stock STATE (rendered by the 'stock' section)
  packedQuantity: number
  unpackedQuantity: number
  targetQuantity: number
  refillThreshold: number
  dueDate: string
  // Item identity (rendered by the 'info' section)
  name: string
  wikidataUrl: string
  note: string
  // Global stock CONFIGURATION (rendered by the 'info' section since v16)
  packageUnit: string
  consumeAmount: number
  targetUnit: 'package' | 'measurement'
  measurementUnit: string
  amountPerPackage: string | number
  expirationMode: ExpirationMode
  estimatedDueDays: string | number
  expirationThreshold: string | number
  // `false` for an item that is not used up (cups). Off hides the measurement
  // settings, the opened packs and the expiration settings, and KEEPS their
  // values, so turning it on again shows them as they were.
  consumable: boolean
}

// The five values held as NUMBERS and edited through a `type="number"` input.
// (`amountPerPackage`, `estimatedDueDays` and `expirationThreshold` are
// `string | number` and already keep the user's raw text, so they never had
// this problem.)
type NumericField =
  | 'packedQuantity'
  | 'unpackedQuantity'
  | 'targetQuantity'
  | 'refillThreshold'
  | 'consumeAmount'

// What the user is part-way through typing into one number field: the raw text
// plus the number that text produced, so a value that moves underneath the
// draft (Pack/Unpack, the unit switch, a prop-sync reset) invalidates it.
type NumericDraft = { text: string; value: number }

const DEFAULT_VALUES: ItemFormValues = {
  packedQuantity: 0,
  unpackedQuantity: 0,
  dueDate: '',
  estimatedDueDays: '',
  name: '',
  wikidataUrl: '',
  note: '',
  packageUnit: '',
  targetQuantity: 0,
  refillThreshold: 0,
  consumeAmount: 1,
  expirationMode: 'disabled',
  expirationThreshold: '',
  targetUnit: 'package',
  measurementUnit: '',
  amountPerPackage: '',
  consumable: true,
}

interface ItemFormProps {
  initialValues?: Partial<ItemFormValues>
  sections?: ('stock' | 'info')[]
  /**
   * Called on submit and NOT awaited. It must not reject: the caller catches
   * a failed save and shows the message (`showSaveError`), because this form
   * has no place for one. Both callers, `routes/items/$id/index.tsx` and
   * `routes/items/$id/stock.tsx`, do. When the save fails the caller does not
   * bump `savedAt`, so the form keeps its values and stays dirty.
   *
   * It may answer whether the save worked (`Promise<boolean>`). The form's
   * own Save ignores the answer; `onSaveControlChange`'s `save` passes it on.
   * Only `false` counts as "failed"; no answer counts as "worked".
   */
  onSubmit: (values: ItemFormValues) => unknown
  onDirtyChange?: (isDirty: boolean) => void
  savedAt?: number
  submitLabel?: string
  isPending?: boolean
  /**
   * `true` keeps Save off, with no spinner and no error text of its own. It
   * joins `isSubmitDisabled`, so it turns off all three Saves: the button in
   * the form, the one in `submitSlot`, and `canSave` of
   * `onSaveControlChange`. The Info tab sets it until the recipes and the
   * stock rows have loaded, because `onSubmit` needs both to decide whether
   * the converted amounts dialog opens (bug 2026-11-26,
   * `docs/features/items/2026-11-26-bug-save-before-recipes-load.md`).
   */
  submitBlocked?: boolean
  /**
   * For a household member on the Info tab (households H5 task F.5). Every
   * info field is `readOnly` (the text can still be selected), the switch
   * and the select are disabled, and there is no submit button. Only the
   * Info tab passes it for a member. Since task F.6 the Stock tab passes it
   * for a location `viewer`: every stock number is `readOnly`, and the
   * steppers, Pack, Unpack, Clear and Fill to Full are disabled.
   */
  readOnly?: boolean
  /**
   * Where Save goes (owner decision 2026-11-25). Left out: Save is the last
   * row of the form, full width. An element: Save is rendered into it with a
   * React portal, as a `<button type="submit" form={id}>` linked to this form
   * by the HTML `form` attribute, so a click, Enter in a field, the
   * validation and `isPending` work as before. `null`: the element is not
   * there yet (the item page's top bar mounts first), so no Save shows.
   * The item page's Info and Stock tabs pass the top bar's slot.
   */
  submitSlot?: HTMLElement | null
  /**
   * Hands the item page's layout a "save now" for its unsaved-changes dialog
   * (design `docs/global/ui-polish/2026-11-25-unsaved-dialog-save-design.md`).
   * `canSave` is the same rule as the Save button (`isSubmitDisabled`, and not
   * `readOnly`); `save` runs the same `onSubmit` as Save and answers whether
   * it worked. The form gives `null` when it unmounts.
   */
  onSaveControlChange?: RegisterSaveControl
}

export function ItemForm({
  initialValues,
  sections = ['info'],
  onSubmit,
  onDirtyChange,
  savedAt,
  submitLabel,
  isPending = false,
  submitBlocked = false,
  readOnly = false,
  submitSlot,
  onSaveControlChange,
}: ItemFormProps) {
  const { t } = useTranslation()
  const formId = useId()
  const merged = { ...DEFAULT_VALUES, ...initialValues }

  const [packedQuantity, setPackedQuantity] = useState(merged.packedQuantity)
  const [unpackedQuantity, setUnpackedQuantity] = useState(
    merged.unpackedQuantity,
  )
  const [dueDate, setDueDate] = useState(merged.dueDate)
  const [estimatedDueDays, setEstimatedDueDays] = useState(
    merged.estimatedDueDays,
  )

  const [name, setName] = useState(merged.name)
  const [wikidataUrl, setWikidataUrl] = useState(merged.wikidataUrl)
  const [note, setNote] = useState(merged.note)
  const [packageUnit, setPackageUnit] = useState(merged.packageUnit)
  const [targetQuantity, setTargetQuantity] = useState(merged.targetQuantity)
  const [refillThreshold, setRefillThreshold] = useState(merged.refillThreshold)
  const [consumeAmount, setConsumeAmount] = useState(merged.consumeAmount)
  const [expirationMode, setExpirationMode] = useState<ExpirationMode>(
    merged.expirationMode,
  )
  const [expirationThreshold, setExpirationThreshold] = useState(
    merged.expirationThreshold,
  )

  const [targetUnit, setTargetUnit] = useState<'package' | 'measurement'>(
    merged.targetUnit,
  )
  const [measurementUnit, setMeasurementUnit] = useState(merged.measurementUnit)
  const [amountPerPackage, setAmountPerPackage] = useState(
    merged.amountPerPackage,
  )
  const [consumable, setConsumable] = useState(merged.consumable)

  // A number input that stores a NUMBER cannot represent what the user is
  // half-way through typing. `Number('') === 0`, so backspacing the last digit
  // of a field showing 0 produced no state change at all — React then
  // force-wrote "0" back into the DOM node and put the caret at the end, which
  // reads as "the field lost focus and swallowed my keystroke". `'2.'` and
  // `'-'` are unrepresentable for the same reason. So each number field keeps
  // the user's raw text here while it is being edited, and the numeric state
  // follows only once that text parses. Nothing else in the form changes: the
  // submitted payload stays numeric.
  const [numericDrafts, setNumericDrafts] = useState<
    Partial<Record<NumericField, NumericDraft>>
  >({})

  const [baseValues, setBaseValues] = useState<ItemFormValues>({ ...merged })

  const currentValuesRef = useRef<ItemFormValues>(merged)

  const currentValues: ItemFormValues = {
    packedQuantity,
    unpackedQuantity,
    dueDate,
    estimatedDueDays,
    name,
    wikidataUrl,
    note,
    packageUnit,
    targetQuantity,
    refillThreshold,
    consumeAmount,
    expirationMode,
    expirationThreshold,
    targetUnit,
    measurementUnit,
    amountPerPackage,
    consumable,
  }
  currentValuesRef.current = currentValues

  const isDirty =
    packedQuantity !== baseValues.packedQuantity ||
    unpackedQuantity !== baseValues.unpackedQuantity ||
    dueDate !== baseValues.dueDate ||
    estimatedDueDays !== baseValues.estimatedDueDays ||
    name !== baseValues.name ||
    wikidataUrl !== baseValues.wikidataUrl ||
    note !== baseValues.note ||
    packageUnit !== baseValues.packageUnit ||
    targetQuantity !== baseValues.targetQuantity ||
    refillThreshold !== baseValues.refillThreshold ||
    consumeAmount !== baseValues.consumeAmount ||
    expirationMode !== baseValues.expirationMode ||
    expirationThreshold !== baseValues.expirationThreshold ||
    targetUnit !== baseValues.targetUnit ||
    measurementUnit !== baseValues.measurementUnit ||
    amountPerPackage !== baseValues.amountPerPackage ||
    consumable !== baseValues.consumable

  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  const prevIsDirtyRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (isDirty === prevIsDirtyRef.current) return
    prevIsDirtyRef.current = isDirty
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const prevInitialValuesRef = useRef<Partial<ItemFormValues> | undefined>(
    initialValues,
  )
  useEffect(() => {
    if (!initialValues) return
    if (isDirtyRef.current) return
    // Skip if values haven't actually changed (handles unstable object identity from callers)
    const prev = prevInitialValuesRef.current
    prevInitialValuesRef.current = initialValues
    const next = { ...DEFAULT_VALUES, ...initialValues }
    const prevNext = { ...DEFAULT_VALUES, ...prev }
    const unchanged = (Object.keys(next) as (keyof ItemFormValues)[]).every(
      (k) => next[k] === prevNext[k],
    )
    if (unchanged) return
    setPackedQuantity(next.packedQuantity)
    setUnpackedQuantity(next.unpackedQuantity)
    setDueDate(next.dueDate)
    setEstimatedDueDays(next.estimatedDueDays)
    setName(next.name)
    setWikidataUrl(next.wikidataUrl)
    setNote(next.note)
    setPackageUnit(next.packageUnit)
    setTargetQuantity(next.targetQuantity)
    setRefillThreshold(next.refillThreshold)
    setConsumeAmount(next.consumeAmount)
    setExpirationMode(next.expirationMode)
    setExpirationThreshold(next.expirationThreshold)
    setTargetUnit(next.targetUnit)
    setMeasurementUnit(next.measurementUnit)
    setAmountPerPackage(next.amountPerPackage)
    setConsumable(next.consumable)
    setBaseValues({ ...next })
    // A form reset replaces every value, so no in-progress text may survive it.
    setNumericDrafts({})
  }, [initialValues])

  useEffect(() => {
    if (savedAt === undefined) return
    setBaseValues({ ...currentValuesRef.current })
  }, [savedAt])

  // Switching the tracked unit rescales every quantity held in it. Since v16
  // `targetUnit` and `consumeAmount` are global and edited on the Info tab,
  // where the per-location quantities are not rendered and not submitted — so
  // in practice only `consumeAmount` is persisted by this conversion. The
  // quantity conversions stay because the values are still in form state and a
  // section showing both would need them.
  const handleTargetUnitChange = (checked: boolean) => {
    const amount = Number(amountPerPackage)
    if (amountPerPackage && measurementUnit && amount > 0) {
      const factor = checked ? amount : 1 / amount
      const round = (v: number) => Math.round(v * 1000) / 1000
      setUnpackedQuantity((prev) => round(prev * factor))
      setTargetQuantity((prev) => round(prev * factor))
      setRefillThreshold((prev) => round(prev * factor))
      setConsumeAmount((prev) => round(prev * factor))
    }
    setTargetUnit(checked ? 'measurement' : 'package')
  }

  // Turning Consumable off on an item tracked in a measurement unit also moves
  // it to packages (design, PR 2): a non-consumable counts whole pieces. It
  // is the same change as turning "Track in measurement" off, so the same
  // conversion runs, and on Save the Info tab shows the same converted
  // amounts dialog as a unit change (`applyUnitSwitch`). Turning it on again
  // does NOT move the item back to the measurement unit; the person can do
  // that with the switch, which shows again.
  const handleConsumableChange = (checked: boolean) => {
    if (!checked && targetUnit === 'measurement') handleTargetUnitChange(false)
    setConsumable(checked)
  }

  // `value` / `onChange` / `onBlur` for one number input. Spread it LAST so it
  // owns those three props.
  const numericInputProps = (
    field: NumericField,
    value: number,
    setValue: (next: number) => void,
    // Applied when the field is left, never on a keystroke: rounding a
    // partially typed decimal destroys it (typing "2.5" used to land on 3
    // before the "5" was even pressed).
    normalizeOnBlur?: (n: number) => number,
  ) => {
    const draft = numericDrafts[field]
    // A draft describes exactly one number. If the value moved underneath it,
    // the number wins.
    const text = draft && draft.value === value ? draft.text : String(value)
    return {
      value: text,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value
        const parsed = Number(raw)
        const isNumber = raw.trim() !== '' && Number.isFinite(parsed)
        // '', '-' and '.' are not numbers yet: keep the text on screen and
        // leave the numeric state where it was.
        setNumericDrafts((prev) => ({
          ...prev,
          [field]: { text: raw, value: isNumber ? parsed : value },
        }))
        if (isNumber) setValue(parsed)
      },
      onBlur: () => {
        setNumericDrafts((prev) => {
          if (!(field in prev)) return prev
          const next = { ...prev }
          delete next[field]
          return next
        })
        const parsed = Number(text)
        const resolved =
          text.trim() !== '' && Number.isFinite(parsed) ? parsed : 0
        const settled = normalizeOnBlur ? normalizeOnBlur(resolved) : resolved
        if (settled !== value) setValue(settled)
      },
    }
  }

  const showStock = sections.includes('stock')
  const showInfo = sections.includes('info')

  const nameError = !name.trim() ? t('items.form.name.error') : undefined
  // Light, non-blocking URL validation: empty is allowed; if present, expect an
  // http(s):// URL. Does not contribute to hasFieldError (submission stays open).
  const isValidHttpUrl = (value: string) => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }
  const wikidataUrlError =
    wikidataUrl.trim() && !isValidHttpUrl(wikidataUrl.trim())
      ? t('items.info.wikidataUrl.invalid')
      : undefined
  const measurementUnitError =
    targetUnit === 'measurement' && !measurementUnit
      ? t('items.form.measurementUnit.error')
      : undefined
  const amountPerPackageError =
    targetUnit === 'measurement' && !amountPerPackage
      ? t('items.form.amountPerPackage.error')
      : undefined
  const consumeAmountError =
    consumeAmount <= 0 ? t('validation.positiveNumber') : undefined

  // `consumeAmount === 0` means "no step size configured" — NOT a step of 1.
  // It is no longer the create default (that reverted to 1 on 2026-08-24), but
  // it is still reachable: a caller may pass an explicit 0, a backup may
  // restore one, and items created while the 0 default was live still carry
  // it. So the honest handling stays. Fabricating the 1 silently rounded
  // an unconfigured item's Unpacked quantity to whole numbers. HTML rejects
  // `step={0}`, so "no step" is spelled `step="any"`: the field accepts what
  // the user typed instead of snapping to a unit they never chose. The Info
  // tab's "Must be greater than 0." error is the signal that it needs setting
  // up; the quantity fields must not pretend it already is.
  const quantityStep: number | 'any' = consumeAmount > 0 ? consumeAmount : 'any'

  // The +/- STEPPER buttons take a different fallback than quantityStep above:
  // a +/- increment must be non-zero to do anything, so an unconfigured
  // consumeAmount falls back to 1 here rather than to "any". This mirrors
  // QuickUpdateDialog's `step` (see its comment) and is a deliberate split,
  // not an inconsistency to unify — quantityStep still drives the <input>
  // element's own `step` attribute and blur rounding below, unchanged; only
  // the QuantityStepper's button clicks and its `round` normalizer take this
  // fallback-to-1 value.
  const stepperStep = consumeAmount > 0 ? consumeAmount : 1
  const normalizeTargetStep = (value: number) =>
    targetUnit === 'package' ? value : roundToStep(value, stepperStep)

  // A non-consumable item (cups) has ONE stock field, "Amount", in whole
  // pieces of the package unit; it edits `packedQuantity`. Its target and
  // refill threshold are whole pieces too, whatever the measurement settings
  // say (owner decision 2026-11-26). So all three step by 1, a typed fraction
  // is rounded (Amount down, target and threshold up, the same rule as
  // `getPieceCounts`), and every label shows the package unit.
  const stockUnit =
    consumable && targetUnit === 'measurement'
      ? measurementUnit || undefined
      : packageUnit || undefined
  const targetStepValue: number | 'any' =
    !consumable || targetUnit === 'package' ? 1 : quantityStep
  const targetStepperStep =
    !consumable || targetUnit === 'package' ? 1 : stepperStep
  const normalizeTarget = (value: number) =>
    consumable ? normalizeTargetStep(value) : Math.ceil(value)
  const refillStepValue: number | 'any' = consumable ? quantityStep : 1
  const refillStepperStep = consumable ? stepperStep : 1
  const normalizeRefill = (value: number) =>
    consumable ? roundToStep(value, stepperStep) : Math.ceil(value)

  // Progress row preview — mirrors QuickUpdateDialog's live computations
  // exactly (both call `getStockPreview`), but reads ItemForm's own
  // in-progress state instead of a saved PantryItem, so raising/lowering a
  // field updates the preview immediately.
  const preview = getStockPreview(
    {
      targetUnit,
      measurementUnit,
      // Conditional, not bare `packageUnit`: an item created with just a name
      // defaults this to `''`, and getStockPreview's own `packageUnit ?? 'unit'`
      // fallback does not fire for `''` (only for `undefined`) — passing the
      // empty string through rendered a bordered, empty UnitBadge on the Stock
      // tab. Mirrors QuickUpdateDialog's identical conditional spread below.
      ...(packageUnit ? { packageUnit } : {}),
      // `> 0`, not bare truthiness: the raw string '0' is truthy but its
      // coerced number isn't — the caller-side test and getStockPreview's
      // internal test must agree, or a measurement item saved with
      // amountPerPackage 0 sees one behaviour here and another inside.
      ...(Number(amountPerPackage) > 0
        ? { amountPerPackage: Number(amountPerPackage) }
        : {}),
      consumeAmount,
      consumable,
    },
    {
      packedQuantity,
      unpackedQuantity,
      targetQuantity,
      refillThreshold,
    },
  )
  const currentStockQuantity = preview.current
  const displayPackedQuantity = preview.displayPacked
  const stockStatus = preview.status
  const progressUnitLabel = preview.unitLabel
  const progressQuantityLabel = preview.quantityLabel
  const isStockAtZero = preview.isAtZero
  const isStockAtFull = preview.isAtFull

  // Fill to Full aims at the target currently in the input, not a saved one —
  // computed separately (not read off `preview`) because the `onFill` handler
  // below needs the destination quantities, not just whether they're reached.
  // A non-consumable item fills to its target in whole pieces, with no opened
  // stock (`preview.target` is already in pieces).
  const fillToFullState = consumable
    ? computeFillToFull({
        targetUnit,
        targetQuantity,
        consumeAmount,
        ...(amountPerPackage
          ? { amountPerPackage: Number(amountPerPackage) }
          : {}),
      })
    : { packedQuantity: preview.target, unpackedQuantity: 0 }

  // Only errors the active sections actually RENDER may block submission. All
  // four validated fields live in the info section, so a sections={['stock']}
  // form (the item detail Stock tab) has no validated field on screen at all —
  // gating its Save on them left the button permanently disabled with no error
  // text and no field to fix it in — for any item carrying consumeAmount 0, and
  // equally for `nameError`, which no default can rule out. Still required
  // after the create default became 1: it closes the hole, not one trigger.
  const hasFieldError =
    showInfo &&
    !!(
      nameError ||
      measurementUnitError ||
      amountPerPackageError ||
      consumeAmountError
    )
  const isSubmitDisabled =
    hasFieldError ||
    (onDirtyChange !== undefined && !isDirty) ||
    !!isPending ||
    submitBlocked

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly || isSubmitDisabled) return
    onSubmit(currentValuesRef.current)
  }

  const canSave = !readOnly && !isSubmitDisabled
  useRegisterSaveControl(onSaveControlChange, canSave, async () => {
    if (!canSave) return false
    try {
      return (await onSubmit(currentValuesRef.current)) !== false
    } catch {
      return false
    }
  })

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className="space-y-4 max-w-2xl mx-auto"
      noValidate
    >
      {showInfo && (
        <div className="space-y-2">
          <div>
            <Label htmlFor="name">{t('common.nameLabel')}</Label>
            <Input
              id="name"
              readOnly={readOnly}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="capitalize"
              error={nameError}
            />
          </div>

          <div>
            <Label htmlFor="wikidataUrl">
              {t('items.info.wikidataUrl.label')}
            </Label>
            <Input
              id="wikidataUrl"
              readOnly={readOnly}
              type="url"
              inputMode="url"
              value={wikidataUrl}
              placeholder={t('items.info.wikidataUrl.placeholder')}
              onChange={(e) => setWikidataUrl(e.target.value)}
              error={wikidataUrlError}
            />
          </div>

          <div>
            <Label htmlFor="note">{t('items.info.note.label')}</Label>
            <textarea
              id="note"
              readOnly={readOnly}
              value={note}
              placeholder={t('items.info.note.placeholder')}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="flex min-h-16 w-full px-2 py-1
                placeholder:text-accessory-emphasized
                disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
                border border-accessory bg-background-surface
                rounded-sm"
            />
          </div>

          {/* Stock SETTINGS — global to the item. How it is packaged,
              measured, expires and is consumed does not vary by location, so
              it lives on the Info tab; the Stock tab holds only the
              per-location numbers. */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center pt-2">
            <div className="h-px bg-accessory-emphasized" />
            <h2 className="text-sm font-medium uppercase">
              {t('items.form.stockSettingsHeading')}
            </h2>
            <div className="h-px bg-accessory-emphasized" />
          </div>

          <div>
            <div className="flex items-center gap-3">
              <Switch
                id="consumable"
                checked={consumable}
                onCheckedChange={handleConsumableChange}
                disabled={readOnly}
                aria-describedby={`${formId}-consumable-hint`}
              />
              <Label htmlFor="consumable" className="cursor-pointer">
                {t('items.form.consumable.label')}
              </Label>
            </div>
            <p
              id={`${formId}-consumable-hint`}
              className="text-xs text-foreground-muted"
            >
              {t('items.form.consumable.hint')}
            </p>
          </div>

          <div>
            <Label htmlFor="packageUnit">
              {t('items.form.packageUnit.label')}
            </Label>
            <Input
              id="packageUnit"
              readOnly={readOnly}
              value={packageUnit}
              placeholder={t('items.form.packageUnit.placeholder')}
              onChange={(e) => setPackageUnit(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="consumeAmount">
              {t('items.form.consumeAmount.label')}{' '}
              <UnitInline
                unit={
                  targetUnit === 'measurement'
                    ? measurementUnit || undefined
                    : packageUnit || undefined
                }
              />
            </Label>
            <Input
              id="consumeAmount"
              readOnly={readOnly}
              type="number"
              step="0.01"
              min={0.01}
              required
              error={consumeAmountError}
              {...numericInputProps(
                'consumeAmount',
                consumeAmount,
                setConsumeAmount,
              )}
            />
            <p className="text-xs text-foreground-muted">
              {t('items.form.consumeAmount.hint')}
            </p>
          </div>

          {/* A non-consumable item has no measurement unit, opened packs or
              expiry. The values stay in the form and are saved unchanged. */}
          {consumable && (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center pt-2">
                <div className="h-px bg-accessory-emphasized" />
                <h2 className="text-sm font-medium uppercase">
                  {t('items.form.advancedStockSettingsHeading')}
                </h2>
                <div className="h-px bg-accessory-emphasized" />
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="targetUnit"
                    checked={targetUnit === 'measurement'}
                    onCheckedChange={handleTargetUnitChange}
                    disabled={readOnly}
                  />
                  <Label htmlFor="targetUnit" className="cursor-pointer">
                    {t('items.form.trackInMeasurement.label')}{' '}
                    <UnitInline
                      unit={measurementUnit || undefined}
                      placeholder="?"
                    />
                  </Label>
                </div>
                <p className="text-xs text-foreground-muted">
                  {t('items.form.trackInMeasurement.hint')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="measurementUnit">
                    {t('items.form.measurementUnit.label')}
                  </Label>
                  <Input
                    id="measurementUnit"
                    readOnly={readOnly}
                    value={measurementUnit}
                    onChange={(e) => setMeasurementUnit(e.target.value)}
                    disabled={targetUnit !== 'measurement'}
                    error={
                      targetUnit === 'measurement'
                        ? measurementUnitError
                        : undefined
                    }
                  />
                  <p className="text-xs text-foreground-muted">
                    {t('items.form.measurementUnit.hint')}
                  </p>
                </div>

                <div>
                  <Label htmlFor="amountPerPackage">
                    {t('items.form.amountPerPackage.label')}
                    {measurementUnit && (
                      <span className="text-xs font-normal">
                        {' '}
                        ({measurementUnit})
                      </span>
                    )}
                  </Label>
                  <Input
                    id="amountPerPackage"
                    readOnly={readOnly}
                    type="number"
                    step="1"
                    min={1}
                    value={amountPerPackage}
                    onChange={(e) => setAmountPerPackage(e.target.value)}
                    disabled={targetUnit !== 'measurement'}
                    error={
                      targetUnit === 'measurement'
                        ? amountPerPackageError
                        : undefined
                    }
                  />
                  <p className="text-xs text-foreground-muted">
                    {t('items.form.amountPerPackage.hint', {
                      unit: measurementUnit || '?',
                    })}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="expirationMode">
                  {t('items.form.expirationMode.label')}
                </Label>
                <Select
                  value={expirationMode}
                  onValueChange={(value: ExpirationMode) =>
                    setExpirationMode(value)
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger id="expirationMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">
                      <div className="flex items-center gap-2">
                        <InfinityIcon className="h-4 w-4" />
                        <span>
                          {t('items.form.expirationMode.options.disabled')}
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="date">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {t('items.form.expirationMode.options.date')}
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="days from purchase">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>
                          {t(
                            'items.form.expirationMode.options.daysFromPurchase',
                          )}
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {expirationMode === 'date' && (
                  <p className="text-xs text-foreground-muted">
                    {t('items.form.expirationMode.dateHint')}
                  </p>
                )}
              </div>

              {expirationMode !== 'disabled' && (
                <div className="grid grid-cols-2 gap-4">
                  {expirationMode === 'days from purchase' && (
                    <div>
                      <Label htmlFor="expirationDueDays">
                        {t('items.form.estimatedDueDays.label')}{' '}
                        <span className="text-xs font-normal">
                          {t('items.form.daysUnit')}
                        </span>
                      </Label>
                      <Input
                        id="expirationDueDays"
                        readOnly={readOnly}
                        type="number"
                        min={1}
                        value={estimatedDueDays}
                        onChange={(e) => setEstimatedDueDays(e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="expirationThreshold">
                      {t('items.form.expirationThreshold.label')}{' '}
                      <span className="text-xs font-normal">
                        {t('items.form.daysUnit')}
                      </span>
                    </Label>
                    <Input
                      id="expirationThreshold"
                      readOnly={readOnly}
                      type="number"
                      min={0}
                      value={expirationThreshold}
                      onChange={(e) => setExpirationThreshold(e.target.value)}
                    />
                    <p className="text-xs text-foreground-muted">
                      {t('items.form.expirationThreshold.hint')}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showStock && (
        <div className="space-y-2">
          {/* Row order (designer ruling, 2026-09-22): Packed → Unpacked →
              Expires on (date mode only) → progress bar → Target Quantity →
              Refill When Below. Packed and Unpacked are the values edited most
              often, so they lead, and "Expires on" is per-location state
              updated at the same time. Target and Refill configure the bar —
              `getStockPreview` (`lib/quantityUtils.ts`) passes
              `targetQuantity` as the bar's `target` (its denominator) and
              derives the colour from `refillThreshold` — so they follow it.
              `QuickUpdateDialog` uses the same order on purpose. Reasoning:
              `docs/features/pantry/2026-08-27-brainstorming-quick-update-stock-settings.md`
              (addendum 2026-09-22). */}
          <div>
            {/* A non-consumable item shows this one field as "Amount": whole
                pieces of the package unit. It still edits `packedQuantity`;
                the Stock tab saves `unpackedQuantity: 0` for it. */}
            <Label htmlFor="packedQuantity">
              {consumable
                ? t('items.form.packedQuantity.label')
                : t('items.form.amount.label')}{' '}
              <UnitInline unit={packageUnit || undefined} />
            </Label>
            <div className="grid grid-cols-[auto_8rem] gap-2">
              <QuantityStepper
                value={packedQuantity}
                onStep={setPackedQuantity}
                step={1}
                decreaseLabel={
                  consumable
                    ? t('items.form.packedQuantity.decrease')
                    : t('items.form.amount.decrease')
                }
                increaseLabel={
                  consumable
                    ? t('items.form.packedQuantity.increase')
                    : t('items.form.amount.increase')
                }
                disabled={isPending}
                readOnly={readOnly}
                size="default"
                inputProps={{
                  id: 'packedQuantity',
                  step: 1,
                  ...numericInputProps(
                    'packedQuantity',
                    packedQuantity,
                    setPackedQuantity,
                    consumable ? undefined : (n) => Math.floor(n),
                  ),
                }}
              />
              {consumable && (
                <Button
                  type="button"
                  variant="neutral-outline"
                  disabled={readOnly || packedQuantity < 1}
                  onClick={() => {
                    const next = computeUnpack(
                      {
                        targetUnit,
                        consumeAmount,
                        ...(amountPerPackage
                          ? { amountPerPackage: Number(amountPerPackage) }
                          : {}),
                      },
                      { packedQuantity, unpackedQuantity },
                    )
                    setPackedQuantity(next.packedQuantity)
                    setUnpackedQuantity(next.unpackedQuantity)
                  }}
                >
                  <PackageOpen />
                  {t('items.form.unpack')}
                </Button>
              )}
            </div>
            <p className="text-xs text-foreground-muted">
              {consumable
                ? t('items.form.packedQuantity.hint')
                : t('items.form.amount.hint')}
            </p>
          </div>

          {/* A non-consumable item counts whole packs only: no opened packs. */}
          {consumable && (
            <div>
              <Label htmlFor="unpackedQuantity">
                {t('items.form.unpackedQuantity.label')}{' '}
                <UnitInline
                  unit={
                    targetUnit === 'measurement'
                      ? measurementUnit || undefined
                      : packageUnit || undefined
                  }
                />
              </Label>
              <div className="grid grid-cols-[auto_8rem] gap-2">
                <QuantityStepper
                  value={unpackedQuantity}
                  onStep={setUnpackedQuantity}
                  step={stepperStep}
                  round={(n) => roundToStep(n, stepperStep)}
                  decreaseLabel={t('items.form.unpackedQuantity.decrease')}
                  increaseLabel={t('items.form.unpackedQuantity.increase')}
                  disabled={isPending}
                  readOnly={readOnly}
                  size="default"
                  inputProps={{
                    id: 'unpackedQuantity',
                    step: quantityStep,
                    ...numericInputProps(
                      'unpackedQuantity',
                      unpackedQuantity,
                      setUnpackedQuantity,
                      // roundToStep returns the value untouched when the step is
                      // <= 0, so an unset consume amount rounds nothing.
                      (n) => roundToStep(n, consumeAmount),
                    ),
                  }}
                />
                <Button
                  type="button"
                  variant="neutral-outline"
                  disabled={
                    readOnly ||
                    (targetUnit === 'package'
                      ? unpackedQuantity < 1
                      : targetUnit === 'measurement'
                        ? !amountPerPackage ||
                          unpackedQuantity < Number(amountPerPackage)
                        : true)
                  }
                  onClick={() => {
                    const next = computePack(
                      {
                        targetUnit,
                        consumeAmount,
                        ...(amountPerPackage
                          ? { amountPerPackage: Number(amountPerPackage) }
                          : {}),
                      },
                      { packedQuantity, unpackedQuantity },
                    )
                    setPackedQuantity(next.packedQuantity)
                    setUnpackedQuantity(next.unpackedQuantity)
                  }}
                >
                  <Package />
                  {t('items.form.pack')}
                </Button>
              </div>
              <p className="text-xs text-foreground-muted">
                {t('items.form.unpackedQuantity.hint')}
              </p>
            </div>
          )}

          {/* The due date is the one expiration field that is genuinely
              per-location — "when THIS one expires". The mode that gates it is
              global and edited on the Info tab. */}
          {consumable && expirationMode === 'date' && (
            <div>
              <Label htmlFor="expirationDueDate">{t('common.expiresOn')}</Label>
              <Input
                id="expirationDueDate"
                type="date"
                value={dueDate}
                readOnly={readOnly}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <p className="text-xs text-foreground-muted">
                {t('common.expiresOnHint')}
              </p>
            </div>
          )}

          <StockProgressRow
            // Matches the `size="default"` on this tab's four QuantitySteppers,
            // so the Clear/Fill arrows are the same h-8 square as the `+`/`−`
            // buttons above and below them.
            size="default"
            quantityLabel={progressQuantityLabel}
            unitLabel={progressUnitLabel}
            current={currentStockQuantity}
            // In the bar's unit: whole pieces for a non-consumable item.
            target={preview.target}
            status={stockStatus}
            // The form's own value. The Stock tab does not show the switch,
            // so here it is the saved value; with both sections it follows
            // the switch before Save.
            consumable={consumable}
            targetUnit={targetUnit}
            packed={displayPackedQuantity}
            unpacked={unpackedQuantity}
            {...(measurementUnit ? { measurementUnit } : {})}
            {...(amountPerPackage
              ? { amountPerPackage: Number(amountPerPackage) }
              : {})}
            // From live form state, so the tick moves before the form is
            // saved (whole pieces for a non-consumable item).
            refillThreshold={preview.refillThreshold}
            onClear={() => {
              setPackedQuantity(0)
              setUnpackedQuantity(0)
            }}
            onFill={() => {
              setPackedQuantity(fillToFullState.packedQuantity)
              setUnpackedQuantity(fillToFullState.unpackedQuantity)
            }}
            clearDisabled={readOnly || isPending || isStockAtZero}
            fillDisabled={readOnly || isPending || isStockAtFull}
            clearLabel={t('common.clear')}
            fillLabel={t('common.fillToFull')}
          />

          <div>
            <Label htmlFor="targetQuantity">
              {t('items.form.targetQuantity.label')}{' '}
              <UnitInline unit={stockUnit} />
            </Label>
            <QuantityStepper
              value={targetQuantity}
              onStep={setTargetQuantity}
              step={targetStepperStep}
              round={normalizeTarget}
              decreaseLabel={t('items.form.targetQuantity.decrease')}
              increaseLabel={t('items.form.targetQuantity.increase')}
              disabled={isPending}
              readOnly={readOnly}
              size="default"
              inputProps={{
                id: 'targetQuantity',
                step: targetStepValue,
                ...numericInputProps(
                  'targetQuantity',
                  targetQuantity,
                  setTargetQuantity,
                  consumable ? undefined : normalizeTarget,
                ),
              }}
            />
            <p className="text-xs text-foreground-muted">
              {t('items.form.targetQuantity.hint')}
            </p>
          </div>

          <div>
            <Label htmlFor="refillThreshold">
              {t('items.form.refillThreshold.label')}{' '}
              <UnitInline unit={stockUnit} />
            </Label>
            <QuantityStepper
              value={refillThreshold}
              onStep={setRefillThreshold}
              step={refillStepperStep}
              round={normalizeRefill}
              decreaseLabel={t('items.form.refillThreshold.decrease')}
              increaseLabel={t('items.form.refillThreshold.increase')}
              disabled={isPending}
              readOnly={readOnly}
              size="default"
              inputProps={{
                id: 'refillThreshold',
                step: refillStepValue,
                ...numericInputProps(
                  'refillThreshold',
                  refillThreshold,
                  setRefillThreshold,
                  consumable ? undefined : normalizeRefill,
                ),
              }}
            />
            <p className="text-xs text-foreground-muted">
              {t('items.form.refillThreshold.hint')}
            </p>
          </div>
        </div>
      )}

      {!readOnly && submitSlot === undefined && (
        <div className="space-y-2">
          <Button
            type="submit"
            disabled={isSubmitDisabled}
            isLoading={!!isPending}
            className="w-full"
          >
            {submitLabel ?? t('common.save')}
          </Button>
        </div>
      )}
      {/* In the top bar: a visible label, not an icon. "Save" (儲存) is one
          short word, so it fits beside the back button and the truncated
          item name at 390 px, and it reads more clearly than an icon. The
          default size has the back button's height (h-8). */}
      {!readOnly &&
        submitSlot &&
        createPortal(
          <Button
            type="submit"
            form={formId}
            disabled={isSubmitDisabled}
            isLoading={!!isPending}
            className="shrink-0"
          >
            {submitLabel ?? t('common.save')}
          </Button>,
          submitSlot,
        )}
    </form>
  )
}
