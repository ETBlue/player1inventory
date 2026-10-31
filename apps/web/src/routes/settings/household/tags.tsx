import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/household/tags')({
  component: TagsLayout,
})

function TagsLayout() {
  return <Outlet />
}
