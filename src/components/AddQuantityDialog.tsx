import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AddQuantityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  onConfirm: (quantity: number, occurredAt: Date) => void
}

export function AddQuantityDialog({
  open,
  onOpenChange,
  itemName,
  onConfirm,
}: AddQuantityDialogProps) {
  const [quantity, setQuantity] = useState(1)
  const [date, setDate] = useState(() => {
    const [dateStr] = new Date().toISOString().split('T')
    return dateStr ?? ''
  })

  const handleConfirm = () => {
    onConfirm(quantity, new Date(date))
    setQuantity(1)
    const [dateStr] = new Date().toISOString().split('T')
    setDate(dateStr ?? '')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {itemName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Purchase Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
