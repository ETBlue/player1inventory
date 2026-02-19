import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Vendor } from '@/types'

interface VendorCardProps {
  vendor: Vendor
  onDelete: () => void
}

export function VendorCard({ vendor, onDelete }: VendorCardProps) {
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
        <Button
          variant="neutral-ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          aria-label={`Delete ${vendor.name}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
