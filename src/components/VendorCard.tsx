import { Link } from '@tanstack/react-router'
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
        <Link
          to="/settings/vendors/$id"
          params={{ id: vendor.id }}
          className="font-medium hover:underline"
        >
          {vendor.name}
        </Link>
        <div className="flex gap-1">
          <Button
            variant="neutral-ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Edit ${vendor.name}`}
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="neutral-ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            aria-label={`Delete ${vendor.name}`}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
