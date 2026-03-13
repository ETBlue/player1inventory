import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/vendors')({
  component: VendorsLayout,
})

function VendorsLayout() {
  return <Outlet />
}
