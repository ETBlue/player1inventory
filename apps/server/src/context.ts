import { GraphQLError } from 'graphql'

export interface Context {
  userId: string | null
}

export function requireAuth(ctx: Context): string {
  if (!ctx.userId)
    throw new GraphQLError('Unauthorized', {
      extensions: { code: 'UNAUTHENTICATED' },
    })
  return ctx.userId
}
