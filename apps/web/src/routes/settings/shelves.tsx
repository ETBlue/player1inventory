import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/shelves')({
  component: ShelvesLayout,
})

function ShelvesLayout() {
  return <Outlet />
}
