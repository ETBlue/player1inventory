import { createFileRoute, redirect } from '@tanstack/react-router'

// Old address. The Relation level was removed on 2026-11-24 (design
// docs/features/items/2026-11-24-item-tabs-flat-design.md, part B): Tags,
// Vendors and Recipes are tabs of their own now. A saved link to
// `/items/$id/relation` lands on the Tags tab. The history entry is replaced,
// so Back does not land on this redirect again (TanStack Router replaces on
// every redirect; see `$.tsx` beside this file).
export const Route = createFileRoute('/items/$id/relation/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/items/$id/tags',
      params: { id: params.id },
      replace: true,
    })
  },
})
