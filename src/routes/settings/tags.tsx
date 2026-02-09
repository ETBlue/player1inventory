import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AddTagDialog } from '@/components/AddTagDialog'
import { ColorSelect } from '@/components/ColorSelect'
import { EditTagTypeDialog } from '@/components/EditTagTypeDialog'
import { TagBadge } from '@/components/TagBadge'
import { TagDetailDialog } from '@/components/TagDetailDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { migrateTagColorsToTypes } from '@/db/operations'
import {
  useCreateTag,
  useCreateTagType,
  useDeleteTag,
  useDeleteTagType,
  useTags,
  useTagTypes,
  useUpdateTag,
  useUpdateTagType,
} from '@/hooks/useTags'
import { type Tag, TagColor, type TagType } from '@/types/index'

export const Route = createFileRoute('/settings/tags')({
  component: TagSettings,
})

function TagSettings() {
  const navigate = useNavigate()
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
  const [editTag, setEditTag] = useState<Tag | null>(null)
  const [tagTypeToDelete, setTagTypeToDelete] = useState<TagType | null>(null)
  const [editTagTypeName, setEditTagTypeName] = useState('')
  const [editTagTypeColor, setEditTagTypeColor] = useState(TagColor.blue)
  const [editTagName, setEditTagName] = useState('')

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

  const handleEditTag = () => {
    if (editTag && editTagName.trim()) {
      updateTag.mutate({
        id: editTag.id,
        updates: { name: editTagName.trim() },
      })
      setEditTag(null)
    }
  }

  const handleDeleteTagType = () => {
    if (tagTypeToDelete) {
      const typeTags = tags.filter((t) => t.typeId === tagTypeToDelete.id)
      for (const t of typeTags) {
        deleteTag.mutate(t.id)
      }
      deleteTagType.mutate(tagTypeToDelete.id)
      setTagTypeToDelete(null)
    }
  }

  const handleDeleteTag = () => {
    if (editTag) {
      deleteTag.mutate(editTag.id)
      setEditTag(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="neutral-ghost"
          size="icon"
          onClick={() => navigate({ to: '/settings' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Tags</h1>
      </div>

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

      {tagTypes.map((tagType) => {
        const typeTags = tags.filter((t) => t.typeId === tagType.id)
        const tagTypeColor = tagType.color || TagColor.blue

        return (
          <Card key={tagType.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: tagTypeColor }}
                  />
                  <CardTitle className="text-lg">{tagType.name}</CardTitle>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="neutral-ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditTagType(tagType)
                      setEditTagTypeName(tagType.name)
                      setEditTagTypeColor(tagTypeColor)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="neutral-ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setTagTypeToDelete(tagType)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {typeTags.map((tag) => (
                  <TagBadge
                    key={tag.id}
                    tag={tag}
                    tagType={tagType}
                    onClick={() => {
                      setEditTag(tag)
                      setEditTagName(tag.name)
                    }}
                  />
                ))}
                <Button
                  variant="neutral-ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setAddTagDialog(tagType.id)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
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

      {/* Tag Detail Dialog */}
      {editTag && (
        <TagDetailDialog
          tag={editTag}
          tagName={editTagName}
          onTagNameChange={setEditTagName}
          onSave={handleEditTag}
          onDelete={handleDeleteTag}
          onClose={() => setEditTag(null)}
        />
      )}

      {/* Confirm Delete TagType Dialog */}
      <ConfirmDialog
        open={!!tagTypeToDelete}
        onOpenChange={(open) => !open && setTagTypeToDelete(null)}
        title={`Delete "${tagTypeToDelete?.name}"?`}
        description={`This will delete the tag type and all its tags. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteTagType}
        destructive
      />
    </div>
  )
}
