import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Player 1 Inventory</h1>
      <p className="text-muted-foreground">Pantry view coming soon</p>
    </div>
  )
}
