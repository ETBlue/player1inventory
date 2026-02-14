import { X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTags, useTagTypes } from '@/hooks/useTags'
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
    initialData?.dueDate ? 'date' : 'days',
  )
  const [dueDate, setDueDate] = useState(
    initialData?.dueDate ? initialData.dueDate.toISOString().split('T')[0] : '',
  )
  const [estimatedDueDays, setEstimatedDueDays] = useState(
    initialData?.estimatedDueDays ?? '',
  )
  const [tagIds, setTagIds] = useState<string[]>(initialData?.tagIds ?? [])
  const [packedQuantity, setPackedQuantity] = useState(
    initialData?.packedQuantity ?? 0,
  )
  const [unpackedQuantity, setUnpackedQuantity] = useState(
    initialData?.unpackedQuantity ?? 0,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

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

    // Check for excess unpacked quantity
    if (
      targetUnit === 'measurement' &&
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

    const data: ItemFormData = {
      name,
      targetUnit,
      targetQuantity,
      refillThreshold,
      packedQuantity,
      unpackedQuantity,
      consumeAmount,
      tagIds,
    }
    if (packageUnit) data.packageUnit = packageUnit
    if (measurementUnit) data.measurementUnit = measurementUnit
    if (amountPerPackage) data.amountPerPackage = Number(amountPerPackage)
    if (expirationMode === 'date' && dueDate) {
      data.dueDate = new Date(dueDate)
    } else if (expirationMode === 'days' && estimatedDueDays) {
      data.estimatedDueDays = Number(estimatedDueDays)
    }
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

      <div className="space-y-2">
        <Label htmlFor="packageUnit">Package Unit</Label>
        <Input
          id="packageUnit"
          value={packageUnit}
          onChange={(e) => setPackageUnit(e.target.value)}
          placeholder="e.g., bottle, pack, box"
        />
        <p className="text-xs text-foreground-muted">
          The unit for whole packages (e.g., "bottle" for milk)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="measurementUnit">Measurement Unit (optional)</Label>
        <Input
          id="measurementUnit"
          value={measurementUnit}
          onChange={(e) => setMeasurementUnit(e.target.value)}
          placeholder="e.g., L, ml, cups, 根"
        />
        <p className="text-xs text-foreground-muted">
          For tracking partial packages (leave empty for simple counting)
        </p>
      </div>

      {packageUnit && measurementUnit && (
        <>
          <div className="space-y-2">
            <Label htmlFor="amountPerPackage">Amount per Package *</Label>
            <Input
              id="amountPerPackage"
              type="number"
              step="0.001"
              min={0.001}
              value={amountPerPackage}
              onChange={(e) => setAmountPerPackage(e.target.value)}
              placeholder="e.g., 1 (for 1L per bottle)"
              required
            />
            <p className="text-xs text-foreground-muted">
              How much {measurementUnit} in each {packageUnit}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Track Target In</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="targetUnit"
                  value="package"
                  checked={targetUnit === 'package'}
                  onChange={(e) =>
                    setTargetUnit(e.target.value as 'package' | 'measurement')
                  }
                />
                <span>Packages ({packageUnit})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="targetUnit"
                  value="measurement"
                  checked={targetUnit === 'measurement'}
                  onChange={(e) =>
                    setTargetUnit(e.target.value as 'package' | 'measurement')
                  }
                />
                <span>Measurement ({measurementUnit})</span>
              </label>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
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
          <p className="text-xs text-foreground-muted">
            Set to 0 to mark as inactive
          </p>
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
        <p className="text-xs text-foreground-muted">
          Amount removed with each consume click
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

        {targetUnit === 'measurement' && measurementUnit && (
          <div className="space-y-2">
            <Label htmlFor="unpackedQuantity">Unpacked Quantity</Label>
            <Input
              id="unpackedQuantity"
              type="number"
              min={0}
              step={0.01}
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
              Loose amount ({measurementUnit}) from opened package
            </p>
          </div>
        )}
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
        <Label>Tags</Label>
        {tagTypes.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No tags yet. Create tags in Settings.
          </p>
        ) : (
          <div className="space-y-3">
            {tagTypes.map((tagType) => {
              const typeTags = allTags.filter((t) => t.typeId === tagType.id)
              if (typeTags.length === 0) return null

              return (
                <div key={tagType.id}>
                  <p className="text-sm font-medium text-foreground-muted mb-1">
                    {tagType.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {typeTags.map((tag) => {
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
