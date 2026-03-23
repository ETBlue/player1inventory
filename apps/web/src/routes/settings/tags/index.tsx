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
import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { ArrowLeft, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AddNameDialog } from '@/components/AddNameDialog'
import { ColorSelect } from '@/components/ColorSelect'
import { DeleteButton } from '@/components/DeleteButton'
import { Toolbar } from '@/components/Toolbar'
import { EditTagTypeDialog } from '@/components/tag/EditTagTypeDialog'
import { TagBadge } from '@/components/tag/TagBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { migrateTagColorsToTypes, migrateTagColorTints } from '@/db/operations'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import {
  useCreateTag,
  useCreateTagType,
  useDeleteTag,
  useDeleteTagType,
  useItemCountByTag,
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

const TAG_COLOR_BORDER: Record<TagColor, string> = {
  red: 'border-red',
  orange: 'border-orange',
  amber: 'border-amber',
  yellow: 'border-yellow',
  green: 'border-green',
  teal: 'border-teal',
  blue: 'border-blue',
  indigo: 'border-indigo',
  purple: 'border-purple',
  pink: 'border-pink',
  brown: 'border-brown',
  lime: 'border-lime',
  cyan: 'border-cyan',
  rose: 'border-rose',
}

const TAG_COLOR_TEXT: Record<TagColor, string> = {
  red: 'text-red',
  orange: 'text-orange',
  amber: 'text-amber',
  yellow: 'text-yellow',
  green: 'text-green',
  teal: 'text-teal',
  blue: 'text-blue',
  indigo: 'text-indigo',
  purple: 'text-purple',
  pink: 'text-pink',
  brown: 'text-brown',
  lime: 'text-lime',
  cyan: 'text-cyan',
  rose: 'text-rose',
}

function DraggableTagBadge({
  tag,
  tagType,
  onDelete,
}: {
  tag: Tag
  tagType: TagType
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)

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

  const navigate = useNavigate()

  // Note: The drag listeners wrap the entire Link to enable dragging.
  // The 8px activation distance (set in sensors) ensures that:
  // - Short pointer movements (< 8px) trigger click navigation
  // - Longer movements (≥ 8px) trigger drag-and-drop
  // This allows both click-to-navigate and drag-to-move behaviors to coexist.
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div className="inline-flex items-center">
        <TagBadge
          tag={tag}
          tagType={tagType}
          className="rounded-tr-none rounded-br-none"
          onClick={() => {
            navigate({
              to: '/settings/tags/$id',
              params: { id: tag.id },
            })
          }}
        />
        <DeleteButton
          trigger={<X />}
          buttonVariant="neutral-outline"
          buttonSize="icon-xs"
          buttonClassName={`h-5 rounded-full rounded-tl-none rounded-bl-none -ml-px ${TAG_COLOR_BORDER[tagType.color ?? TagColor.blue]} ${TAG_COLOR_TEXT[tagType.color ?? TagColor.blue]}`}
          dialogTitle={t('settings.tags.tag.deleteTitle')}
          dialogDescription={
            itemCount > 0
              ? t('settings.tags.tag.deleteWithItems', {
                  name: tag.name,
                  count: itemCount,
                })
              : t('settings.tags.tag.deleteNoItems', { name: tag.name })
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
  tagCount,
  onEdit,
  onDelete,
  onAddTag,
  onDeleteTag,
}: {
  tagType: TagType
  sortedTypeTags: Tag[]
  tagCount: number
  onEdit: () => void
  onDelete: () => void
  onAddTag: () => void
  onDeleteTag: (tagId: string) => void
}) {
  const { t } = useTranslation()
  const { setNodeRef } = useDroppable({
    id: tagType.id,
  })

  const tagTypeColor = tagType.color || TagColor.blue

  return (
    <Card key={tagType.id} className="relative">
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 bg-${tagTypeColor}`}
      />
      <CardHeader className="mb-1 -mt-1">
        <div className="flex items-center gap-1">
          <CardTitle className="capitalize flex items-center gap-2">
            <Tags className="h-4 w-4 text-foreground-muted" />
            <h3>{tagType.name}</h3>
          </CardTitle>
          <div className="flex-1" />
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:w-auto lg:px-3"
            onClick={onEdit}
          >
            <Pencil />
            <span className="hidden lg:inline ml-1">{t('common.edit')}</span>
          </Button>
          <DeleteButton
            trigger={<Trash2 />}
            buttonVariant="destructive-ghost"
            buttonSize="icon"
            buttonAriaLabel={`Delete ${tagType.name}`}
            dialogTitle={t('settings.tags.tagType.deleteTitle')}
            dialogDescription={
              tagCount > 0
                ? t('settings.tags.tagType.deleteWithTags', {
                    name: tagType.name,
                    count: tagCount,
                  })
                : t('settings.tags.tagType.deleteNoTags', {
                    name: tagType.name,
                  })
            }
            onDelete={onDelete}
          />
        </div>
      </CardHeader>
      <CardContent ref={setNodeRef}>
        <SortableContext
          items={sortedTypeTags.map((tag) => tag.id)}
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
              {t('settings.tags.tag.newButton')}
            </Button>
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  )
}

export function TagSettings() {
  const { t } = useTranslation()
  const { goBack } = useAppNavigation('/settings')
  const { data: tagTypes = [] } = useTagTypes()
  const { data: tags = [], isLoading } = useTags()

  // Scroll restoration: save on unmount, restore after data loads
  const currentUrl = useRouterState({
    select: (s) => s.location.pathname + (s.location.searchStr ?? ''),
  })
  const { restoreScroll } = useScrollRestoration(currentUrl)
  useEffect(() => {
    if (!isLoading) restoreScroll()
  }, [isLoading, restoreScroll])
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
  const [editTagTypeName, setEditTagTypeName] = useState('')
  const [editTagTypeColor, setEditTagTypeColor] = useState(TagColor.blue)

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
    migrateTagColorTints()
  }, [])

  const handleAddTagType = () => {
    if (newTagTypeName.trim()) {
      createTagType.mutate(
        {
          name: newTagTypeName.trim(),
          color: newTagTypeColor,
        },
        {
          onSuccess: () => {
            setNewTagTypeName('')
            setNewTagTypeColor(TagColor.blue)
          },
        },
      )
    }
  }

  const handleAddTag = () => {
    if (addTagDialog && newTagName.trim()) {
      createTag.mutate(
        {
          name: newTagName.trim(),
          typeId: addTagDialog,
        },
        {
          onSuccess: () => {
            setNewTagName('')
            setAddTagDialog(null)
          },
        },
      )
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

  const handleDeleteTag = async (tagId: string) => {
    deleteTag.mutate(tagId)
  }

  const handleDragStart = (event: DragEndEvent) => {
    const tagId = event.active.id as string
    const tag = tags.find((tag) => tag.id === tagId)
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
    const droppedOnTag = tags.find((tag) => tag.id === newTypeId)
    if (droppedOnTag) {
      newTypeId = droppedOnTag.typeId
    }

    const tag = tags.find((tag) => tag.id === tagId)

    if (!tag || tag.typeId === newTypeId) return

    const previousTypeId = tag.typeId
    const newType = tagTypes.find((type) => type.id === newTypeId)

    updateTag.mutate(
      { id: tagId, updates: { typeId: newTypeId } },
      {
        onError: () => {
          toast.error(t('settings.tags.toast.moveFailed'))
        },
      },
    )

    if (newType) {
      toast(
        t('settings.tags.toast.moveSuccess', {
          name: tag.name,
          newType: newType.name,
        }),
        {
          duration: 5000,
          action: {
            label: t('settings.tags.toast.undo'),
            onClick: () => {
              updateTag.mutate(
                {
                  id: tagId,
                  updates: { typeId: previousTypeId },
                },
                {
                  onError: () => {
                    toast.error(t('settings.tags.toast.undoFailed'))
                  },
                },
              )
            },
          },
        },
      )
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
        <Button
          variant="neutral-ghost"
          size="icon"
          className="lg:w-auto lg:px-3"
          onClick={goBack}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden lg:inline ml-1">{t('common.goBack')}</span>
        </Button>
        <h1 className="">{t('settings.tags.label')}</h1>
      </Toolbar>

      <form
        className="px-6 pt-3 pb-5 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          handleAddTagType()
        }}
      >
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <Label htmlFor="newTagTypeColor">
              {t('settings.tags.tagType.colorLabel')}
            </Label>
            <ColorSelect
              id="newTagTypeColor"
              value={newTagTypeColor}
              onChange={setNewTagTypeColor}
            />
          </div>
          <div>
            <Label htmlFor="newTagTypeName">
              {t('settings.tags.tagType.nameLabel')}
            </Label>
            <Input
              id="newTagTypeName"
              placeholder={t('settings.tags.tagType.namePlaceholder')}
              value={newTagTypeName}
              autoFocus
              onChange={(e) => setNewTagTypeName(e.target.value)}
              className="capitalize"
            />
          </div>
        </div>
        <div className="flex">
          <Button type="submit" className="flex-1">
            <Plus />
            {t('settings.tags.tagType.newButton')}
          </Button>
        </div>
      </form>
      <div className="space-y-px pb-4">
        {[...tagTypes]
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          )
          .map((tagType) => {
            const typeTags = tags.filter((tag) => tag.typeId === tagType.id)
            const sortedTypeTags = sortTagsByName(typeTags)
            const tagTypeColor = tagType.color || TagColor.blue

            return (
              <DroppableTagTypeCard
                key={tagType.id}
                tagType={tagType}
                sortedTypeTags={sortedTypeTags}
                tagCount={typeTags.length}
                onEdit={() => {
                  setEditTagType(tagType)
                  setEditTagTypeName(tagType.name)
                  setEditTagTypeColor(tagTypeColor)
                }}
                onDelete={() => deleteTagType.mutate(tagType.id)}
                onAddTag={() => setAddTagDialog(tagType.id)}
                onDeleteTag={handleDeleteTag}
              />
            )
          })}
      </div>

      {/* Add Tag Dialog */}
      <AddNameDialog
        open={!!addTagDialog}
        title={t('settings.tags.tag.addTitle')}
        submitLabel={t('settings.tags.tag.addSubmit')}
        name={newTagName}
        placeholder={t('settings.tags.tag.addPlaceholder')}
        onNameChange={setNewTagName}
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

      {/* Drag Overlay - shows preview of tag being dragged */}
      <DragOverlay>
        {activeTag &&
          (() => {
            const tag = tags.find((tag) => tag.id === activeTag.id)
            const tagType = tagTypes.find((tt) => tt.id === activeTag.typeId)
            return tag && tagType ? (
              <TagBadge tag={tag} tagType={tagType} />
            ) : null
          })()}
      </DragOverlay>
    </DndContext>
  )
}
