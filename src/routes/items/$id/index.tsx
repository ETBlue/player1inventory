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
  const [initialValues] = useState({
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
      setTargetQuantity((prev) => prev * amount)
      setRefillThreshold((prev) => prev * amount)
      setConsumeAmount((prev) => prev * amount)
    } else if (
      prevTargetUnit.current === 'measurement' &&
      targetUnit === 'package'
    ) {
      setTargetQuantity((prev) => prev / amount)
      setRefillThreshold((prev) => prev / amount)
      setConsumeAmount((prev) => prev / amount)
    }

    prevTargetUnit.current = targetUnit
  }, [targetUnit, amountPerPackage, measurementUnit])

  // Auto-set targetUnit to 'package' when measurementUnit is cleared
  useEffect(() => {
    if (!measurementUnit && targetUnit === 'measurement') {
      setTargetUnit('package')
    }
  }, [measurementUnit, targetUnit])

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

  // Report dirty state to parent
  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

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
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      {/* Stock Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">Stock</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="packedQuantity">Packed Quantity</Label>
            <Input
              id="packedQuantity"
              type="number"
              min={0}
              step={1}
              value={packedQuantity}
              onChange={(e) => setPackedQuantity(Number(e.target.value))}
            />
          </div>

          {item.measurementUnit && (
            <div className="space-y-2">
              <Label htmlFor="unpackedQuantity">Unpacked Quantity</Label>
              <Input
                id="unpackedQuantity"
                type="number"
                min={0}
                step={item.consumeAmount || 1}
                value={unpackedQuantity}
                onChange={(e) => setUnpackedQuantity(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="expirationMode">Expiration Mode</Label>
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

          <div className="space-y-2">
            <Label htmlFor="expirationValue">
              {expirationMode === 'date'
                ? 'Expiration Date'
                : 'Days Until Expiration'}
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

      {/* Item Info Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">Item Info</h2>

        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="packageUnit">Package Unit</Label>
            <Input
              id="packageUnit"
              value={packageUnit}
              onChange={(e) => setPackageUnit(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="measurementUnit">Measurement Unit</Label>
            <Input
              id="measurementUnit"
              value={measurementUnit}
              onChange={(e) => setMeasurementUnit(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amountPerPackage">Amount per Package</Label>
            <Input
              id="amountPerPackage"
              type="number"
              step="1"
              min={1}
              value={amountPerPackage}
              onChange={(e) => setAmountPerPackage(e.target.value)}
              disabled={!measurementUnit}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Switch
              id="targetUnit"
              checked={targetUnit === 'measurement'}
              onCheckedChange={(checked) =>
                setTargetUnit(checked ? 'measurement' : 'package')
              }
              disabled={!measurementUnit}
            />
            <Label htmlFor="targetUnit" className="cursor-pointer">
              Track target in measurement
              {measurementUnit && ` (${measurementUnit})`}
            </Label>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="targetQuantity">Target Quantity</Label>
            <Input
              id="targetQuantity"
              type="number"
              min={0}
              step={targetUnit === 'package' ? 1 : consumeAmount || 1}
              value={targetQuantity}
              onChange={(e) => setTargetQuantity(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="refillThreshold">Refill When Below</Label>
            <Input
              id="refillThreshold"
              type="number"
              min={0}
              step={targetUnit === 'package' ? 1 : consumeAmount || 1}
              value={refillThreshold}
              onChange={(e) => setRefillThreshold(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="consumeAmount">Amount per Consume</Label>
            <Input
              id="consumeAmount"
              type="number"
              step="0.001"
              min={0.001}
              value={consumeAmount}
              onChange={(e) => setConsumeAmount(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expirationThreshold">
            Expiration Warning Threshold (days)
          </Label>
          <Input
            id="expirationThreshold"
            type="number"
            min={0}
            value={expirationThreshold}
            onChange={(e) => setExpirationThreshold(e.target.value)}
          />
        </div>
      </div>

      <Button type="submit" disabled={!isDirty}>
        Save
      </Button>
    </form>
  )
}
