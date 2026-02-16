import { createFileRoute } from '@tanstack/react-router'
import { Calendar, Clock } from 'lucide-react'
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
import { useItem, useUpdateItem } from '@/hooks'
import { useItemLayout } from '@/hooks/useItemLayout'
import { packUnpacked } from '@/lib/quantityUtils'

export const Route = createFileRoute('/items/$id/')({
  component: ItemDetailTab,
})

function ItemDetailTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { registerDirtyState } = useItemLayout()

  // Stock fields
  const [packedQuantity, setPackedQuantity] = useState(
    item?.packedQuantity ?? 0,
  )
  const [unpackedQuantity, setUnpackedQuantity] = useState(
    item?.unpackedQuantity ?? 0,
  )
  const [expirationMode, setExpirationMode] = useState<'date' | 'days'>(
    item?.estimatedDueDays ? 'days' : 'date',
  )
  const [dueDate, setDueDate] = useState(
    item?.dueDate ? item.dueDate.toISOString().split('T')[0] : '',
  )
  const [estimatedDueDays, setEstimatedDueDays] = useState(
    item?.estimatedDueDays ?? '',
  )

  // Info fields
  const [name, setName] = useState(item?.name ?? '')
  const [packageUnit, setPackageUnit] = useState(item?.packageUnit ?? '')
  const [measurementUnit, setMeasurementUnit] = useState(
    item?.measurementUnit ?? '',
  )
  const [amountPerPackage, setAmountPerPackage] = useState(
    item?.amountPerPackage ?? '',
  )
  const [targetUnit, setTargetUnit] = useState<'package' | 'measurement'>(
    item?.targetUnit ?? 'package',
  )
  const [targetQuantity, setTargetQuantity] = useState(
    item?.targetQuantity ?? 1,
  )
  const [refillThreshold, setRefillThreshold] = useState(
    item?.refillThreshold ?? 1,
  )
  const [consumeAmount, setConsumeAmount] = useState(item?.consumeAmount ?? 1)
  const [expirationThreshold, setExpirationThreshold] = useState(
    item?.expirationThreshold ?? '',
  )

  // Track initial values
  const [initialValues, setInitialValues] = useState({
    packedQuantity: item?.packedQuantity ?? 0,
    unpackedQuantity: item?.unpackedQuantity ?? 0,
    expirationMode: item?.estimatedDueDays ? 'days' : 'date',
    dueDate: item?.dueDate ? item.dueDate.toISOString().split('T')[0] : '',
    estimatedDueDays: item?.estimatedDueDays ?? '',
    name: item?.name ?? '',
    packageUnit: item?.packageUnit ?? '',
    measurementUnit: item?.measurementUnit ?? '',
    amountPerPackage: item?.amountPerPackage ?? '',
    targetUnit: item?.targetUnit ?? 'package',
    targetQuantity: item?.targetQuantity ?? 1,
    refillThreshold: item?.refillThreshold ?? 1,
    consumeAmount: item?.consumeAmount ?? 1,
    expirationThreshold: item?.expirationThreshold ?? '',
  })

  // Track previous success state to detect when a save completes
  const prevSuccessRef = useRef(updateItem.isSuccess)

  // Reset form state after successful save (only once per save)
  useEffect(() => {
    if (!item) return

    // Only reset when a save just completed (success changed from false to true)
    const justSaved = updateItem.isSuccess && !prevSuccessRef.current
    prevSuccessRef.current = updateItem.isSuccess

    if (!justSaved) return

    const newValues = {
      packedQuantity: item.packedQuantity,
      unpackedQuantity: item.unpackedQuantity,
      expirationMode: item.estimatedDueDays
        ? ('days' as const)
        : ('date' as const),
      dueDate: item.dueDate ? item.dueDate.toISOString().split('T')[0] : '',
      estimatedDueDays: item.estimatedDueDays ?? '',
      name: item.name,
      packageUnit: item.packageUnit ?? '',
      measurementUnit: item.measurementUnit ?? '',
      amountPerPackage: item.amountPerPackage ?? '',
      targetUnit: item.targetUnit,
      targetQuantity: item.targetQuantity,
      refillThreshold: item.refillThreshold,
      consumeAmount: item.consumeAmount,
      expirationThreshold: item.expirationThreshold ?? '',
    }

    setPackedQuantity(newValues.packedQuantity)
    setUnpackedQuantity(newValues.unpackedQuantity)
    setExpirationMode(newValues.expirationMode)
    setDueDate(newValues.dueDate)
    setEstimatedDueDays(newValues.estimatedDueDays)
    setName(newValues.name)
    setPackageUnit(newValues.packageUnit)
    setMeasurementUnit(newValues.measurementUnit)
    setAmountPerPackage(newValues.amountPerPackage)
    setTargetUnit(newValues.targetUnit)
    setTargetQuantity(newValues.targetQuantity)
    setRefillThreshold(newValues.refillThreshold)
    setConsumeAmount(newValues.consumeAmount)
    setExpirationThreshold(newValues.expirationThreshold)
    setInitialValues(newValues)
  }, [updateItem.isSuccess, item])

  // Track previous targetUnit for conversion
  const prevTargetUnit = useRef<'package' | 'measurement'>(targetUnit)

  // Convert values when switching between package and measurement tracking
  useEffect(() => {
    if (
      !amountPerPackage ||
      !measurementUnit ||
      prevTargetUnit.current === targetUnit
    ) {
      prevTargetUnit.current = targetUnit
      return
    }

    const amount = Number(amountPerPackage)
    if (amount <= 0) {
      prevTargetUnit.current = targetUnit
      return
    }

    if (prevTargetUnit.current === 'package' && targetUnit === 'measurement') {
      setUnpackedQuantity((prev) => prev * amount)
      setTargetQuantity((prev) => prev * amount)
      setRefillThreshold((prev) => prev * amount)
      setConsumeAmount((prev) => prev * amount)
    } else if (
      prevTargetUnit.current === 'measurement' &&
      targetUnit === 'package'
    ) {
      setUnpackedQuantity((prev) => prev / amount)
      setTargetQuantity((prev) => prev / amount)
      setRefillThreshold((prev) => prev / amount)
      setConsumeAmount((prev) => prev / amount)
    }

    prevTargetUnit.current = targetUnit
  }, [targetUnit, amountPerPackage, measurementUnit])

  // Compute dirty state
  const isDirty =
    packedQuantity !== initialValues.packedQuantity ||
    unpackedQuantity !== initialValues.unpackedQuantity ||
    expirationMode !== initialValues.expirationMode ||
    dueDate !== initialValues.dueDate ||
    estimatedDueDays !== initialValues.estimatedDueDays ||
    name !== initialValues.name ||
    packageUnit !== initialValues.packageUnit ||
    measurementUnit !== initialValues.measurementUnit ||
    amountPerPackage !== initialValues.amountPerPackage ||
    targetUnit !== initialValues.targetUnit ||
    targetQuantity !== initialValues.targetQuantity ||
    refillThreshold !== initialValues.refillThreshold ||
    consumeAmount !== initialValues.consumeAmount ||
    expirationThreshold !== initialValues.expirationThreshold

  // Compute validation state
  const isValidationFailed =
    targetUnit === 'measurement' && (!measurementUnit || !amountPerPackage)

  const validationMessage = isValidationFailed
    ? !measurementUnit && !amountPerPackage
      ? 'Measurement unit and amount per package are required'
      : !measurementUnit
        ? 'Measurement unit is required'
        : 'Amount per package is required'
    : null

  // Report dirty state to parent
  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate: if tracking in measurement, both fields must be defined
    if (
      targetUnit === 'measurement' &&
      (!measurementUnit || !amountPerPackage)
    ) {
      return
    }

    const updates: any = {
      packedQuantity,
      unpackedQuantity,
      name,
      targetUnit,
      targetQuantity,
      refillThreshold,
      consumeAmount,
    }

    // Stock expiration fields
    if (expirationMode === 'date' && dueDate) {
      updates.dueDate = new Date(dueDate)
      updates.estimatedDueDays = undefined
    } else if (expirationMode === 'days' && estimatedDueDays) {
      updates.estimatedDueDays = Number(estimatedDueDays)
      updates.dueDate = undefined
    } else {
      updates.dueDate = undefined
      updates.estimatedDueDays = undefined
    }

    // Info fields
    updates.packageUnit = packageUnit || undefined
    updates.measurementUnit = measurementUnit || undefined
    updates.amountPerPackage = amountPerPackage
      ? Number(amountPerPackage)
      : undefined
    updates.expirationThreshold = expirationThreshold
      ? Number(expirationThreshold)
      : undefined

    updateItem.mutate({ id, updates })
  }

  if (!item) return null

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl mx-auto">
      {/* Stock Section */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          <div className="h-px bg-accessory-emphasized" />
          <h2 className="text-sm font-medium uppercase">Stock Status</h2>
          <div className="h-px bg-accessory-emphasized" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="">
            <Label htmlFor="packedQuantity">
              Quantity{' '}
              <span className="text-xs font-normal">
                ({packageUnit ? packageUnit : 'pack'})
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

          <div className="">
            <Label htmlFor="unpackedQuantity">
              Unpacked Quantity{' '}
              <span className="text-xs font-normal">
                (
                {targetUnit === 'measurement'
                  ? measurementUnit
                  : packageUnit || 'pack'}
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

        {/* Pack unpacked button */}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="neutral-outline"
            size="sm"
            disabled={
              targetUnit === 'package'
                ? unpackedQuantity < 1
                : targetUnit === 'measurement'
                  ? !amountPerPackage || unpackedQuantity < amountPerPackage
                  : true
            }
            onClick={() => {
              if (!item) return

              const itemCopy = { ...item }
              itemCopy.packedQuantity = packedQuantity
              itemCopy.unpackedQuantity = unpackedQuantity
              itemCopy.targetUnit = targetUnit
              itemCopy.measurementUnit = measurementUnit || undefined
              itemCopy.amountPerPackage = amountPerPackage
                ? Number(amountPerPackage)
                : undefined

              packUnpacked(itemCopy)

              setPackedQuantity(itemCopy.packedQuantity)
              setUnpackedQuantity(itemCopy.unpackedQuantity)
              // Note: Don't update initialValues - form is now dirty and needs saving
            }}
          >
            Pack unpacked
          </Button>
        </div>

        <div className="">
          <Label htmlFor="expirationMode">Calculate Expiration based on</Label>
          <Select
            value={expirationMode}
            onValueChange={(value: 'date' | 'days') => setExpirationMode(value)}
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
          <div className="">
            <Label htmlFor="expirationValue">
              {expirationMode === 'date' ? (
                'Expires on'
              ) : (
                <>
                  Expires in <span className="text-xs font-normal">(days)</span>
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
          <div className="">
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

      {/* Item Info Section */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          <div className="h-px bg-accessory-emphasized" />
          <h2 className="text-sm font-medium uppercase">Item Info</h2>
          <div className="h-px bg-accessory-emphasized" />
        </div>
        <div className="">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="">
          <Label htmlFor="packageUnit">Package Unit</Label>
          <Input
            id="packageUnit"
            value={packageUnit}
            placeholder="default: pack"
            onChange={(e) => setPackageUnit(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="">
            <Label htmlFor="targetQuantity">
              Target Quantity{' '}
              <span className="text-xs font-normal">
                (
                {targetUnit === 'measurement'
                  ? measurementUnit
                  : packageUnit || 'pack'}
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

          <div className="">
            <Label htmlFor="refillThreshold">
              Refill When Below{' '}
              <span className="text-xs font-normal">
                (
                {targetUnit === 'measurement'
                  ? measurementUnit
                  : packageUnit || 'pack'}
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
        <div className="">
          <Label htmlFor="consumeAmount">
            Amount per Consume{' '}
            <span className="text-xs font-normal">
              (
              {targetUnit === 'measurement'
                ? measurementUnit
                : packageUnit || 'pack'}
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

      {/* Advanced Section */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          <div className="h-px bg-accessory-emphasized" />
          <h2 className="text-sm font-medium uppercase">
            Advanced Configuration
          </h2>
          <div className="h-px bg-accessory-emphasized" />
        </div>

        <div className="">
          <div className="flex items-center gap-3">
            <Switch
              id="targetUnit"
              checked={targetUnit === 'measurement'}
              onCheckedChange={(checked) =>
                setTargetUnit(checked ? 'measurement' : 'package')
              }
            />
            <Label htmlFor="targetUnit" className="cursor-pointer">
              Track in measurement{' '}
              <span className="text-xs font-normal">
                ({measurementUnit ? measurementUnit : '?'})
              </span>
            </Label>
          </div>
          <p className="text-xs text-foreground-muted">
            Turn on to enable precise measurement tracking
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="">
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

          <div className="">
            <Label htmlFor="amountPerPackage">
              Amount per Package
              {measurementUnit && ` `}
              {measurementUnit && (
                <span className="text-xs font-normal">({measurementUnit})</span>
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

      <div className="space-y-2">
        <Button
          type="submit"
          disabled={!isDirty || isValidationFailed}
          className="w-full"
        >
          Save
        </Button>
        {isDirty && validationMessage && (
          <p className="text-sm text-destructive">{validationMessage}</p>
        )}
      </div>
    </form>
  )
}
