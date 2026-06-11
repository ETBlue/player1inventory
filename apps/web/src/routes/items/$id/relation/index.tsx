import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/items/$id/relation/')({
  // Default subtab: land on vendors when visiting `/items/$id/relation`.
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/items/$id/relation/vendors',
      params: { id: params.id },
    })
  },
})
