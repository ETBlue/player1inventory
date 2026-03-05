import { AddNameDialog } from './AddNameDialog'

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
    <AddNameDialog
      open={open}
      title="Add Tag"
      submitLabel="Add Tag"
      name={tagName}
      placeholder="e.g., Dairy, Frozen"
      onNameChange={onTagNameChange}
      onAdd={onAdd}
      onClose={onClose}
    />
  )
}
