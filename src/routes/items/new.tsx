import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useCreateItem, useTags, useTagTypes } from '@/hooks'
import { sortTagsByName } from '@/lib/tagSortUtils'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/new')({
  component: NewItemPage,
})

function NewItemPage() {
  const navigate = useNavigate()
  const createItem = useCreateItem()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: allTags = [] } = useTags()

  const [name, setName] = useState('')
  const [packageUnit, setPackageUnit] = useState('')
  const [measurementUnit, setMeasurementUnit] = useState('')
  const [amountPerPackage, setAmountPerPackage] = useState('')
  const [targetUnit, setTargetUnit] = useState<'package' | 'measurement'>(
    'package',
  )
  const [targetQuantity, setTargetQuantity] = useState(1)
  const [refillThreshold, setRefillThreshold] = useState(1)
  const [consumeAmount, setConsumeAmount] = useState(1)
  const [expirationThreshold, setExpirationThreshold] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])

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

  useEffect(() => {
    if (!measurementUnit && targetUnit === 'measurement') {
      setTargetUnit('package')
    }
  }, [measurementUnit, targetUnit])

  const _clearForm = () => {
    setName('')
    setPackageUnit('')
    setMeasurementUnit('')
    setAmountPerPackage('')
    setTargetUnit('package')
    setTargetQuantity(1)
    setRefillThreshold(1)
    setConsumeAmount(1)
    setExpirationThreshold('')
    setTagIds([])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      targetUnit,
      targetQuantity,
      refillThreshold,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount,
      tagIds,
    }

    data.packageUnit = packageUnit || undefined
    data.measurementUnit = measurementUnit || undefined
    data.amountPerPackage = amountPerPackage
      ? Number(amountPerPackage)
      : undefined
    data.expirationThreshold = expirationThreshold
      ? Number(expirationThreshold)
      : undefined

    createItem.mutate(data, {
      onSuccess: (newItem) => {
        // Navigate to the newly created item
        navigate({ to: '/items/$id', params: { id: newItem.id } })
      },
    })
  }

  const toggleTag = (tagId: string) => {
    setTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    )
  }

  return (
    <div className="min-h-screen">
      {/* Fixed Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background-elevated border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="neutral-ghost"
            size="icon"
            onClick={() => navigate({ to: '/' })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">New Item</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-20 p-4">
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

          <div className="border-t pt-6 space-y-4">
            <h3 className="text-sm font-medium">Tags</h3>
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
                    const typeTags = allTags.filter(
                      (t) => t.typeId === tagType.id,
                    )
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

          <Button type="submit">Save</Button>
        </form>
      </div>
    </div>
  )
}
