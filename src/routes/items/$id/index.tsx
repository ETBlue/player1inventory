import { createFileRoute } from '@tanstack/react-router'
import { Calendar, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { useItem, useUpdateItem } from '@/hooks'
import { useItemLayout } from '@/hooks/useItemLayout'

export const Route = createFileRoute('/items/$id/')({
  component: StockTab,
})

function StockTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { registerDirtyState } = useItemLayout()

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

  // Track initial values
  const [initialValues] = useState({
    packedQuantity: item?.packedQuantity ?? 0,
    unpackedQuantity: item?.unpackedQuantity ?? 0,
    expirationMode: item?.estimatedDueDays ? 'days' : 'date',
    dueDate: item?.dueDate ? item.dueDate.toISOString().split('T')[0] : '',
    estimatedDueDays: item?.estimatedDueDays ?? '',
  })

  // Compute dirty state
  const isDirty =
    packedQuantity !== initialValues.packedQuantity ||
    unpackedQuantity !== initialValues.unpackedQuantity ||
    expirationMode !== initialValues.expirationMode ||
    dueDate !== initialValues.dueDate ||
    estimatedDueDays !== initialValues.estimatedDueDays

  // Report dirty state to parent
  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const updates: any = {
      packedQuantity,
      unpackedQuantity,
    }

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

    updateItem.mutate({ id, updates })
  }

  if (!item) return null

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
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

      <div className="space-y-4">
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

      <Button type="submit" disabled={!isDirty}>
        Save
      </Button>
    </form>
  )
}
