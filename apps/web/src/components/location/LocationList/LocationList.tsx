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
import type { LocationRole } from '@/generated/graphql'
import type { Location } from '@/types'

/**
 * A row. `myRole` and `hasOrganizer` are read only when `showRoles` is on
 * (cloud, households H5 task F.3). `myRole: null` means the caller has no role
 * there: the row says "No access".
 */
export type LocationListItem = Location & {
  myRole?: LocationRole | null
  hasOrganizer?: boolean
}

interface LocationListProps {
  locations: LocationListItem[]
  onReorder: (orderedIds: string[]) => void
  onRename: (location: LocationListItem) => void
  onDelete: (location: LocationListItem) => void
  /**
   * Drag handles and Delete. Off for a household `member`: the server asks
   * `manager` to delete or reorder a location. Default `true` (local mode).
   */
  canManage?: boolean
  /**
   * Whether the Rename button shows on a row. The server asks the LOCATION
   * role `organizer` to rename. Default: every row.
   */
  canRename?: (location: LocationListItem) => boolean
  /** Show the caller's role and the "No organizer" mark. Cloud only. */
  showRoles?: boolean
}

// ----- Sortable / static location row -----

interface LocationRowProps {
  location: LocationListItem
  isDefault: boolean
  canManage: boolean
  canRename: boolean
  showRoles: boolean
  onRename: () => void
  onDelete: () => void
}

function LocationRow({
  location,
  isDefault,
  canManage,
  canRename,
  showRoles,
  onRename,
  onDelete,
}: LocationRowProps) {
  const { t } = useTranslation()
  const canDrag = canManage && !isDefault
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: location.id, disabled: !canDrag })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none' as const,
  }

  return (
    <li ref={setNodeRef} style={style}>
      <Card className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 py-1">
        {/* Drag handle — locked for the default location, absent without
            the household role to reorder */}
        {isDefault ? (
          <Lock className="h-4 w-4 text-foreground-muted" />
        ) : !canManage ? (
          <span aria-hidden="true" className="w-4" />
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
          <span className="font-medium truncate">{location.name}</span>
          {isDefault && (
            <span className="text-xs font-normal text-foreground-muted">
              {t('settings.locations.defaultHint')}
            </span>
          )}
          {showRoles && (
            <span className="text-xs font-normal text-foreground-muted">
              {/* Read as "Kitchen, Your role: Viewer", not "Kitchen Viewer". */}
              <span className="sr-only">
                {t('settings.locations.yourRole')}{' '}
              </span>
              {location.myRole
                ? t(`roles.location.${location.myRole}`)
                : t('settings.locations.noAccess')}
            </span>
          )}
          {showRoles && location.hasOrganizer === false && (
            <span className="text-xs font-normal text-importance-destructive-foreground">
              {t('settings.locations.noOrganizer')}
            </span>
          )}
        </CardTitle>

        {/* Rename — only for an organizer of this location */}
        {canRename ? (
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
        ) : (
          <span aria-hidden="true" className="w-9" />
        )}

        {/* Delete — hidden for the default location, and without the
            household role to delete */}
        {isDefault || !canManage ? (
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
    </li>
  )
}

// ----- List -----

export function LocationList({
  locations,
  onReorder,
  onRename,
  onDelete,
  canManage = true,
  canRename = () => true,
  showRoles = false,
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
        {/* No `role="list"`. Safari with VoiceOver may drop the list role
            from a <ul> with `list-style: none`, but Biome refuses the
            attribute here (`noRedundantRoles`), and lint-staged's
            `--unsafe` fix would delete it at commit time. */}
        <ul className="flex flex-col gap-px">
          {locations.map((location) => (
            <LocationRow
              key={location.id}
              location={location}
              // Only a LOCAL row can be the default. Cloud rows carry no
              // `isDefault` (task 3.12): every cloud row can be dragged and
              // deleted, the last one too (since households H5 task F.7).
              isDefault={location.isDefault === true}
              canManage={canManage}
              canRename={canRename(location)}
              showRoles={showRoles}
              onRename={() => onRename(location)}
              onDelete={() => onDelete(location)}
            />
          ))}
        </ul>
      </SortableContext>

      <DragOverlay>
        {activeLocation && (
          <div className="flex items-center gap-2 px-3 py-2 bg-background-surface border border-border rounded-md shadow-lg opacity-90">
            <GripVertical className="h-4 w-4 text-foreground-muted" />
            <span className="text-sm font-medium">{activeLocation.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
