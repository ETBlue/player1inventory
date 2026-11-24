import { createFileRoute, redirect } from '@tanstack/react-router'

// Old addresses `/items/$id/relation/{tags,vendors,recipes}`. The Relation
// level was removed on 2026-11-24 (design
// docs/features/items/2026-11-24-item-tabs-flat-design.md, part B). Each old
// address goes to its tab at the new address; anything else under
// `relation/` goes to Tags, like `relation/` itself (`relation/index.tsx`).
// The history entry is replaced, so Back does not land on a redirect.
// TanStack Router 1.158 already replaces on EVERY redirect (router-core
// `navigate({ ...redirect.options, replace: true })`), so `replace: true`
// here states the intent; removing it changes nothing today (measured).
export const Route = createFileRoute('/items/$id/relation/$')({
  beforeLoad: ({ params }) => {
    const id = params.id
    const tab = params._splat?.split('/')[0]
    if (tab === 'vendors') {
      throw redirect({
        to: '/items/$id/vendors',
        params: { id },
        replace: true,
      })
    }
    if (tab === 'recipes') {
      throw redirect({
        to: '/items/$id/recipes',
        params: { id },
        replace: true,
      })
    }
    throw redirect({ to: '/items/$id/tags', params: { id }, replace: true })
  },
})
