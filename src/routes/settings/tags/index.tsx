import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AddTagDialog } from '@/components/AddTagDialog'
import { ColorSelect } from '@/components/ColorSelect'
import { EditTagTypeDialog } from '@/components/EditTagTypeDialog'
import { TagBadge } from '@/components/TagBadge'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { migrateTagColorsToTypes } from '@/db/operations'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import {
  useCreateTag,
  useCreateTagType,
  useDeleteTagType,
  useTagCountByType,
  useTags,
  useTagTypes,
  useUpdateTag,
  useUpdateTagType,
} from '@/hooks/useTags'
import { sortTagsByName } from '@/lib/tagSortUtils'
import { type Tag, TagColor, type TagType } from '@/types/index'

export const Route = createFileRoute('/settings/tags/')({
  component: TagSettings,
})

function DraggableTagBadge({ tag, tagType }: { tag: Tag; tagType: TagType }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tag.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Note: The drag listeners wrap the entire Link to enable dragging.
  // The 8px activation distance (set in sensors) ensures that:
  // - Short pointer movements (< 8px) trigger click navigation
  // - Longer movements (≥ 8px) trigger drag-and-drop
  // This allows both click-to-navigate and drag-to-move behaviors to coexist.
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Link
        to="/settings/tags/$id"
        params={{ id: tag.id }}
        className="inline-block"
      >
        <TagBadge tag={tag} tagType={tagType} />
      </Link>
    </div>
  )
}

function DroppableTagTypeCard({
  tagType,
  sortedTypeTags,
  onEdit,
  onDelete,
  onAddTag,
}: {
  tagType: TagType
  sortedTypeTags: Tag[]
  onEdit: () => void
  onDelete: () => void
  onAddTag: () => void
}) {
  const { setNodeRef } = useDroppable({
    id: tagType.id,
  })

  const tagTypeColor = tagType.color || TagColor.blue

  return (
    <Card key={tagType.id} className="relative">
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 bg-${tagTypeColor}`}
      />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg capitalize">{tagType.name}</CardTitle>
          </div>
          <div className="flex gap-1">
            <Button
              variant="neutral-ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="neutral-ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent ref={setNodeRef}>
        <SortableContext
          items={sortedTypeTags.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-wrap gap-2">
            {sortedTypeTags.map((tag) => (
              <DraggableTagBadge key={tag.id} tag={tag} tagType={tagType} />
            ))}
            <Button
              variant="neutral-ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onAddTag}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  )
}

function TagSettings() {
  const { goBack } = useAppNavigation('/settings')
  const { data: tagTypes = [] } = useTagTypes()
  const { data: tags = [] } = useTags()
  const createTagType = useCreateTagType()
  const updateTagType = useUpdateTagType()
  const deleteTagType = useDeleteTagType()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()

  const [newTagTypeName, setNewTagTypeName] = useState('')
  const [newTagTypeColor, setNewTagTypeColor] = useState(TagColor.blue)
  const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [editTagType, setEditTagType] = useState<TagType | null>(null)
  const [tagTypeToDelete, setTagTypeToDelete] = useState<TagType | null>(null)
  const [editTagTypeName, setEditTagTypeName] = useState('')
  const [editTagTypeColor, setEditTagTypeColor] = useState(TagColor.blue)

  const tagTypeDeleteId = tagTypeToDelete?.id ?? ''
  const { data: tagTypeTagCount = 0 } = useTagCountByType(tagTypeDeleteId)

  // Drag and drop state
  const [activeTag, setActiveTag] = useState<{
    id: string
    typeId: string
  } | null>(null)
  const [undoState, setUndoState] = useState<{
    tagId: string
    previousTypeId: string
    newTypeId: string
  } | null>(null)
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  )

  // Run migration on mount
  useEffect(() => {
    migrateTagColorsToTypes()
  }, [])

  const handleAddTagType = () => {
    if (newTagTypeName.trim()) {
      createTagType.mutate({
        name: newTagTypeName.trim(),
        color: newTagTypeColor,
      })
      setNewTagTypeName('')
      setNewTagTypeColor(TagColor.blue)
    }
  }

  const handleAddTag = () => {
    if (addTagDialog && newTagName.trim()) {
      createTag.mutate({
        name: newTagName.trim(),
        typeId: addTagDialog,
      })
      setNewTagName('')
      setAddTagDialog(null)
    }
  }

  const handleEditTagType = () => {
    if (editTagType && editTagTypeName.trim()) {
      updateTagType.mutate({
        id: editTagType.id,
        updates: { name: editTagTypeName.trim(), color: editTagTypeColor },
      })
      setEditTagType(null)
    }
  }

  const handleDeleteTagType = () => {
    if (tagTypeToDelete) {
      deleteTagType.mutate(tagTypeToDelete.id)
      setTagTypeToDelete(null)
    }
  }

  const handleDragStart = (event: DragEndEvent) => {
    const tagId = event.active.id as string
    const tag = tags.find((t) => t.id === tagId)
    if (tag) {
      setActiveTag({ id: tag.id, typeId: tag.typeId })
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTag(null)

    if (!over || active.id === over.id) return

    const tagId = active.id as string
    const newTypeId = over.id as string
    const tag = tags.find((t) => t.id === tagId)

    if (!tag || tag.typeId === newTypeId) return

    const previousTypeId = tag.typeId
    const newType = tagTypes.find((t) => t.id === newTypeId)

    setUndoState({
      tagId,
      previousTypeId,
      newTypeId,
    })

    updateTag.mutate(
      { id: tagId, updates: { typeId: newTypeId } },
      {
        onError: () => {
          toast.error('Failed to move tag')
          setUndoState(null)
        },
      },
    )

    if (newType) {
      toast(`Moved ${tag.name} to ${newType.name}`, {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: handleUndo,
        },
      })
    }

    // Clear previous timeout
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current)
    }

    // Set new timeout
    undoTimeoutRef.current = setTimeout(() => {
      setUndoState(null)
      undoTimeoutRef.current = null
    }, 5000)
  }

  const handleUndo = () => {
    if (!undoState) return
    updateTag.mutate(
      {
        id: undoState.tagId,
        updates: { typeId: undoState.previousTypeId },
      },
      {
        onError: () => {
          toast.error('Failed to move tag')
          setUndoState(null)
        },
      },
    )
    setUndoState(null)
  }

  const handleDragCancel = () => {
    setActiveTag(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-4">
        <Toolbar>
          <Button variant="neutral-ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="">Tags</h1>
        </Toolbar>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add Tag Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Ingredient type, Storage method"
                  value={newTagTypeName}
                  onChange={(e) => setNewTagTypeName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTagType()}
                />
                <Button onClick={handleAddTagType}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newTagTypeColor">Color</Label>
                <ColorSelect
                  id="newTagTypeColor"
                  value={newTagTypeColor}
                  onChange={setNewTagTypeColor}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {[...tagTypes]
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          )
          .map((tagType) => {
            const typeTags = tags.filter((t) => t.typeId === tagType.id)
            const sortedTypeTags = sortTagsByName(typeTags)
            const tagTypeColor = tagType.color || TagColor.blue

            return (
              <DroppableTagTypeCard
                key={tagType.id}
                tagType={tagType}
                sortedTypeTags={sortedTypeTags}
                onEdit={() => {
                  setEditTagType(tagType)
                  setEditTagTypeName(tagType.name)
                  setEditTagTypeColor(tagTypeColor)
                }}
                onDelete={() => setTagTypeToDelete(tagType)}
                onAddTag={() => setAddTagDialog(tagType.id)}
              />
            )
          })}

        {/* Add Tag Dialog */}
        <AddTagDialog
          open={!!addTagDialog}
          tagName={newTagName}
          onTagNameChange={setNewTagName}
          onAdd={handleAddTag}
          onClose={() => setAddTagDialog(null)}
        />

        {/* Edit TagType Dialog */}
        <EditTagTypeDialog
          tagType={editTagType}
          name={editTagTypeName}
          color={editTagTypeColor}
          onNameChange={setEditTagTypeName}
          onColorChange={setEditTagTypeColor}
          onSave={handleEditTagType}
          onClose={() => setEditTagType(null)}
        />

        {/* Confirm Delete TagType Dialog */}
        <ConfirmDialog
          open={!!tagTypeToDelete}
          onOpenChange={(open) => !open && setTagTypeToDelete(null)}
          title={`Delete "${tagTypeToDelete?.name}"?`}
          description={`This will delete "${tagTypeToDelete?.name}" and its ${tagTypeTagCount} tag${tagTypeTagCount === 1 ? '' : 's'}, removing them from all assigned items.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteTagType}
          destructive
        />

        {/* Drag Overlay - shows preview of tag being dragged */}
        <DragOverlay>
          {activeTag &&
            (() => {
              const tag = tags.find((t) => t.id === activeTag.id)
              const tagType = tagTypes.find((tt) => tt.id === activeTag.typeId)
              return tag && tagType ? (
                <TagBadge tag={tag} tagType={tagType} />
              ) : null
            })()}
        </DragOverlay>
      </div>
    </DndContext>
  )
}
