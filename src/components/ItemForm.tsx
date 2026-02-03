import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { useTagTypes, useTags } from '@/hooks/useTags'
import type { Item } from '@/types'

type ItemFormData = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>

interface ItemFormProps {
  initialData?: Partial<ItemFormData>
  onSubmit: (data: ItemFormData) => void
  submitLabel: string
}

export function ItemForm({ initialData, onSubmit, submitLabel }: ItemFormProps) {
  const { data: tagTypes = [] } = useTagTypes()
  const { data: allTags = [] } = useTags()

  const [name, setName] = useState(initialData?.name ?? '')
  const [unit, setUnit] = useState(initialData?.unit ?? '')
  const [targetQuantity, setTargetQuantity] = useState(initialData?.targetQuantity ?? 1)
  const [refillThreshold, setRefillThreshold] = useState(initialData?.refillThreshold ?? 1)
  const [estimatedDueDays, setEstimatedDueDays] = useState(initialData?.estimatedDueDays ?? '')
  const [tagIds, setTagIds] = useState<string[]>(initialData?.tagIds ?? [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: ItemFormData = {
      name,
      targetQuantity,
      refillThreshold,
      tagIds,
    }
    if (unit) data.unit = unit
    if (estimatedDueDays) data.estimatedDueDays = Number(estimatedDueDays)
    onSubmit(data)
  }

  const toggleTag = (tagId: string) => {
    setTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        <Label htmlFor="unit">Unit</Label>
        <Input
          id="unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="e.g., gallon, dozen, lb"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="targetQuantity">Target Quantity</Label>
          <Input
            id="targetQuantity"
            type="number"
            min={1}
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
            value={refillThreshold}
            onChange={(e) => setRefillThreshold(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="estimatedDueDays">Days Until Expiration</Label>
        <Input
          id="estimatedDueDays"
          type="number"
          min={1}
          value={estimatedDueDays}
          onChange={(e) => setEstimatedDueDays(e.target.value)}
          placeholder="Leave empty if no expiration"
        />
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
        {tagTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tags yet. Create tags in Settings.
          </p>
        ) : (
          <div className="space-y-3">
            {tagTypes.map((tagType) => {
              const typeTags = allTags.filter((t) => t.typeId === tagType.id)
              if (typeTags.length === 0) return null

              return (
                <div key={tagType.id}>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {tagType.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {typeTags.map((tag) => {
                      const isSelected = tagIds.includes(tag.id)
                      return (
                        <Badge
                          key={tag.id}
                          variant={isSelected ? 'default' : 'outline'}
                          className="cursor-pointer"
                          style={
                            isSelected && tag.color
                              ? { backgroundColor: tag.color }
                              : undefined
                          }
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
