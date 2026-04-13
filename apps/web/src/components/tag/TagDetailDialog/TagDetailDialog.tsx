import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogMain,
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
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <>
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag Details</DialogTitle>
          </DialogHeader>
          <DialogMain>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editTagName">Name</Label>
                <Input
                  id="editTagName"
                  value={tagName}
                  autoFocus
                  onChange={(e) => onTagNameChange(e.target.value)}
                  placeholder="e.g., Dairy"
                  onKeyDown={(e) => e.key === 'Enter' && onSave()}
                />
              </div>
              <div className="space-y-2">
                <Label>Item count</Label>
                <p className="text-sm text-foreground-muted">
                  {itemCount} items using this tag
                </p>
              </div>
            </div>
          </DialogMain>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setShowConfirm(true)}>
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="neutral-outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onSave}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showConfirm}
        onOpenChange={(open) => !open && setShowConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${tag.name}"?`}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {`This will remove "${tag.name}" from ${itemCount} item${itemCount === 1 ? '' : 's'}.`}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                setShowConfirm(false)
                onDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
