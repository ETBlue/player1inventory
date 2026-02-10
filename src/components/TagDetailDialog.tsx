import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useItemCountByTag } from '@/hooks/useTags'
import type { Tag } from '@/types'

interface TagDetailDialogProps {
  tag: Tag
  tagName: string
  onTagNameChange: (name: string) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

export function TagDetailDialog({
  tag,
  tagName,
  onTagNameChange,
  onSave,
  onDelete,
  onClose,
}: TagDetailDialogProps) {
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
            <Button variant="neutral-ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
