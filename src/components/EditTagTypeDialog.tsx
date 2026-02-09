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
import { TagColor, type TagType } from '@/types'

interface EditTagTypeDialogProps {
  tagType: TagType | null
  name: string
  color: TagColor
  onNameChange: (name: string) => void
  onColorChange: (color: TagColor) => void
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
            <select
              id="editTagTypeColor"
              value={color}
              onChange={(e) => onColorChange(e.target.value as TagColor)}
              className="flex h-10 w-full rounded-sm px-3 py-2 text-foreground-default bg-background-surface border border-accessory-default focus:outline-none focus:border-accessory-emphasized disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            >
              {Object.values(TagColor).map((colorOption) => (
                <option key={colorOption} value={colorOption}>
                  {colorOption}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="neutral-ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
