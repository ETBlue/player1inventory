import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { sortTagsByName } from '@/lib/tagSortUtils'
import type { Item } from '@/types'

type ItemFormData = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>

interface ItemFormProps {
  initialData?: Partial<ItemFormData>
  onSubmit: (data: ItemFormData) => void
  submitLabel: string
}

export function ItemForm({
  initialData,
  onSubmit,
  submitLabel,
}: ItemFormProps) {
  const { data: tagTypes = [] } = useTagTypes()
  const { data: allTags = [] } = useTags()

  const [name, setName] = useState(initialData?.name ?? '')
  const [packageUnit, setPackageUnit] = useState(initialData?.packageUnit ?? '')
  const [measurementUnit, setMeasurementUnit] = useState(
    initialData?.measurementUnit ?? '',
  )
  const [amountPerPackage, setAmountPerPackage] = useState(
    initialData?.amountPerPackage ?? '',
  )
  const [targetUnit, setTargetUnit] = useState<'package' | 'measurement'>(
    initialData?.targetUnit ?? 'package',
  )
  const [targetQuantity, setTargetQuantity] = useState(
    initialData?.targetQuantity ?? 1,
  )
  const [refillThreshold, setRefillThreshold] = useState(
    initialData?.refillThreshold ?? 1,
  )
  const [consumeAmount, setConsumeAmount] = useState(
    initialData?.consumeAmount ?? 1,
  )
  const [expirationMode, setExpirationMode] = useState<'date' | 'days'>(
    initialData?.estimatedDueDays ? 'days' : 'date',
  )
  const [dueDate, setDueDate] = useState(
    initialData?.dueDate ? initialData.dueDate.toISOString().split('T')[0] : '',
  )
  const [estimatedDueDays, setEstimatedDueDays] = useState(
    initialData?.estimatedDueDays ?? '',
  )
  const [expirationThreshold, setExpirationThreshold] = useState(
    initialData?.expirationThreshold ?? '',
  )
  const [tagIds, setTagIds] = useState<string[]>(initialData?.tagIds ?? [])
  const [packedQuantity, setPackedQuantity] = useState(
    initialData?.packedQuantity ?? 0,
  )
  const [unpackedQuantity, setUnpackedQuantity] = useState(
    initialData?.unpackedQuantity ?? 0,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Track previous targetUnit for conversion
  const prevTargetUnit = useRef<'package' | 'measurement'>(targetUnit)

  // Convert values when switching between package and measurement tracking
  useEffect(() => {
    // Only convert if we have conversion ratio and targetUnit actually changed
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

    // Convert from package to measurement
    if (prevTargetUnit.current === 'package' && targetUnit === 'measurement') {
      setTargetQuantity((prev) => prev * amount)
      setRefillThreshold((prev) => prev * amount)
      setConsumeAmount((prev) => prev * amount)
    }
    // Convert from measurement to package
    else if (
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

  // Sync form state when initialData changes (e.g., after consume/add actions)
  useEffect(() => {
    if (initialData) {
      const packed = initialData.packedQuantity ?? 0
      const unpacked = initialData.unpackedQuantity ?? 0

      // Normalize: packed quantity should always be an integer
      const packedInteger = Math.floor(packed)
      const packedDecimal = packed - packedInteger

      // Convert decimal part to unpacked quantity if needed
      if (packedDecimal > 0 && initialData.amountPerPackage) {
        setPackedQuantity(packedInteger)
        setUnpackedQuantity(
          Math.round(
            (unpacked + packedDecimal * initialData.amountPerPackage) * 1000,
          ) / 1000,
        )
      } else {
        setPackedQuantity(packed)
        setUnpackedQuantity(unpacked)
      }
    }
  }, [initialData?.packedQuantity, initialData?.unpackedQuantity, initialData])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate
    const newErrors: Record<string, string> = {}

    if (packedQuantity < 0) {
      newErrors.packedQuantity = 'Must be 0 or greater'
    }

    if (unpackedQuantity < 0) {
      newErrors.unpackedQuantity = 'Must be 0 or greater'
    }

    // Check for excess unpacked quantity (only in dual-unit mode, not simple mode)
    if (
      measurementUnit &&
      amountPerPackage &&
      unpackedQuantity >= Number(amountPerPackage)
    ) {
      newErrors.unpackedQuantity = `Should be less than ${amountPerPackage} ${measurementUnit}. Consider adding to packed quantity.`
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})

    // Normalize: packed quantity must be an integer
    const packedInteger = Math.floor(packedQuantity)
    const packedDecimal = packedQuantity - packedInteger
    const normalizedPacked = packedInteger
    const normalizedUnpacked =
      packedDecimal > 0 && amountPerPackage
        ? Math.round(
            (unpackedQuantity + packedDecimal * Number(amountPerPackage)) *
              1000,
          ) / 1000
        : unpackedQuantity

    const data: ItemFormData = {
      name,
      targetUnit,
      targetQuantity,
      refillThreshold,
      packedQuantity: normalizedPacked,
      unpackedQuantity: normalizedUnpacked,
      consumeAmount,
      tagIds,
    }
    // Set optional fields explicitly to undefined when empty to clear them
    data.packageUnit = packageUnit || undefined
    data.measurementUnit = measurementUnit || undefined
    data.amountPerPackage = amountPerPackage
      ? Number(amountPerPackage)
      : undefined
    if (expirationMode === 'date' && dueDate) {
      data.dueDate = new Date(dueDate)
    } else if (expirationMode === 'days' && estimatedDueDays) {
      data.estimatedDueDays = Number(estimatedDueDays)
    }
    data.expirationThreshold = expirationThreshold
      ? Number(expirationThreshold)
      : undefined
    onSubmit(data)
  }

  const toggleTag = (tagId: string) => {
    setTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Milk"
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
            placeholder="e.g., bottle, pack, box"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="measurementUnit">Measurement Unit</Label>
          <Input
            id="measurementUnit"
            value={measurementUnit}
            onChange={(e) => setMeasurementUnit(e.target.value)}
            placeholder="e.g., L, ml, cups, 根"
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
            placeholder="e.g., 1"
            disabled={!measurementUnit}
          />
        </div>
      </div>

      {/* Helper text row */}
      <div className="grid grid-cols-3 gap-4 -mt-4">
        <p className="text-xs text-foreground-muted">Unit for whole packages</p>
        <p className="text-xs text-foreground-muted">
          For tracking partial packages
        </p>
        <p className="text-xs text-foreground-muted">
          {measurementUnit && packageUnit
            ? `${measurementUnit} per ${packageUnit}`
            : measurementUnit
              ? `${measurementUnit} per package`
              : 'Optional'}
        </p>
      </div>

      {measurementUnit && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Switch
              id="targetUnit"
              checked={targetUnit === 'measurement'}
              onCheckedChange={(checked) =>
                setTargetUnit(checked ? 'measurement' : 'package')
              }
            />
            <Label htmlFor="targetUnit" className="cursor-pointer">
              Track target in measurement ({measurementUnit})
            </Label>
          </div>
          {targetUnit === 'package' && (
            <p className="text-xs text-foreground-muted">
              Currently tracking in {packageUnit || 'packages'}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="targetQuantity">
            Target Quantity
            {targetUnit === 'measurement' && measurementUnit
              ? ` (${measurementUnit})`
              : packageUnit
                ? ` (${packageUnit})`
                : ''}
          </Label>
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
          <Label htmlFor="refillThreshold">
            Refill When Below
            {targetUnit === 'measurement' && measurementUnit
              ? ` (${measurementUnit})`
              : packageUnit
                ? ` (${packageUnit})`
                : ''}
          </Label>
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
          <Label htmlFor="consumeAmount">
            Amount per Consume
            {targetUnit === 'measurement' && measurementUnit
              ? ` (${measurementUnit})`
              : packageUnit
                ? ` (${packageUnit})`
                : ''}
          </Label>
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

      {/* Helper text row */}
      <div className="grid grid-cols-3 gap-4 -mt-4">
        <p className="text-xs text-foreground-muted">
          Set to 0 to mark as inactive
        </p>
        <p className="text-xs text-foreground-muted">
          Trigger low stock warning
        </p>
        <p className="text-xs text-foreground-muted">
          Amount removed per consume click
        </p>
      </div>

      <div className="border-t pt-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground-muted">
          Current Inventory
        </h3>
        <div className="space-y-2">
          <Label htmlFor="packedQuantity">Packed Quantity</Label>
          <Input
            id="packedQuantity"
            type="number"
            min={0}
            step={1}
            value={packedQuantity}
            onChange={(e) => setPackedQuantity(Number(e.target.value))}
            placeholder="0"
          />
          {errors.packedQuantity && (
            <p className="text-xs text-status-error">{errors.packedQuantity}</p>
          )}
          <p className="text-xs text-foreground-muted">
            Number of whole packages currently in stock
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="unpackedQuantity">Unpacked Quantity</Label>
          <Input
            id="unpackedQuantity"
            type="number"
            min={0}
            step={consumeAmount || 1}
            value={unpackedQuantity}
            onChange={(e) => setUnpackedQuantity(Number(e.target.value))}
            placeholder="0"
          />
          {errors.unpackedQuantity && (
            <p className="text-xs text-status-error">
              {errors.unpackedQuantity}
            </p>
          )}
          <p className="text-xs text-foreground-muted">
            Loose amount{measurementUnit ? ` (${measurementUnit})` : ''} from
            opened package
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Expiration (optional)</Label>
        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            variant={expirationMode === 'date' ? 'default' : 'neutral-outline'}
            size="sm"
            onClick={() => setExpirationMode('date')}
          >
            📅 Specific Date
          </Button>
          <Button
            type="button"
            variant={expirationMode === 'days' ? 'default' : 'neutral-outline'}
            size="sm"
            onClick={() => setExpirationMode('days')}
          >
            🔢 Days from Purchase
          </Button>
        </div>

        {expirationMode === 'date' && (
          <>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <p className="text-xs text-foreground-muted">
              Set a specific expiration date
            </p>
          </>
        )}

        {expirationMode === 'days' && (
          <>
            <Input
              id="estimatedDueDays"
              type="number"
              min={1}
              value={estimatedDueDays}
              onChange={(e) => setEstimatedDueDays(e.target.value)}
              placeholder="Leave empty if no expiration"
            />
            <p className="text-xs text-foreground-muted">
              Auto-calculate expiration based on purchase date
            </p>
          </>
        )}
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
          placeholder="e.g., 3 (show warning 3 days before expiration)"
        />
        <p className="text-xs text-foreground-muted">
          Show expiration warning when item expires within this many days. Leave
          empty to always show.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
        {tagTypes.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No tags yet. Create tags in Settings.
          </p>
        ) : (
          <div className="space-y-3">
            {[...tagTypes]
              .sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                  sensitivity: 'base',
                }),
              )
              .map((tagType) => {
                const typeTags = allTags.filter((t) => t.typeId === tagType.id)
                if (typeTags.length === 0) return null
                const sortedTypeTags = sortTagsByName(typeTags)

                return (
                  <div key={tagType.id}>
                    <p className="text-sm font-medium text-foreground-muted mb-1">
                      {tagType.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {sortedTypeTags.map((tag) => {
                        const isSelected = tagIds.includes(tag.id)

                        return (
                          <Badge
                            key={tag.id}
                            variant={
                              isSelected ? tagType.color : 'neutral-outline'
                            }
                            className="cursor-pointer"
                            onClick={() => toggleTag(tag.id)}
                          >
                            {tag.name}
                            {isSelected && <X className="ml-1 h-3 w-3" />}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>
    </form>
  )
}
