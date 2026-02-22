import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cooking')({
  component: CookingView,
})

function CookingView() {
  return (
    <div className="p-4">
      <p className="text-foreground-muted">Cooking coming soon.</p>
    </div>
  )
}
