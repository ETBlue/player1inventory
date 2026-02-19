import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface VendorNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function VendorNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: VendorNameFormProps) {
  return (
    <form
      className="space-y-4 max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="vendor-name">Name</Label>
        <Input
          id="vendor-name"
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
