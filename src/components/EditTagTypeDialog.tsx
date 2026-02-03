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
import { getContrastTextColor } from '@/lib/utils'
import type { TagType } from '@/types'

interface EditTagTypeDialogProps {
  tagType: TagType | null
  name: string
  color: string
  onNameChange: (name: string) => void
  onColorChange: (color: string) => void
  onSave: () => void
  onClose: () => void
}

export function EditTagTypeDialog({
  tagType,
  name,
  color,
  onNameChange,
  onColorChange,
  onSave,
  onClose,
}: EditTagTypeDialogProps) {
  return (
    <Dialog open={!!tagType} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Tag Type</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="editTagTypeName">Name</Label>
            <Input
              id="editTagTypeName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., Ingredient type"
              onKeyDown={(e) => e.key === 'Enter' && onSave()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editTagTypeColor">Color</Label>
            <div className="flex gap-2">
              <Input
                id="editTagTypeColor"
                type="color"
                value={color}
                onChange={(e) => onColorChange(e.target.value)}
                className="w-16 h-10 p-1"
              />
              <Input
                value={color}
                onChange={(e) => onColorChange(e.target.value)}
                placeholder="#3b82f6"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Preview</Label>
            <div
              className="h-10 rounded-md flex items-center justify-center font-medium text-sm"
              style={{
                backgroundColor: color,
                color: getContrastTextColor(color),
              }}
            >
              Example Tag
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
