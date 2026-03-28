import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
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
import { DeleteButton } from '@/components/DeleteButton'
import { Toolbar } from '@/components/Toolbar'
import { EditTagTypeDialog } from '@/components/tag/EditTagTypeDialog'
import { TagBadge } from '@/components/tag/TagBadge'
import { TagInfoForm } from '@/components/tag/TagInfoForm'
import { TagTypeInfoForm } from '@/components/tag/TagTypeInfoForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  useTagsWithDepth,
  useTagTypes,
  useUpdateTag,
  useUpdateTagType,
} from '@/hooks/useTags'
import { sortTagsByName } from '@/lib/tagSortUtils'
import { type Tag, TagColor, type TagType } from '@/types/index'

type TagWithDepth = Tag & { depth: number }

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
  depth,
  onDelete,
}: {
  tag: Tag
  tagType: TagType
  depth: number
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)

  // TODO: Limit drag-and-drop to same-parent groups in a future iteration.
  // For now, drag-and-drop is disabled for child tags (depth >= 1) to avoid
  // ambiguous re-parenting behavior when dragging across type cards.
  const isDragDisabled = depth >= 1

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tag.id,
    disabled: isDragDisabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none',
  }

  const navigate = useNavigate()

  // Static lookup for indentation classes by depth level.
  // Avoids dynamic Tailwind class name construction (e.g. `pl-${n}`)
  // which won't survive production builds since Tailwind scans for literal class names.
  // Supports up to 3 levels of nesting (depth 0–3).
  const DEPTH_INDENT: Record<number, string> = {
    0: '',
    1: 'pl-4',
    2: 'pl-8',
    3: 'pl-12',
  }
  const indentClass = DEPTH_INDENT[Math.min(depth, 3)] ?? ''

  // Note: Drag listeners and attributes are scoped to the TagBadge wrapper only,
  // so that the DeleteButton is a sibling (not nested inside an interactive element).
  // This avoids the nested-interactive a11y violation while preserving drag behavior.
  // The outer div is a plain layout container (setNodeRef + style) with no ARIA role.
  // The 8px activation distance (set in sensors) ensures that:
  // - Short pointer movements (< 8px) trigger click navigation
  // - Longer movements (≥ 8px) trigger drag-and-drop
  // This allows both click-to-navigate and drag-to-move behaviors to coexist.
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center ${indentClass}`}
    >
      <div
        className="inline-flex"
        {...(isDragDisabled ? {} : attributes)}
        aria-describedby={isDragDisabled ? undefined : 'dnd-instructions'}
        {...(isDragDisabled ? {} : listeners)}
      >
        <TagBadge
          tag={tag}
          tagType={tagType}
          className={`rounded-tr-none rounded-br-none ${depth >= 1 ? 'opacity-80' : ''}`}
          onClick={() => {
            navigate({
              to: '/settings/tags/$id',
              params: { id: tag.id },
            })
          }}
        />
      </div>
      <DeleteButton
        trigger={<X />}
        buttonVariant="neutral-outline"
        buttonSize="icon-xs"
        buttonAriaLabel={t('settings.tags.tag.deleteAriaLabel', {
          name: tag.name,
        })}
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
  sortedTypeTags: TagWithDepth[]
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
            <h2>{tagType.name}</h2>
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
        <p className="sr-only" id="dnd-instructions">
          Press Space or Enter to pick up a tag, use arrow keys to move it, and
          press Space or Enter again to drop it.
        </p>
        <SortableContext
          items={sortedTypeTags.map((tag) => tag.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-1">
            {sortedTypeTags.map((tag) => (
              <DraggableTagBadge
                key={tag.id}
                tag={tag}
                tagType={tagType}
                depth={tag.depth}
                onDelete={() => onDeleteTag(tag.id)}
              />
            ))}
            <Button
              variant="neutral-ghost"
              size="xs"
              onClick={onAddTag}
              className="self-start"
            >
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
  const { data: tagsWithDepth = [] } = useTagsWithDepth()

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

  const [newTagTypeDialog, setNewTagTypeDialog] = useState(false)
  const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
  const [editTagType, setEditTagType] = useState<TagType | null>(null)

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
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Run migration on mount
  useEffect(() => {
    migrateTagColorsToTypes()
    migrateTagColorTints()
  }, [])

  const handleDeleteTag = async (tagId: string) => {
    deleteTag.mutate({ id: tagId })
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
        <div className="flex-1" />
        <Button onClick={() => setNewTagTypeDialog(true)} size="sm">
          {t('settings.tags.newTagType')}
        </Button>
      </Toolbar>
      <div className="space-y-px pb-4">
        {[...tagTypes]
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          )
          .map((tagType) => {
            const typeTags = tags.filter((tag) => tag.typeId === tagType.id)
            // Use depth-annotated tags for rendering, preserving depth-first order
            // (parent before children). Top-level tags are sorted by name; child tags
            // follow their parent in depth-first traversal.
            const typeTagsWithDepth = tagsWithDepth.filter(
              (tag) => tag.typeId === tagType.id,
            )
            const sortedTypeTags =
              typeTagsWithDepth.length > 0
                ? typeTagsWithDepth
                : sortTagsByName(typeTags).map((tag) => ({ ...tag, depth: 0 }))
            return (
              <DroppableTagTypeCard
                key={tagType.id}
                tagType={tagType}
                sortedTypeTags={sortedTypeTags}
                tagCount={typeTags.length}
                onEdit={() => {
                  setEditTagType(tagType)
                }}
                onDelete={() => deleteTagType.mutate(tagType.id)}
                onAddTag={() => setAddTagDialog(tagType.id)}
                onDeleteTag={handleDeleteTag}
              />
            )
          })}
      </div>

      {/* New Tag Type Dialog */}
      <Dialog open={newTagTypeDialog} onOpenChange={setNewTagTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.tags.newTagType')}</DialogTitle>
          </DialogHeader>
          <TagTypeInfoForm
            onSave={(data) => {
              createTagType.mutate(data, {
                onSuccess: () => setNewTagTypeDialog(false),
              })
            }}
            isPending={createTagType.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Add Tag Dialog — uses TagInfoForm with typeReadonly so type is pre-set */}
      <Dialog
        open={!!addTagDialog}
        onOpenChange={(open) => {
          if (!open) setAddTagDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.tags.tag.addTitle')}</DialogTitle>
          </DialogHeader>
          {addTagDialog && (
            <TagInfoForm
              key={addTagDialog}
              tag={{ id: '', name: '', typeId: addTagDialog }}
              tagTypes={tagTypes}
              parentOptions={tagsWithDepth.filter(
                (t) => t.typeId === addTagDialog,
              )}
              typeReadonly={true}
              onSave={(data) => {
                createTag.mutate({
                  name: data.name,
                  typeId: data.typeId,
                  ...(data.parentId ? { parentId: data.parentId } : {}),
                })
                setAddTagDialog(null)
              }}
              isPending={createTag.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit TagType Dialog */}
      <EditTagTypeDialog
        tagType={editTagType}
        onSave={(data) =>
          updateTagType.mutate({ id: editTagType?.id ?? '', updates: data })
        }
        onClose={() => setEditTagType(null)}
        isPending={updateTagType.isPending}
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
