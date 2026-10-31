import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/household/recipes')({
  component: RecipesLayout,
})

function RecipesLayout() {
  return <Outlet />
}
