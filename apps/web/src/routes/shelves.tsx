import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/shelves')({
  component: ShelvesLayout,
})

function ShelvesLayout() {
  return <Outlet />
}
