import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/tags/$id/items')({
  component: TagItemsTab,
})

function TagItemsTab() {
  return (
    <div className="p-4">
      <p className="text-foreground-muted">Items tab - coming soon</p>
    </div>
  )
}
