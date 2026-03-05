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

interface AddNameDialogProps {
  open: boolean
  title: string
  submitLabel: string
  name: string
  placeholder?: string
  onNameChange: (name: string) => void
  onAdd: () => void
  onClose: () => void
}

export function AddNameDialog({
  open,
  title,
  submitLabel,
  name,
  placeholder,
  onNameChange,
  onAdd,
  onClose,
}: AddNameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="entityName">Name</Label>
            <Input
              id="entityName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={placeholder}
              className="capitalize"
              onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onAdd}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
