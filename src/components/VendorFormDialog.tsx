import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Vendor } from '@/types'

interface VendorFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendor?: Vendor
  onSave: (name: string) => void
}

export function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
  onSave,
}: VendorFormDialogProps) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) {
      setName(vendor?.name ?? '')
    }
  }, [open, vendor])

  const isEdit = !!vendor
  const isValid = name.trim().length > 0

  const handleSave = () => {
    if (!isValid) return
    onSave(name.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Vendor' : 'New Vendor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="vendorName">Name</Label>
            <Input
              id="vendorName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Costco, Trader Joe's"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="neutral-ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {isEdit ? 'Save' : 'Add Vendor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
