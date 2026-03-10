import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/recipes')({
  component: RecipesLayout,
})

function RecipesLayout() {
  return <Outlet />
}
