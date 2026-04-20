import { useState } from 'react'
import { RecipeFilterDropdown } from '@/components/recipe/RecipeFilterDropdown'
import { TagTypeDropdown } from '@/components/tag/TagTypeDropdown'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VendorFilterDropdown } from '@/components/vendor/VendorFilterDropdown'
import { useVendors } from '@/hooks'
import { useRecipes } from '@/hooks/useRecipes'
import { useTags, useTagsWithDepth, useTagTypes } from '@/hooks/useTags'
import type { FilterConfig } from '@/types'

export interface CreateShelfInput {
  name: string
  type: 'filter' | 'selection'
  sortBy?: 'name' | 'stock' | 'expiring' | 'lastPurchased'
  sortDir?: 'asc' | 'desc'
  filterConfig?: FilterConfig
}

interface AddShelfDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CreateShelfInput) => void
}

export function AddShelfDialog({
  open,
  onOpenChange,
  onSubmit,
}: AddShelfDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'filter' | 'selection'>('filter')
  const [tagFilterState, setTagFilterState] = useState<
    Record<string, string[]>
  >({})
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([])
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<
    'name' | 'stock' | 'expiring' | 'lastPurchased'
  >('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { data: tagTypes = [] } = useTagTypes()
  const { data: tags = [] } = useTags()
  const { data: tagsWithDepth = [] } = useTagsWithDepth()
  const { data: vendors } = useVendors()
  const { data: recipes } = useRecipes()

  const nameError = !name.trim() ? 'Name is required' : undefined

  const resetForm = () => {
    setName('')
    setType('filter')
    setTagFilterState({})
    setSelectedVendorIds([])
    setSelectedRecipeIds([])
    setSortBy('name')
    setSortDir('asc')
  }

  const handleClose = () => {
    onOpenChange(false)
    resetForm()
  }

  const handleSubmit = () => {
    if (nameError) return

    const data: CreateShelfInput = {
      name: name.trim(),
      type,
    }

    if (type === 'filter') {
      data.sortBy = sortBy
      data.sortDir = sortDir
      data.filterConfig = {
        ...(Object.values(tagFilterState).flat().length > 0 && {
          tagIds: Object.values(tagFilterState).flat(),
        }),
        ...(selectedVendorIds.length > 0 && { vendorIds: selectedVendorIds }),
        ...(selectedRecipeIds.length > 0 && { recipeIds: selectedRecipeIds }),
      }
    }

    onSubmit(data)
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Shelf</DialogTitle>
        </DialogHeader>
        <DialogMain className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="shelfName">Name</Label>
            <Input
              id="shelfName"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="Shelf name"
              className="capitalize"
              onKeyDown={(e) =>
                e.key === 'Enter' && !nameError && handleSubmit()
              }
              error={nameError}
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as 'filter' | 'selection')}
              className="flex gap-4"
            >
              {[
                { value: 'filter', label: 'Filter' },
                { value: 'selection', label: 'Selection' },
              ].map(({ value, label }) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={`shelf-type-${value}`} />
                  <Label
                    htmlFor={`shelf-type-${value}`}
                    className="font-normal cursor-pointer"
                  >
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Filter config — only shown for filter type */}
          {type === 'filter' && (
            <>
              {/* Tag and entity filter dropdowns */}
              <div className="flex flex-wrap items-center gap-1">
                {tagTypes
                  .filter((tagType) =>
                    tags.some((tag) => tag.typeId === tagType.id),
                  )
                  .sort((a, b) =>
                    a.name.localeCompare(b.name, undefined, {
                      sensitivity: 'base',
                    }),
                  )
                  .map((tagType) => {
                    const orderedTypeTags = tagsWithDepth.filter(
                      (tag) => tag.typeId === tagType.id,
                    )
                    const selectedTagIds = tagFilterState[tagType.id] ?? []
                    return (
                      <TagTypeDropdown
                        key={tagType.id}
                        tagType={tagType}
                        tags={orderedTypeTags}
                        selectedTagIds={selectedTagIds}
                        onToggleTag={(tagId) => {
                          const current = tagFilterState[tagType.id] ?? []
                          const next = current.includes(tagId)
                            ? current.filter((id) => id !== tagId)
                            : [...current, tagId]
                          setTagFilterState({
                            ...tagFilterState,
                            [tagType.id]: next,
                          })
                        }}
                        onClear={() => {
                          const next = { ...tagFilterState }
                          delete next[tagType.id]
                          setTagFilterState(next)
                        }}
                      />
                    )
                  })}

                {vendors && vendors.length > 0 && (
                  <VendorFilterDropdown
                    vendors={vendors}
                    selectedIds={selectedVendorIds}
                    onToggle={(id) =>
                      setSelectedVendorIds(
                        selectedVendorIds.includes(id)
                          ? selectedVendorIds.filter((v) => v !== id)
                          : [...selectedVendorIds, id],
                      )
                    }
                    onClear={() => setSelectedVendorIds([])}
                    showManageLink={false}
                  />
                )}

                {recipes && recipes.length > 0 && (
                  <RecipeFilterDropdown
                    recipes={recipes}
                    selectedIds={selectedRecipeIds}
                    onToggle={(id) =>
                      setSelectedRecipeIds(
                        selectedRecipeIds.includes(id)
                          ? selectedRecipeIds.filter((v) => v !== id)
                          : [...selectedRecipeIds, id],
                      )
                    }
                    onClear={() => setSelectedRecipeIds([])}
                    showManageLink={false}
                  />
                )}
              </div>

              {/* Sort by */}
              <div className="flex gap-3">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="sortBy">Sort by</Label>
                  <Select
                    value={sortBy}
                    onValueChange={(v) =>
                      setSortBy(
                        v as 'name' | 'stock' | 'expiring' | 'lastPurchased',
                      )
                    }
                  >
                    <SelectTrigger id="sortBy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="stock">Stock</SelectItem>
                      <SelectItem value="expiring">Expiring soon</SelectItem>
                      <SelectItem value="lastPurchased">
                        Last purchased
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="sortDir">Direction</Label>
                  <Select
                    value={sortDir}
                    onValueChange={(v) => setSortDir(v as 'asc' | 'desc')}
                  >
                    <SelectTrigger id="sortDir">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </DialogMain>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!!nameError}>
            Create Shelf
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
