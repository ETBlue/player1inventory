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
import { GripVertical, Lock, MapPin, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { DEFAULT_LOCATION_ID, type Location } from '@/types'

interface LocationListProps {
  locations: Location[]
  onReorder: (orderedIds: string[]) => void
  onRename: (location: Location) => void
  onDelete: (location: Location) => void
}

// ----- Sortable / static location row -----

interface LocationRowProps {
  location: Location
  isDefault: boolean
  onRename: () => void
  onDelete: () => void
}

function LocationRow({
  location,
  isDefault,
  onRename,
  onDelete,
}: LocationRowProps) {
  const { t } = useTranslation()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: location.id, disabled: isDefault })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none' as const,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 py-1">
        {/* Drag handle — locked for the default location */}
        {isDefault ? (
          <Lock className="h-4 w-4 text-foreground-muted" />
        ) : (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-foreground-muted hover:text-foreground"
            aria-label={t('settings.locations.dragToReorder', {
              name: location.name,
            })}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <CardTitle className="flex items-center gap-2 truncate">
          <MapPin className="h-4 w-4 shrink-0 text-foreground-muted" />
          <span className="font-medium capitalize truncate">
            {location.name}
          </span>
          {isDefault && (
            <span className="text-xs font-normal text-foreground-muted">
              {t('settings.locations.defaultHint')}
            </span>
          )}
        </CardTitle>

        {/* Rename */}
        <Button
          type="button"
          variant="neutral-ghost"
          size="icon"
          aria-label={t('settings.locations.renameLabel', {
            name: location.name,
          })}
          onClick={onRename}
        >
          <Pencil className="h-4 w-4" />
        </Button>

        {/* Delete — hidden for the default location */}
        {isDefault ? (
          <span aria-hidden="true" className="w-9" />
        ) : (
          <DeleteButton
            trigger={<Trash2 className="h-4 w-4" />}
            buttonVariant="destructive-ghost"
            buttonSize="icon"
            buttonAriaLabel={t('settings.locations.deleteLabel', {
              name: location.name,
            })}
            dialogTitle={t('settings.locations.deleteTitle', {
              name: location.name,
            })}
            dialogDescription={t('settings.locations.deleteDescription')}
            onDelete={onDelete}
          />
        )}
      </Card>
    </div>
  )
}

// ----- List -----

export function LocationList({
  locations,
  onReorder,
  onRename,
  onDelete,
}: LocationListProps) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)

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

    const oldIndex = locations.findIndex((l) => l.id === active.id)
    const newIndex = locations.findIndex((l) => l.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(locations, oldIndex, newIndex)
    onReorder(reordered.map((l) => l.id))
  }

  const handleDragCancel = () => setActiveId(null)

  const activeLocation = activeId
    ? locations.find((l) => l.id === activeId)
    : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={locations.map((l) => l.id)}
        strategy={verticalListSortingStrategy}
      >
        <p className="sr-only" id="location-dnd-instructions">
          {t('settings.locations.dragInstructions')}
        </p>
        <div className="flex flex-col gap-px">
          {locations.map((location) => (
            <LocationRow
              key={location.id}
              location={location}
              isDefault={location.id === DEFAULT_LOCATION_ID}
              onRename={() => onRename(location)}
              onDelete={() => onDelete(location)}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeLocation && (
          <div className="flex items-center gap-2 px-3 py-2 bg-background-surface border border-border rounded-md shadow-lg opacity-90">
            <GripVertical className="h-4 w-4 text-foreground-muted" />
            <span className="text-sm font-medium capitalize">
              {activeLocation.name}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
