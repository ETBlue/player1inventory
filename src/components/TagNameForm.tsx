import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TagNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function TagNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: TagNameFormProps) {
  return (
    <form
      className="space-y-4 max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="tag-name">Name</Label>
        <Input
          id="tag-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={!isDirty || isPending}>
        Save
      </Button>
    </form>
  )
}
