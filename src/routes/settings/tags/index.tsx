import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
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
import { ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AddTagDialog } from '@/components/AddTagDialog'
import { ColorSelect } from '@/components/ColorSelect'
import { DeleteButton } from '@/components/DeleteButton'
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
  useDeleteTag,
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

function DraggableTagBadge({
  tag,
  tagType,
  onDelete,
}: {
  tag: Tag
  tagType: TagType
  onDelete: () => void
}) {
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
    touchAction: 'none',
  }

  // Note: The drag listeners wrap the entire Link to enable dragging.
  // The 8px activation distance (set in sensors) ensures that:
  // - Short pointer movements (< 8px) trigger click navigation
  // - Longer movements (≥ 8px) trigger drag-and-drop
  // This allows both click-to-navigate and drag-to-move behaviors to coexist.
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div className="inline-flex items-center gap-1">
        <Link
          to="/settings/tags/$id"
          params={{ id: tag.id }}
          className="inline-block"
        >
          <TagBadge tag={tag} tagType={tagType} />
        </Link>
        <DeleteButton
          trigger={<X className="h-3 w-3" />}
          buttonVariant="ghost"
          buttonSize="icon"
          buttonClassName="h-4 w-4 p-0 hover:bg-destructive/20"
          dialogTitle="Delete Tag?"
          dialogDescription={
            <>
              {tag.name}
              <span className="block mt-2 text-sm text-muted-foreground">
                This tag will be removed from all assigned items.
              </span>
            </>
          }
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

function DroppableTagTypeCard({
  tagType,
  sortedTypeTags,
  onEdit,
  onDelete,
  onAddTag,
  onDeleteTag,
}: {
  tagType: TagType
  sortedTypeTags: Tag[]
  onEdit: () => void
  onDelete: () => void
  onAddTag: () => void
  onDeleteTag: (tagId: string) => void
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
      <CardHeader className="pb-1 -mt-1 pl-3">
        <div className="flex items-center gap-1">
          <CardTitle className="text-lg capitalize">{tagType.name}</CardTitle>
          <div className="flex-1" />
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
      </CardHeader>
      <CardContent ref={setNodeRef} className="pl-3">
        <SortableContext
          items={sortedTypeTags.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-wrap gap-1">
            {sortedTypeTags.map((tag) => (
              <DraggableTagBadge
                key={tag.id}
                tag={tag}
                tagType={tagType}
                onDelete={() => onDeleteTag(tag.id)}
              />
            ))}
            <Button variant="neutral-ghost" size="xs" onClick={onAddTag}>
              <Plus className="h-3 w-3" />
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
  const deleteTag = useDeleteTag()

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
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

  const handleDeleteTag = async (tagId: string) => {
    deleteTag.mutate(tagId)
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
    let newTypeId = over.id as string

    // If dropped on another tag (not a type card), get that tag's typeId
    const droppedOnTag = tags.find((t) => t.id === newTypeId)
    if (droppedOnTag) {
      newTypeId = droppedOnTag.typeId
    }

    const tag = tags.find((t) => t.id === tagId)

    if (!tag || tag.typeId === newTypeId) return

    const previousTypeId = tag.typeId
    const newType = tagTypes.find((t) => t.id === newTypeId)

    updateTag.mutate(
      { id: tagId, updates: { typeId: newTypeId } },
      {
        onError: () => {
          toast.error('Failed to move tag')
        },
      },
    )

    if (newType) {
      toast(`Moved ${tag.name} to ${newType.name}`, {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            updateTag.mutate(
              {
                id: tagId,
                updates: { typeId: previousTypeId },
              },
              {
                onError: () => {
                  toast.error('Failed to undo')
                },
              },
            )
          },
        },
      })
    }
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
      <Toolbar>
        <Button variant="neutral-ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="">Tags</h1>
      </Toolbar>

      <div className="px-6 pt-3 pb-5 space-y-2">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <Label htmlFor="newTagTypeColor">Color</Label>
            <ColorSelect
              id="newTagTypeColor"
              value={newTagTypeColor}
              onChange={setNewTagTypeColor}
            />
          </div>
          <div>
            <Label htmlFor="newTagTypeName">Name</Label>
            <Input
              id="newTagTypeName"
              placeholder="e.g., Ingredient type, Storage method"
              value={newTagTypeName}
              onChange={(e) => setNewTagTypeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTagType()}
            />
          </div>
        </div>
        <div className="flex">
          <Button onClick={handleAddTagType} className="flex-1">
            <Plus className="h-4 w-4" />
            New Tag Type
          </Button>
        </div>
      </div>
      <div className="space-y-px pb-4">
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
                onDeleteTag={handleDeleteTag}
              />
            )
          })}
      </div>

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
    </DndContext>
  )
}
