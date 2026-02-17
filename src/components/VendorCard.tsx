import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Vendor } from '@/types'

interface VendorCardProps {
  vendor: Vendor
  onEdit: () => void
  onDelete: () => void
}

export function VendorCard({ vendor, onEdit, onDelete }: VendorCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <span className="font-medium">{vendor.name}</span>
        <div className="flex gap-1">
          <Button
            variant="neutral-ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Edit vendor"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="neutral-ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            aria-label="Delete vendor"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
