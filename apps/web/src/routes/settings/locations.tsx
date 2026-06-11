import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/locations')({
  component: LocationsLayout,
})

function LocationsLayout() {
  return <Outlet />
}
