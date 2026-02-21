import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/tags/$id/')({
  component: TagInfoTab,
})

function TagInfoTab() {
  return (
    <div className="p-4">
      <p className="text-foreground-muted">Info tab - coming soon</p>
    </div>
  )
}
