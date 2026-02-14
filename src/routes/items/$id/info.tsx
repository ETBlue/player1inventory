import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useItem, useUpdateItem } from '@/hooks'
import { useToast } from '@/hooks/use-toast'
import { useItemLayout } from '@/hooks/useItemLayout'

export const Route = createFileRoute('/items/$id/info')({
  component: InfoTab,
})

function InfoTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { toast } = useToast()
  const { registerDirtyState } = useItemLayout()

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
      name,
      targetUnit,
      targetQuantity,
      refillThreshold,
      consumeAmount,
    }

    updates.packageUnit = packageUnit || undefined
    updates.measurementUnit = measurementUnit || undefined
    updates.amountPerPackage = amountPerPackage
      ? Number(amountPerPackage)
      : undefined
    updates.expirationThreshold = expirationThreshold
      ? Number(expirationThreshold)
      : undefined

    updateItem.mutate(
      { id, updates },
      {
        onSuccess: () => {
          toast({ title: 'Item info updated' })
        },
      },
    )
  }

  if (!item) return null

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
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

      <Button type="submit" disabled={!isDirty}>
        Save
      </Button>
    </form>
  )
}
