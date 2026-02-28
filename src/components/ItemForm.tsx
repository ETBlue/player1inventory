import { Calendar, Clock, PackagePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { DEFAULT_PACKAGE_UNIT } from '@/types'

export type ItemFormValues = {
  // Stock fields (used when sections includes 'stock')
  packedQuantity: number
  unpackedQuantity: number
  dueDate: string
  estimatedDueDays: string | number
  // Item Info fields
  name: string
  packageUnit: string
  targetQuantity: number
  refillThreshold: number
  consumeAmount: number
  expirationMode: 'date' | 'days'
  expirationThreshold: string | number
  // Advanced fields
  targetUnit: 'package' | 'measurement'
  measurementUnit: string
  amountPerPackage: string | number
}

const DEFAULT_VALUES: ItemFormValues = {
  packedQuantity: 0,
  unpackedQuantity: 0,
  dueDate: '',
  estimatedDueDays: '',
  name: '',
  packageUnit: '',
  targetQuantity: 0,
  refillThreshold: 0,
  consumeAmount: 0,
  expirationMode: 'date',
  expirationThreshold: '',
  targetUnit: 'package',
  measurementUnit: '',
  amountPerPackage: '',
}

interface ItemFormProps {
  initialValues?: Partial<ItemFormValues>
  sections?: ('stock' | 'info' | 'advanced')[]
  onSubmit: (values: ItemFormValues) => void
  onDirtyChange?: (isDirty: boolean) => void
  savedAt?: number
  submitLabel?: string
}

export function ItemForm({
  initialValues,
  sections = ['info', 'advanced'],
  onSubmit,
  onDirtyChange,
  savedAt,
  submitLabel = 'Save',
}: ItemFormProps) {
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
  const [packageUnit, setPackageUnit] = useState(merged.packageUnit)
  const [targetQuantity, setTargetQuantity] = useState(merged.targetQuantity)
  const [refillThreshold, setRefillThreshold] = useState(merged.refillThreshold)
  const [consumeAmount, setConsumeAmount] = useState(merged.consumeAmount)
  const [expirationMode, setExpirationMode] = useState<'date' | 'days'>(
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

  const [baseValues, setBaseValues] = useState<ItemFormValues>({ ...merged })

  const currentValuesRef = useRef<ItemFormValues>(merged)

  const currentValues: ItemFormValues = {
    packedQuantity,
    unpackedQuantity,
    dueDate,
    estimatedDueDays,
    name,
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
  }, [initialValues])

  useEffect(() => {
    if (savedAt === undefined) return
    setBaseValues({ ...currentValuesRef.current })
  }, [savedAt])

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

  const isValidationFailed =
    targetUnit === 'measurement' && (!measurementUnit || !amountPerPackage)

  const validationMessage = isValidationFailed
    ? !measurementUnit && !amountPerPackage
      ? 'Measurement unit and amount per package are required'
      : !measurementUnit
        ? 'Measurement unit is required'
        : 'Amount per package is required'
    : null

  const isSubmitDisabled =
    isValidationFailed || (onDirtyChange !== undefined && !isDirty)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isValidationFailed) return
    onSubmit(currentValuesRef.current)
  }

  const showStock = sections.includes('stock')
  const showInfo = sections.includes('info')
  const showAdvanced = sections.includes('advanced')

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl mx-auto">
      {showStock && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <div className="h-px bg-accessory-emphasized" />
            <h2 className="text-sm font-medium uppercase">Stock Status</h2>
            <div className="h-px bg-accessory-emphasized" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="packedQuantity">
                Packed{' '}
                <span className="text-xs font-normal">
                  ({packageUnit || DEFAULT_PACKAGE_UNIT})
                </span>
              </Label>
              <Input
                id="packedQuantity"
                type="number"
                min={0}
                step={1}
                value={packedQuantity}
                onChange={(e) => setPackedQuantity(Number(e.target.value))}
              />
              <p className="text-xs text-foreground-muted">
                Number of whole packages in stock
              </p>
            </div>

            <div>
              <Label htmlFor="unpackedQuantity">
                Unpacked{' '}
                <span className="text-xs font-normal">
                  (
                  {targetUnit === 'measurement'
                    ? measurementUnit
                    : packageUnit || DEFAULT_PACKAGE_UNIT}
                  )
                </span>
              </Label>
              <Input
                id="unpackedQuantity"
                type="number"
                min={0}
                step={consumeAmount || 1}
                value={unpackedQuantity}
                onChange={(e) => setUnpackedQuantity(Number(e.target.value))}
              />
              <p className="text-xs text-foreground-muted">
                Loose amount from opened package(s)
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="neutral"
            size="sm"
            disabled={
              targetUnit === 'package'
                ? unpackedQuantity < 1
                : targetUnit === 'measurement'
                  ? !amountPerPackage ||
                    unpackedQuantity < Number(amountPerPackage)
                  : true
            }
            onClick={() => {
              const amount = Number(amountPerPackage)
              if (targetUnit === 'package') {
                const packs = Math.floor(unpackedQuantity)
                if (packs > 0) {
                  setPackedQuantity(packedQuantity + packs)
                  setUnpackedQuantity(
                    Math.round((unpackedQuantity - packs) * 1000) / 1000,
                  )
                }
              } else if (targetUnit === 'measurement' && amount > 0) {
                const packs = Math.floor(unpackedQuantity / amount)
                if (packs > 0) {
                  setPackedQuantity(packedQuantity + packs)
                  setUnpackedQuantity(
                    Math.round((unpackedQuantity - packs * amount) * 1000) /
                      1000,
                  )
                }
              }
            }}
          >
            <PackagePlus />
            Pack unpacked
          </Button>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expirationValue">
                {expirationMode === 'date' ? (
                  'Expires on'
                ) : (
                  <>
                    Expires in{' '}
                    <span className="text-xs font-normal">(days)</span>
                  </>
                )}
              </Label>
              {expirationMode === 'date' ? (
                <Input
                  id="expirationValue"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              ) : (
                <Input
                  id="expirationValue"
                  type="number"
                  min={1}
                  value={estimatedDueDays}
                  onChange={(e) => setEstimatedDueDays(e.target.value)}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <div className="h-px bg-accessory-emphasized" />
            <h2 className="text-sm font-medium uppercase">Item Info</h2>
            <div className="h-px bg-accessory-emphasized" />
          </div>

          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="packageUnit">Package Unit</Label>
            <Input
              id="packageUnit"
              value={packageUnit}
              placeholder="default: pack"
              onChange={(e) => setPackageUnit(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="targetQuantity">
                Target Quantity{' '}
                <span className="text-xs font-normal">
                  (
                  {targetUnit === 'measurement'
                    ? measurementUnit
                    : packageUnit || DEFAULT_PACKAGE_UNIT}
                  )
                </span>
              </Label>
              <Input
                id="targetQuantity"
                type="number"
                min={0}
                step={targetUnit === 'package' ? 1 : consumeAmount || 1}
                value={targetQuantity}
                onChange={(e) => setTargetQuantity(Number(e.target.value))}
              />
              <p className="text-xs text-foreground-muted">
                Item becomes inactive when set to 0
              </p>
            </div>

            <div>
              <Label htmlFor="refillThreshold">
                Refill When Below{' '}
                <span className="text-xs font-normal">
                  (
                  {targetUnit === 'measurement'
                    ? measurementUnit
                    : packageUnit || DEFAULT_PACKAGE_UNIT}
                  )
                </span>
              </Label>
              <Input
                id="refillThreshold"
                type="number"
                min={0}
                step={consumeAmount || 1}
                value={refillThreshold}
                onChange={(e) => setRefillThreshold(Number(e.target.value))}
              />
              <p className="text-xs text-foreground-muted">
                Shows warning on low stock
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="consumeAmount">
                Amount per Consume{' '}
                <span className="text-xs font-normal">
                  (
                  {targetUnit === 'measurement'
                    ? measurementUnit
                    : packageUnit || DEFAULT_PACKAGE_UNIT}
                  )
                </span>
              </Label>
              <Input
                id="consumeAmount"
                type="number"
                step="0.01"
                min={0}
                value={consumeAmount}
                onChange={(e) => setConsumeAmount(Number(e.target.value))}
                required
              />
              <p className="text-xs text-foreground-muted">
                Amount added/removed per +/- button click
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="expirationMode">
              Calculate Expiration based on
            </Label>
            <Select
              value={expirationMode}
              onValueChange={(value: 'date' | 'days') =>
                setExpirationMode(value)
              }
            >
              <SelectTrigger id="expirationMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Specific Date</span>
                  </div>
                </SelectItem>
                <SelectItem value="days">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Days from Purchase</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expirationThreshold">
                Warning in <span className="text-xs font-normal">(days)</span>
              </Label>
              <Input
                id="expirationThreshold"
                type="number"
                min={0}
                value={expirationThreshold}
                onChange={(e) => setExpirationThreshold(e.target.value)}
              />
              <p className="text-xs text-foreground-muted">
                Shows warning when about to expire
              </p>
            </div>
          </div>
        </div>
      )}

      {showAdvanced && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <div className="h-px bg-accessory-emphasized" />
            <h2 className="text-sm font-medium uppercase">
              Advanced Configuration
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
                Track in measurement{' '}
                <span className="text-xs font-normal">
                  ({measurementUnit || '?'})
                </span>
              </Label>
            </div>
            <p className="text-xs text-foreground-muted">
              Turn on to enable precise measurement tracking
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="measurementUnit">Measurement Unit</Label>
              <Input
                id="measurementUnit"
                value={measurementUnit}
                onChange={(e) => setMeasurementUnit(e.target.value)}
                disabled={targetUnit !== 'measurement'}
              />
              <p className="text-xs text-foreground-muted">
                Precise unit like g / lb / ml
              </p>
            </div>

            <div>
              <Label htmlFor="amountPerPackage">
                Amount per Package
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
              />
              <p className="text-xs text-foreground-muted">
                How many {measurementUnit || '?'} per pack
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Button type="submit" disabled={isSubmitDisabled} className="w-full">
          {submitLabel}
        </Button>
        {validationMessage && (
          <p className="text-sm text-destructive">{validationMessage}</p>
        )}
      </div>
    </form>
  )
}
