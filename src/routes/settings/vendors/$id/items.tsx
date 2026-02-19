import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useItems, useUpdateItem } from '@/hooks'
import { useVendorLayout } from '@/hooks/useVendorLayout'
import { useVendors } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/$id/items')({
  component: VendorItemsTab,
})

function VendorItemsTab() {
  const { id: vendorId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: vendors = [] } = useVendors()
  const updateItem = useUpdateItem()
  const { registerDirtyState } = useVendorLayout()

  const [search, setSearch] = useState('')
  // toggled[itemId] = true means this item's assignment to this vendor has been flipped
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const vendorMap = useMemo(
    () => Object.fromEntries(vendors.map((v) => [v.id, v])),
    [vendors],
  )

  const isDirty = Object.keys(toggled).length > 0

  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const isAssigned = (itemId: string, vendorIds: string[] = []) => {
    const dbAssigned = vendorIds.includes(vendorId)
    return toggled[itemId] ? !dbAssigned : dbAssigned
  }

  const handleToggle = (itemId: string) => {
    setToggled((prev) => {
      const next = { ...prev }
      if (next[itemId]) {
        delete next[itemId]
      } else {
        next[itemId] = true
      }
      return next
    })
  }

  const handleSave = async () => {
    const changedItems = items.filter((item) => toggled[item.id])
    await Promise.all(
      changedItems.map((item) => {
        const dbAssigned = (item.vendorIds ?? []).includes(vendorId)
        const newVendorIds = dbAssigned
          ? (item.vendorIds ?? []).filter((id) => id !== vendorId)
          : [...(item.vendorIds ?? []), vendorId]
        return updateItem.mutateAsync({
          id: item.id,
          updates: { vendorIds: newVendorIds },
        })
      }),
    )
    setToggled({})
  }

  const sortedItems = [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const filteredItems = sortedItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-4 max-w-2xl">
      <Input
        placeholder="Search items..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {items.length === 0 && (
        <p className="text-sm text-foreground-muted">No items yet.</p>
      )}

      <div className="space-y-2">
        {filteredItems.map((item) => {
          const checked = isAssigned(item.id, item.vendorIds)
          const otherVendors = (item.vendorIds ?? [])
            .filter((vid) => vid !== vendorId)
            .map((vid) => vendorMap[vid])
            .filter((v): v is NonNullable<typeof v> => v != null)

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 py-2 px-1 rounded hover:bg-background-surface transition-colors"
            >
              <Checkbox
                id={`item-${item.id}`}
                checked={checked}
                onCheckedChange={() => handleToggle(item.id)}
              />
              <Label
                htmlFor={`item-${item.id}`}
                className="flex-1 cursor-pointer font-normal"
              >
                {item.name}
              </Label>
              <div className="flex gap-1 flex-wrap justify-end">
                {otherVendors.map((v) => (
                  <Badge
                    key={v.id}
                    variant="neutral-outline"
                    className="text-xs"
                  >
                    {v.name}
                  </Badge>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Button onClick={handleSave} disabled={!isDirty || updateItem.isPending}>
        Save
      </Button>
    </div>
  )
}
