import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useShelfLayout } from '@/hooks/useShelfLayout'
import {
  useDeleteShelfMutation,
  useShelfQuery,
  useUpdateShelfMutation,
} from '@/hooks/useShelves'

export const Route = createFileRoute('/settings/shelves/$shelfId/')({
  component: ShelfInfoTab,
})

function ShelfInfoTab() {
  const { shelfId } = Route.useParams()
  const { data: shelf, isLoading } = useShelfQuery(shelfId)
  const updateShelf = useUpdateShelfMutation()
  const deleteShelf = useDeleteShelfMutation()
  const { goBack } = useAppNavigation('/settings/shelves')
  const { registerDirtyState } = useShelfLayout()

  // Flat state for editable fields
  const [name, setName] = useState('')
  const [sortBy, setSortBy] = useState<string>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Initialize / reset state when shelf loads or changes
  useEffect(() => {
    if (!shelf) return
    setName(shelf.name)
    setSortBy(shelf.filterConfig?.sortBy ?? 'name')
    setSortDir(shelf.filterConfig?.sortDir ?? 'asc')
  }, [shelf])

  // isDirty — compare current state vs saved shelf data
  const isDirty = useMemo(() => {
    if (!shelf) return false
    if (name.trim() !== shelf.name) return true
    if (shelf.type === 'filter') {
      if (sortBy !== (shelf.filterConfig?.sortBy ?? 'name')) return true
      if (sortDir !== (shelf.filterConfig?.sortDir ?? 'asc')) return true
    }
    return false
  }, [name, shelf, sortBy, sortDir])

  // Notify parent layout of dirty state
  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSave = () => {
    if (!shelf) return
    if (shelf.type === 'filter') {
      const base = shelf.filterConfig ?? {}
      updateShelf.mutate({
        id: shelf.id,
        data: {
          name: name.trim(),
          filterConfig: {
            ...(base.tagIds && base.tagIds.length > 0
              ? { tagIds: base.tagIds }
              : {}),
            ...(base.vendorIds && base.vendorIds.length > 0
              ? { vendorIds: base.vendorIds }
              : {}),
            ...(base.recipeIds && base.recipeIds.length > 0
              ? { recipeIds: base.recipeIds }
              : {}),
            sortBy: sortBy as 'name' | 'stock' | 'expiring' | 'lastPurchased',
            sortDir,
          },
        },
      })
    } else {
      updateShelf.mutate({ id: shelf.id, data: { name: name.trim() } })
    }
    goBack()
  }

  if (isLoading) return <LoadingSpinner />
  if (!shelf) return null

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Name */}
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="capitalize"
          aria-label="Shelf name"
        />
      </div>

      {/* Sort / order (filter shelves only) */}
      {shelf.type === 'filter' && (
        <div className="space-y-4">
          {/* Sort by */}
          <div className="space-y-1.5">
            <Label>Sort by</Label>
            <RadioGroup
              value={sortBy}
              onValueChange={setSortBy}
              className="flex flex-wrap gap-x-4 gap-y-2"
            >
              {[
                { value: 'name', label: 'Name' },
                { value: 'stock', label: 'Stock' },
                { value: 'expiring', label: 'Expiring' },
                { value: 'lastPurchased', label: 'Last purchased' },
              ].map(({ value, label }) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={`shelf-sort-${value}`} />
                  <Label
                    htmlFor={`shelf-sort-${value}`}
                    className="font-normal cursor-pointer"
                  >
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Order */}
          <div className="space-y-1.5">
            <Label>Order</Label>
            <RadioGroup
              value={sortDir}
              onValueChange={(v: string) => setSortDir(v as 'asc' | 'desc')}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="asc" id="shelf-sort-asc" />
                <Label
                  htmlFor="shelf-sort-asc"
                  className="font-normal cursor-pointer"
                >
                  Ascending
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="desc" id="shelf-sort-desc" />
                <Label
                  htmlFor="shelf-sort-desc"
                  className="font-normal cursor-pointer"
                >
                  Descending
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      )}

      {/* Save button */}
      <Button className="mt-2 w-full" variant="primary" onClick={handleSave}>
        Save
      </Button>

      {/* Delete */}
      <DeleteButton
        trigger="Delete shelf"
        buttonClassName="mt-2 w-full"
        dialogTitle={`Delete "${shelf.name}"?`}
        dialogDescription="Items will move to Unsorted."
        onDelete={() => {
          deleteShelf.mutate(shelf.id)
          goBack()
        }}
      />
    </div>
  )
}
