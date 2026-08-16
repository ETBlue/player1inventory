import { useNavigate } from '@tanstack/react-router'
import { Check, Plus } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
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
import { useActiveLocation } from '@/hooks/useActiveLocation'
import { useDataMode } from '@/hooks/useDataMode'
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
  const { mode } = useDataMode()
  // Cloud has no per-location ItemStock backend yet (deferred in PR D): cloud
  // items never carry a `stockId`, so the add-existing path (Dexie-only) would
  // silently write an orphan local ItemStock and report false success. In
  // cloud mode the dialog is create-only — every catalog item renders as
  // already-here/disabled (PR D review 2.1).
  const isLocal = mode === 'local'
  const { activeLocation } = useActiveLocation()
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

  const exactMatchItem = useMemo(
    () => allItems.find((i) => i.name.toLowerCase() === lower),
    [allItems, lower],
  )
  const hasExactMatch = !!exactMatchItem

  // The "Create" option is offered only when there's a query with no exact name
  // collision in the catalog.
  const showCreate = trimmed.length > 0 && !hasExactMatch

  // When the query exactly matches an item already stocked in the active
  // location, the sole matching option renders disabled and no Create
  // option is offered — Enter is a dead key with no visible explanation.
  // The plan's original remedy ("skip non-selectable options") provably
  // can't fix this case: there is no other option to skip to. Per explicit
  // user ruling (2026-08-16, PR D review 3.3 / Important 3), show inline
  // feedback naming the item and location instead of inventing another fix.
  const alreadyStockedExactMatch =
    isLocal && trimmed.length > 0 && exactMatchItem?.stockId
      ? exactMatchItem
      : undefined

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
  // In cloud mode add-existing is unsupported (see isLocal comment above), so
  // no catalog item is ever selectable there — only Create.
  const isSelectable = useCallback(
    (opt: Option) => opt.kind === 'create' || (isLocal && !opt.item.stockId),
    [isLocal],
  )

  // Keep the highlighted index on a selectable option whenever the option set
  // changes. Without this, a disabled (already-stocked) option sorted first —
  // or left over from a previous, now-stale query — could sit at index 0 with
  // no selectable option ever highlighted, making Enter (and the missing
  // Create button) a dead key even when a Create option is available further
  // down the list (PR D review 3.3).
  useEffect(() => {
    setActiveIndex((prev) => {
      if (options.length === 0) return 0
      const prevOpt = options[prev]
      if (prevOpt && isSelectable(prevOpt)) return prev
      const firstSelectable = options.findIndex((opt) => isSelectable(opt))
      return firstSelectable === -1
        ? Math.min(prev, options.length - 1)
        : firstSelectable
    })
  }, [options, isSelectable])

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
    // Cloud mode has no ItemStock backend yet — this path is local-only.
    if (!isLocal) return
    if (submitting) return
    setSubmitting(true)
    try {
      // The resolved ItemStock carries the real, freshly copied stock fields.
      // Merge those in rather than spreading the stale pre-add `item` (whose
      // stock fields reflect the zeroed pre-add join when it wasn't
      // previously stocked at the active location) — otherwise callers like
      // the recipe items dialog read defaults (e.g. consumeAmount: 1) instead
      // of the item's real copied values (PR D review 3.5).
      const stock = await addItemToLocation.mutateAsync(item.id)
      handleClose()
      if (onSuccess) {
        const {
          id,
          itemId: _itemId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          locationId,
          ...stockFields
        } = stock
        onSuccess({
          ...item,
          ...stockFields,
          stockId: id,
          locationId,
        })
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

  // Steps the highlight in `direction`, skipping non-selectable (disabled)
  // options so the keyboard highlight never gets stuck on one — see the
  // options-change effect above for the same guarantee on initial highlight.
  const findNextSelectable = (from: number, direction: 1 | -1): number => {
    let idx = from
    for (let i = 0; i < options.length; i++) {
      idx = (idx + direction + options.length) % options.length
      const opt = options[idx]
      if (opt && isSelectable(opt)) return idx
    }
    return from
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (options.length === 0) return
      setActiveIndex((prev) => findNextSelectable(prev, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (options.length === 0) return
      setActiveIndex((prev) => findNextSelectable(prev, -1))
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
                      onMouseEnter={() => {
                        if (isSelectable(opt)) setActiveIndex(index)
                      }}
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
                // In cloud mode every catalog item renders as already-here
                // (disabled) — add-existing is unsupported there (see isLocal).
                const stocked = isLocal ? !!opt.item.stockId : true
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
                    onMouseEnter={() => {
                      if (isSelectable(opt)) setActiveIndex(index)
                    }}
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
            {alreadyStockedExactMatch && (
              <p className="text-sm text-foreground-muted">
                {t('items.addDialog.alreadyStockedHere', {
                  name: alreadyStockedExactMatch.name,
                  location: activeLocation?.name ?? '',
                })}
              </p>
            )}
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
