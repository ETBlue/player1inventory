import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  GripVertical,
  Lock,
  Plus,
  SlidersVertical,
  SquareMousePointer,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Toolbar } from '@/components/shared/Toolbar'
import {
  AddShelfDialog,
  type CreateShelfInput,
} from '@/components/shelf/AddShelfDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useItems } from '@/hooks'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useRecipes } from '@/hooks/useRecipes'
import {
  useCreateShelfMutation,
  useDeleteShelfMutation,
  useReorderShelvesMutation,
  useShelvesQuery,
} from '@/hooks/useShelves'
import { useTags } from '@/hooks/useTags'
import { matchesFilterConfig } from '@/lib/shelfUtils'
import type { Shelf } from '@/types'

export const Route = createFileRoute('/settings/shelves/')({
  component: ShelfSettingsPage,
})

// ----- Sortable shelf row -----

interface SortableShelfRowProps {
  shelf: Shelf
  itemCount: number
  onDelete: () => void
  onNavigateToEdit: () => void
}

function SortableShelfRow({
  shelf,
  itemCount,
  onDelete,
  onNavigateToEdit,
}: SortableShelfRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shelf.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none' as const,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="py-1">
        <CardContent className="flex items-center gap-2">
          {/* Left side: drag handle + icon + name + count */}
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-foreground-muted hover:text-foreground shrink-0"
            aria-label={`Drag to reorder ${shelf.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Link
            to="/settings/shelves/$shelfId"
            params={{ shelfId: shelf.id }}
            className="font-medium capitalize hover:underline truncate"
          >
            {shelf.name}
          </Link>
          <span className="text-sm text-foreground-muted shrink-0">
            · {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          <div className="flex-1" />

          {shelf.type !== 'system' && (
            <Badge
              variant="neutral-outline"
              className="text-xs capitalize shrink-0 gap-1"
            >
              {shelf.type === 'filter' && (
                <SlidersVertical className="h-3 w-3 text-foreground-muted" />
              )}
              {shelf.type === 'selection' && (
                <SquareMousePointer className="h-3 w-3 text-foreground-muted" />
              )}
              {shelf.type}
            </Badge>
          )}
          {/* Right side: delete */}
          <DeleteButton
            trigger={<Trash2 className="h-4 w-4" />}
            buttonVariant="destructive-ghost"
            buttonSize="icon"
            buttonAriaLabel={`Delete ${shelf.name}`}
            dialogTitle={`Delete "${shelf.name}"?`}
            dialogDescription="Items will move to Unsorted."
            onDelete={onDelete}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ----- Main page -----

export function ShelfSettingsPage() {
  const { goBack } = useAppNavigation('/settings')
  const { data: shelves = [] } = useShelvesQuery()
  const { data: items = [] } = useItems()
  const { data: recipes = [] } = useRecipes()
  const { data: tags = [] } = useTags()
  const createShelf = useCreateShelfMutation()
  const deleteShelf = useDeleteShelfMutation()
  const reorderShelves = useReorderShelvesMutation()
  const navigate = useNavigate()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Split into user shelves (sortable) and virtual unsorted
  const userShelves = shelves.filter((s) => s.type !== undefined)
  const hasUnsorted = true // always show the virtual Unsorted row

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragStart = (event: DragEndEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const oldIndex = userShelves.findIndex((s) => s.id === active.id)
    const newIndex = userShelves.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(userShelves, oldIndex, newIndex)
    reorderShelves.mutate(reordered.map((s) => s.id))
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  const handleAddShelf = (data: CreateShelfInput) => {
    createShelf.mutate({
      name: data.name,
      type: data.type,
      order: shelves.length,
      ...(data.filterConfig ? { filterConfig: data.filterConfig } : {}),
    })
  }

  const getItemCount = (shelf: Shelf): number => {
    if (shelf.type === 'selection') {
      return shelf.itemIds?.length ?? 0
    }

    // Filter shelf: count items matching filterConfig
    const { filterConfig } = shelf
    if (!filterConfig) return items.length

    return items.filter((item) =>
      matchesFilterConfig(item, filterConfig, recipes, tags),
    ).length
  }

  const getUnsortedCount = (): number => {
    if (!items || !shelves) return 0

    // Items in any selection shelf's itemIds
    const selectionItemIds = new Set<string>()
    for (const shelf of shelves) {
      if (shelf.type === 'selection' && shelf.itemIds) {
        for (const id of shelf.itemIds) selectionItemIds.add(id)
      }
    }

    // Items matched by any filter shelf
    const filterMatchedIds = new Set<string>()
    for (const shelf of shelves) {
      if (shelf.type === 'filter' && shelf.filterConfig) {
        for (const item of items) {
          if (matchesFilterConfig(item, shelf.filterConfig, recipes, tags)) {
            filterMatchedIds.add(item.id)
          }
        }
      }
    }

    return items.filter(
      (item) =>
        !selectionItemIds.has(item.id) && !filterMatchedIds.has(item.id),
    ).length
  }

  const activeShelf = activeId
    ? userShelves.find((s) => s.id === activeId)
    : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
        <Toolbar className="justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="neutral-ghost"
              size="icon"
              className="lg:w-auto lg:mr-3"
              onClick={goBack}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden lg:inline">Go back</span>
            </Button>
            <h1>Shelves</h1>
          </div>
          <Button
            size="icon"
            className="lg:w-auto lg:px-3"
            aria-label="Add shelf"
            onClick={() => setDialogOpen(true)}
          >
            <Plus />
            <span className="hidden lg:inline">Add</span>
          </Button>
        </Toolbar>

        <div className="overflow-y-auto [container-type:size] space-y-px pb-4">
          {userShelves.length === 0 && !hasUnsorted ? (
            <EmptyState
              title="No shelves yet"
              description="Add a shelf using the button above."
            />
          ) : (
            <SortableContext
              items={userShelves.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <p className="sr-only" id="shelf-dnd-instructions">
                Press Space or Enter to pick up a shelf, use arrow keys to move
                it, and press Space or Enter again to drop it.
              </p>
              {userShelves.map((shelf) => (
                <SortableShelfRow
                  key={shelf.id}
                  shelf={shelf}
                  itemCount={getItemCount(shelf)}
                  onNavigateToEdit={() =>
                    navigate({
                      to: '/settings/shelves/$shelfId',
                      params: { shelfId: shelf.id },
                    })
                  }
                  onDelete={() => deleteShelf.mutate(shelf.id)}
                />
              ))}
            </SortableContext>
          )}

          {/* Virtual Unsorted row — always last, non-draggable, non-deletable */}
          {hasUnsorted && (
            <Card className="py-0">
              <CardContent className="h-10 flex items-center gap-2">
                <Lock className="h-4 w-4 text-foreground-muted" />
                <span className="font-medium capitalize truncate">
                  Unsorted
                </span>
                <span className="text-sm text-foreground-muted shrink-0">
                  {getUnsortedCount()}{' '}
                  {getUnsortedCount() === 1 ? 'item' : 'items'}
                </span>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeShelf && (
          <div className="flex items-center gap-2 px-3 py-2 bg-background-surface border border-border rounded-md shadow-lg opacity-90">
            <GripVertical className="h-4 w-4 text-foreground-muted" />
            <span className="text-sm font-medium capitalize">
              {activeShelf.name}
            </span>
          </div>
        )}
      </DragOverlay>

      <AddShelfDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleAddShelf}
      />
    </DndContext>
  )
}
