export interface Context {
  userId: string | null
}

export function requireAuth(ctx: Context): string {
  if (!ctx.userId) throw new Error('Unauthorized')
  return ctx.userId
}
