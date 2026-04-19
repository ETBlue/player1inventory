import { Link } from '@tanstack/react-router'
import { ChevronDown, Pencil, Store, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Item, Vendor } from '@/types'

interface VendorFilterDropdownProps {
  vendors: Vendor[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onClear: () => void
  items?: Item[]
  showManageLink?: boolean
}

export function VendorFilterDropdown({
  vendors,
  selectedIds,
  onToggle,
  onClear,
  items,
  showManageLink = true,
}: VendorFilterDropdownProps) {
  const { t } = useTranslation()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={selectedIds.length > 0 ? 'neutral' : 'neutral-ghost'}
          size="xs"
          className="gap-1"
        >
          <Store />
          {t('settings.vendors.label')}
          {selectedIds.length > 0 && (
            <span className="text-xs font-semibold">{selectedIds.length}</span>
          )}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {vendors.map((vendor) => {
          const count = items
            ? items.filter((item) => item.vendorIds?.includes(vendor.id)).length
            : undefined
          return (
            <DropdownMenuCheckboxItem
              key={vendor.id}
              checked={selectedIds.includes(vendor.id)}
              onCheckedChange={() => onToggle(vendor.id)}
              onSelect={(e) => e.preventDefault()}
            >
              <div className="flex items-center justify-between w-full">
                <span>{vendor.name}</span>
                {count !== undefined && (
                  <span className="text-foreground-muted text-xs ml-2">
                    ({count})
                  </span>
                )}
              </div>
            </DropdownMenuCheckboxItem>
          )
        })}
        {selectedIds.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>
              <X className="h-4 w-4" />
              <span className="text-xs">{t('common.clear')}</span>
            </DropdownMenuItem>
          </>
        )}
        {showManageLink && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to="/settings/vendors"
                className="flex items-center gap-1.5"
              >
                <Pencil className="h-4 w-4" />
                <span className="text-xs">{t('common.manage')}</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
