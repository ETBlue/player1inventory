import { createFileRoute } from '@tanstack/react-router'
import { Check, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateItem, useItems, useUpdateItem } from '@/hooks'
import { useVendors } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/$id/items')({
  component: VendorItemsTab,
})

function VendorItemsTab() {
  const { id: vendorId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: vendors = [] } = useVendors()
  const updateItem = useUpdateItem()

  const [search, setSearch] = useState('')
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const createItem = useCreateItem()

  const handleCreate = async () => {
    const trimmed = newItemName.trim()
    if (!trimmed) return
    try {
      await createItem.mutateAsync({
        name: trimmed,
        vendorIds: [vendorId],
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      setNewItemName('')
      setIsCreating(false)
    } catch {
      // mutateAsync rejection is handled by TanStack Query; input stays open for retry
    }
  }

  const handleNewItemKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') await handleCreate()
    if (e.key === 'Escape') {
      setNewItemName('')
      setIsCreating(false)
    }
  }

  const vendorMap = useMemo(
    () => Object.fromEntries(vendors.map((v) => [v.id, v])),
    [vendors],
  )

  const isAssigned = (vendorIds: string[] = []) => vendorIds.includes(vendorId)

  const handleToggle = async (
    itemId: string,
    currentVendorIds: string[] = [],
  ) => {
    const dbAssigned = currentVendorIds.includes(vendorId)
    const newVendorIds = dbAssigned
      ? currentVendorIds.filter((id) => id !== vendorId)
      : [...currentVendorIds, vendorId]

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateItem.mutateAsync({
        id: itemId,
        updates: { vendorIds: newVendorIds },
      })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const sortedItems = [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const filteredItems = sortedItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex gap-2">
        <Input
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          variant="outline"
          aria-label="New item"
          onClick={() => setIsCreating(true)}
          disabled={isCreating}
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      {isCreating && (
        <div className="flex gap-2">
          <Input
            autoFocus
            placeholder="Item name..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={handleNewItemKeyDown}
          />
          <Button
            size="icon"
            aria-label="Add item"
            onClick={handleCreate}
            disabled={!newItemName.trim() || createItem.isPending}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Cancel"
            onClick={() => {
              setNewItemName('')
              setIsCreating(false)
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {items.length === 0 && !isCreating && (
        <p className="text-sm text-foreground-muted">No items yet.</p>
      )}

      <div className="space-y-2">
        {filteredItems.map((item) => {
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
                checked={isAssigned(item.vendorIds)}
                onCheckedChange={() => handleToggle(item.id, item.vendorIds)}
                disabled={savingItemIds.has(item.id)}
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
    </div>
  )
}
