import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
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
import {
  useTagTypes,
  useCreateTagType,
  useDeleteTagType,
  useTags,
  useCreateTag,
  useDeleteTag,
} from '@/hooks/useTags'

export const Route = createFileRoute('/settings/tags')({
  component: TagSettings,
})

function TagSettings() {
  const navigate = useNavigate()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: tags = [] } = useTags()
  const createTagType = useCreateTagType()
  const deleteTagType = useDeleteTagType()
  const createTag = useCreateTag()
  const deleteTag = useDeleteTag()

  const [newTagTypeName, setNewTagTypeName] = useState('')
  const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')

  const handleAddTagType = () => {
    if (newTagTypeName.trim()) {
      createTagType.mutate({ name: newTagTypeName.trim() })
      setNewTagTypeName('')
    }
  }

  const handleAddTag = () => {
    if (addTagDialog && newTagName.trim()) {
      createTag.mutate({
        name: newTagName.trim(),
        typeId: addTagDialog,
        color: newTagColor,
      })
      setNewTagName('')
      setAddTagDialog(null)
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
        </CardContent>
      </Card>

      {tagTypes.map((tagType) => {
        const typeTags = tags.filter((t) => t.typeId === tagType.id)

        return (
          <Card key={tagType.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{tagType.name}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setAddTagDialog(tagType.id)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${tagType.name}" and all its tags?`)) {
                        typeTags.forEach((t) => deleteTag.mutate(t.id))
                        deleteTagType.mutate(tagType.id)
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {typeTags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags yet</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {typeTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      style={tag.color ? { backgroundColor: tag.color } : undefined}
                      className="group cursor-pointer"
                      onClick={() => {
                        if (confirm(`Delete tag "${tag.name}"?`)) {
                          deleteTag.mutate(tag.id)
                        }
                      }}
                    >
                      {tag.name}
                      <Trash2 className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100" />
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagColor">Color</Label>
              <div className="flex gap-2">
                <Input
                  id="tagColor"
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  placeholder="#3b82f6"
                />
              </div>
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
    </div>
  )
}
