import {
  Calendar,
  Clock,
  Infinity as InfinityIcon,
  Package,
  PackageOpen,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
}

interface ItemFormProps {
  initialValues?: Partial<ItemFormValues>
  sections?: ('stock' | 'info')[]
  onSubmit: (values: ItemFormValues) => void
  onDirtyChange?: (isDirty: boolean) => void
  savedAt?: number
  submitLabel?: string
  isPending?: boolean
}

export function ItemForm({
  initialValues,
  sections = ['info'],
  onSubmit,
  onDirtyChange,
  savedAt,
  submitLabel,
  isPending = false,
}: ItemFormProps) {
  const { t } = useTranslation()
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
    amountPerPackage !== baseValues.amountPerPackage

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
  const fillToFullState = computeFillToFull({
    targetUnit,
    targetQuantity,
    consumeAmount,
    ...(amountPerPackage ? { amountPerPackage: Number(amountPerPackage) } : {}),
  })

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
    hasFieldError || (onDirtyChange !== undefined && !isDirty) || !!isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitDisabled) return
    onSubmit(currentValuesRef.current)
  }

  return (
    <form
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
            <Label htmlFor="packageUnit">
              {t('items.form.packageUnit.label')}
            </Label>
            <Input
              id="packageUnit"
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
                    <span>{t('items.form.expirationMode.options.date')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="days from purchase">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>
                      {t('items.form.expirationMode.options.daysFromPurchase')}
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
        </div>
      )}

      {showStock && (
        <div className="space-y-2">
          <div>
            <Label htmlFor="targetQuantity">
              {t('items.form.targetQuantity.label')}{' '}
              <UnitInline
                unit={
                  targetUnit === 'measurement'
                    ? measurementUnit || undefined
                    : packageUnit || undefined
                }
              />
            </Label>
            <QuantityStepper
              value={targetQuantity}
              onStep={setTargetQuantity}
              step={targetUnit === 'package' ? 1 : stepperStep}
              round={normalizeTargetStep}
              decreaseLabel={t('items.form.targetQuantity.decrease')}
              increaseLabel={t('items.form.targetQuantity.increase')}
              disabled={isPending}
              inputProps={{
                id: 'targetQuantity',
                step: targetUnit === 'package' ? 1 : quantityStep,
                className: undefined,
                ...numericInputProps(
                  'targetQuantity',
                  targetQuantity,
                  setTargetQuantity,
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
              <UnitInline
                unit={
                  targetUnit === 'measurement'
                    ? measurementUnit || undefined
                    : packageUnit || undefined
                }
              />
            </Label>
            <QuantityStepper
              value={refillThreshold}
              onStep={setRefillThreshold}
              step={stepperStep}
              round={(n) => roundToStep(n, stepperStep)}
              decreaseLabel={t('items.form.refillThreshold.decrease')}
              increaseLabel={t('items.form.refillThreshold.increase')}
              disabled={isPending}
              inputProps={{
                id: 'refillThreshold',
                step: quantityStep,
                className: undefined,
                ...numericInputProps(
                  'refillThreshold',
                  refillThreshold,
                  setRefillThreshold,
                ),
              }}
            />
            <p className="text-xs text-foreground-muted">
              {t('items.form.refillThreshold.hint')}
            </p>
          </div>

          <div>
            <Label htmlFor="packedQuantity">
              {t('items.form.packedQuantity.label')}{' '}
              <UnitInline unit={packageUnit || undefined} />
            </Label>
            <div className="grid grid-cols-[auto_8rem] gap-2">
              <QuantityStepper
                value={packedQuantity}
                onStep={setPackedQuantity}
                step={1}
                decreaseLabel={t('items.form.packedQuantity.decrease')}
                increaseLabel={t('items.form.packedQuantity.increase')}
                disabled={isPending}
                inputProps={{
                  id: 'packedQuantity',
                  step: 1,
                  className: undefined,
                  ...numericInputProps(
                    'packedQuantity',
                    packedQuantity,
                    setPackedQuantity,
                  ),
                }}
              />
              <Button
                type="button"
                variant="neutral-outline"
                disabled={packedQuantity < 1}
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
            </div>
            <p className="text-xs text-foreground-muted">
              {t('items.form.packedQuantity.hint')}
            </p>
          </div>

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
                inputProps={{
                  id: 'unpackedQuantity',
                  step: quantityStep,
                  className: undefined,
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
                  targetUnit === 'package'
                    ? unpackedQuantity < 1
                    : targetUnit === 'measurement'
                      ? !amountPerPackage ||
                        unpackedQuantity < Number(amountPerPackage)
                      : true
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

          <StockProgressRow
            quantityLabel={progressQuantityLabel}
            unitLabel={progressUnitLabel}
            current={currentStockQuantity}
            target={targetQuantity}
            status={stockStatus}
            targetUnit={targetUnit}
            packed={displayPackedQuantity}
            unpacked={unpackedQuantity}
            {...(measurementUnit ? { measurementUnit } : {})}
            {...(amountPerPackage
              ? { amountPerPackage: Number(amountPerPackage) }
              : {})}
            onClear={() => {
              setPackedQuantity(0)
              setUnpackedQuantity(0)
            }}
            onFill={() => {
              setPackedQuantity(fillToFullState.packedQuantity)
              setUnpackedQuantity(fillToFullState.unpackedQuantity)
            }}
            clearDisabled={isPending || isStockAtZero}
            fillDisabled={isPending || isStockAtFull}
            clearLabel={t('common.clear')}
            fillLabel={t('common.fillToFull')}
          />

          {/* The due date is the one expiration field that is genuinely
              per-location — "when THIS one expires". The mode that gates it is
              global and edited on the Info tab. */}
          {expirationMode === 'date' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="expirationDueDate">
                  {t('items.form.expirationDueDate.label')}
                </Label>
                <Input
                  id="expirationDueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <p className="text-xs text-foreground-muted">
                  {t('items.form.expirationDueDate.hint')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

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
    </form>
  )
}
