import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getContrastTextColor } from '@/lib/utils'
import {
  useTagTypes,
  useCreateTagType,
  useDeleteTagType,
  useTags,
  useCreateTag,
  useDeleteTag,
  useUpdateTagType,
  useUpdateTag,
  useItemCountByTag,
} from '@/hooks/useTags'
import { migrateTagColorsToTypes } from '@/db/operations'
import type { Tag, TagType } from '@/types/index'

export const Route = createFileRoute('/settings/tags')({
  component: TagSettings,
})

// TagBadge component that shows item count
function TagBadge({ tag, tagType, onClick }: { tag: Tag; tagType: TagType; onClick: () => void }) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)
  const backgroundColor = tagType.color || '#3b82f6'
  const textColor = getContrastTextColor(backgroundColor)

  return (
    <Badge
      style={{
        backgroundColor,
        color: textColor,
      }}
      className="cursor-pointer"
      onClick={onClick}
    >
      {tag.name} ({itemCount})
    </Badge>
  )
}

// TagDetailDialog component
function TagDetailDialog({
  tag,
  tagName,
  onTagNameChange,
  onSave,
  onDelete,
  onClose,
}: {
  tag: Tag
  tagName: string
  onTagNameChange: (name: string) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tag Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="editTagName">Name</Label>
            <Input
              id="editTagName"
              value={tagName}
              onChange={(e) => onTagNameChange(e.target.value)}
              placeholder="e.g., Dairy"
              onKeyDown={(e) => e.key === 'Enter' && onSave()}
            />
          </div>
          <div className="space-y-2">
            <Label>Item count</Label>
            <p className="text-sm text-muted-foreground">
              {itemCount} items using this tag
            </p>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <Button variant="destructive" onClick={onDelete}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
  const [newTagTypeColor, setNewTagTypeColor] = useState('#3b82f6')
  const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [editTagType, setEditTagType] = useState<TagType | null>(null)
  const [editTag, setEditTag] = useState<Tag | null>(null)
  const [tagTypeToDelete, setTagTypeToDelete] = useState<TagType | null>(null)
  const [editTagTypeName, setEditTagTypeName] = useState('')
  const [editTagTypeColor, setEditTagTypeColor] = useState('#3b82f6')
  const [editTagName, setEditTagName] = useState('')

  // Run migration on mount
  useEffect(() => {
    migrateTagColorsToTypes()
  }, [])

  const handleAddTagType = () => {
    if (newTagTypeName.trim()) {
      createTagType.mutate({ name: newTagTypeName.trim(), color: newTagTypeColor })
      setNewTagTypeName('')
      setNewTagTypeColor('#3b82f6')
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
          variant="ghost"
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
              <div className="flex gap-2">
                <Input
                  id="newTagTypeColor"
                  type="color"
                  value={newTagTypeColor}
                  onChange={(e) => setNewTagTypeColor(e.target.value)}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={newTagTypeColor}
                  onChange={(e) => setNewTagTypeColor(e.target.value)}
                  placeholder="#3b82f6"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {tagTypes.map((tagType) => {
        const typeTags = tags.filter((t) => t.typeId === tagType.id)
        const tagTypeColor = tagType.color || '#3b82f6'

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
                    variant="ghost"
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
                    variant="ghost"
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
                  variant="outline"
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
      <Dialog open={!!addTagDialog} onOpenChange={(open) => !open && setAddTagDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tagName">Name</Label>
              <Input
                id="tagName"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="e.g., Dairy, Frozen"
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTagDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleAddTag}>Add Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit TagType Dialog */}
      <Dialog open={!!editTagType} onOpenChange={(open) => !open && setEditTagType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tag Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editTagTypeName">Name</Label>
              <Input
                id="editTagTypeName"
                value={editTagTypeName}
                onChange={(e) => setEditTagTypeName(e.target.value)}
                placeholder="e.g., Ingredient type"
                onKeyDown={(e) => e.key === 'Enter' && handleEditTagType()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editTagTypeColor">Color</Label>
              <div className="flex gap-2">
                <Input
                  id="editTagTypeColor"
                  type="color"
                  value={editTagTypeColor}
                  onChange={(e) => setEditTagTypeColor(e.target.value)}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={editTagTypeColor}
                  onChange={(e) => setEditTagTypeColor(e.target.value)}
                  placeholder="#3b82f6"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTagType(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditTagType}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
