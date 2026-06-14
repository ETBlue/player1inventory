import { useNavigate } from '@tanstack/react-router'
import { Check, Plus } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useAddItemToLocation, useCreateItem, useItems } from '@/hooks'
import { cn } from '@/lib/utils'
import type { PantryItem } from '@/types'

interface NewItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  /**
   * Called with the resulting item after a successful add/create. When omitted,
   * the dialog navigates to the item detail page (create path) or simply closes
   * (add-existing path). Callers that need to post-process (e.g. assign a tag)
   * pass this and handle navigation themselves.
   */
  onSuccess?: (item: PantryItem) => void
}

// The "Add" dialog is a searchable combobox over all items the user can access.
// Typing filters the global catalog by name. Selecting an item already in the
// catalog stocks it in the active location (copy-on-add); when nothing matches,
// a "Create" option creates a brand-new global item stocked here.
export function NewItemDialog({
  open,
  onOpenChange,
  initialName = '',
  onSuccess,
}: NewItemDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createItem = useCreateItem()
  const addItemToLocation = useAddItemToLocation()
  // The full accessible catalog: every global Item joined with active-location
  // stock. `stockId` is undefined when the item is not stocked here yet.
  const { data: allItems = [] } = useItems()

  const [name, setName] = useState(initialName)
  const [packageUnit, setPackageUnit] = useState('')
  // Index of the keyboard-highlighted option in the combined options list.
  const [activeIndex, setActiveIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const listboxId = useId()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = name.trim()
  const lower = trimmed.toLowerCase()

  // Items whose name contains the query, sorted: stockable (not yet stocked
  // here) first, then already-stocked (shown disabled). Without a query, show
  // every accessible item so the user can browse the catalog.
  const matches = useMemo(() => {
    const filtered = lower
      ? allItems.filter((i) => i.name.toLowerCase().includes(lower))
      : allItems
    return [...filtered].sort((a, b) => {
      const aStocked = !!a.stockId
      const bStocked = !!b.stockId
      if (aStocked !== bStocked) return aStocked ? 1 : -1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [allItems, lower])

  const hasExactMatch = useMemo(
    () => allItems.some((i) => i.name.toLowerCase() === lower),
    [allItems, lower],
  )

  // The "Create" option is offered only when there's a query with no exact name
  // collision in the catalog.
  const showCreate = trimmed.length > 0 && !hasExactMatch

  // Flattened option list for keyboard navigation. The create row (if present)
  // is always last.
  type Option =
    | { kind: 'item'; item: PantryItem }
    | { kind: 'create'; name: string }
  const options = useMemo<Option[]>(() => {
    const opts: Option[] = matches.map((item) => ({ kind: 'item', item }))
    if (showCreate) opts.push({ kind: 'create', name: trimmed })
    return opts
  }, [matches, showCreate, trimmed])

  // Selectable options exclude items already stocked in the active location.
  const isSelectable = (opt: Option) =>
    opt.kind === 'create' || !opt.item.stockId

  // Clamp the highlighted index whenever the option set changes.
  useEffect(() => {
    setActiveIndex((prev) => {
      if (options.length === 0) return 0
      return Math.min(prev, options.length - 1)
    })
  }, [options.length])

  const resetForm = () => {
    setName(initialName)
    setPackageUnit('')
    setActiveIndex(0)
  }

  const handleClose = () => {
    onOpenChange(false)
    resetForm()
  }

  const handleCreate = async () => {
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const item = await createItem.mutateAsync({
        name: trimmed,
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        ...(packageUnit.trim() ? { packageUnit: packageUnit.trim() } : {}),
      })
      if (!item) return
      handleClose()
      if (onSuccess) {
        onSuccess(item as PantryItem)
      } else {
        navigate({ to: '/items/$id', params: { id: (item as PantryItem).id } })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectExisting = async (item: PantryItem) => {
    // Copy-on-add. No-op-safe: if the item is already stocked here, the
    // operation returns the existing row without resetting quantities.
    if (submitting) return
    setSubmitting(true)
    try {
      await addItemToLocation.mutateAsync(item.id)
      handleClose()
      if (onSuccess) {
        onSuccess({ ...item, stockId: item.stockId ?? 'pending' })
      }
      // No navigation by default — the item now appears in the pantry list.
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectOption = (opt: Option) => {
    if (!isSelectable(opt)) return
    if (opt.kind === 'create') {
      void handleCreate()
    } else {
      void handleSelectExisting(opt.item)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (options.length === 0) return
      setActiveIndex((prev) => (prev + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (options.length === 0) return
      setActiveIndex((prev) => (prev - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = options[activeIndex]
      if (opt) handleSelectOption(opt)
      else if (showCreate) void handleCreate()
    }
  }

  // Sync name + reset highlight when the dialog (re)opens with a new seed name.
  useEffect(() => {
    setName(initialName)
    setActiveIndex(0)
  }, [initialName])

  const activeOptionId =
    options.length > 0 ? `${listboxId}-opt-${activeIndex}` : undefined

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('items.addDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogMain className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={inputId}>{t('common.nameLabel')}</Label>
            <Input
              id={inputId}
              ref={inputRef}
              value={name}
              autoFocus
              className="capitalize"
              role="combobox"
              aria-expanded={options.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              {...(activeOptionId
                ? { 'aria-activedescendant': activeOptionId }
                : {})}
              placeholder={t('items.addDialog.searchPlaceholder')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {/* Listbox of matches. Focus stays on the combobox input above;
                options are virtually highlighted via aria-activedescendant, and
                all keyboard interaction is handled by the input's onKeyDown. */}
            <div
              id={listboxId}
              role="listbox"
              aria-label={t('items.addDialog.title')}
              className="max-h-64 overflow-y-auto rounded-sm border border-accessory divide-y divide-accessory-default"
            >
              {options.length === 0 && (
                <div className="px-3 py-2 text-sm text-foreground-muted">
                  {t('items.addDialog.noResults')}
                </div>
              )}
              {options.map((opt, index) => {
                const id = `${listboxId}-opt-${index}`
                const active = index === activeIndex
                if (opt.kind === 'create') {
                  return (
                    // biome-ignore lint/a11y/useFocusableInteractive: virtual focus via aria-activedescendant on the combobox input
                    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the combobox input's onKeyDown
                    <div
                      key="__create__"
                      id={id}
                      role="option"
                      aria-selected={active}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer text-importance-primary-foreground',
                        active && 'bg-background-elevated',
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelectOption(opt)}
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {t('items.addDialog.createOption', {
                          name: opt.name,
                        })}
                      </span>
                    </div>
                  )
                }
                const stocked = !!opt.item.stockId
                return (
                  // biome-ignore lint/a11y/useFocusableInteractive: virtual focus via aria-activedescendant on the combobox input
                  // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the combobox input's onKeyDown
                  <div
                    key={opt.item.id}
                    id={id}
                    role="option"
                    aria-selected={active}
                    aria-disabled={stocked}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 text-sm capitalize',
                      stocked
                        ? 'text-foreground-muted cursor-not-allowed'
                        : 'cursor-pointer',
                      active && !stocked && 'bg-background-elevated',
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSelectOption(opt)}
                  >
                    <span className="truncate">{opt.item.name}</span>
                    {stocked && (
                      <span className="flex items-center gap-1 text-xs normal-case shrink-0">
                        <Check className="h-3 w-3" />
                        {t('items.addDialog.alreadyStocked')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {showCreate && (
            <div className="space-y-2">
              <Label htmlFor="new-item-package-unit">
                {t('items.addDialog.packageUnitLabel')}
              </Label>
              <Input
                id="new-item-package-unit"
                value={packageUnit}
                placeholder={t('items.addDialog.packageUnitPlaceholder')}
                onChange={(e) => setPackageUnit(e.target.value)}
              />
            </div>
          )}
        </DialogMain>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          {showCreate && (
            <Button
              onClick={handleCreate}
              disabled={!trimmed || submitting}
              isLoading={submitting}
            >
              {t('items.addDialog.createButton', { name: trimmed })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
