import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface AddTagDialogProps {
  open: boolean
  tagName: string
  onTagNameChange: (name: string) => void
  onAdd: () => void
  onClose: () => void
}

export function AddTagDialog({
  open,
  tagName,
  onTagNameChange,
  onAdd,
  onClose,
}: AddTagDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tagName">Name</Label>
            <Input
              id="tagName"
              value={tagName}
              onChange={(e) => onTagNameChange(e.target.value)}
              placeholder="e.g., Dairy, Frozen"
              onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onAdd}>Add Tag</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
