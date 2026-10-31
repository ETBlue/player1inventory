import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/household/locations')({
  component: LocationsLayout,
})

function LocationsLayout() {
  return <Outlet />
}
