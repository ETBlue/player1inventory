import { GraphQLError } from 'graphql'
import { type Context, requireAuth } from '../context.js'
import { prisma } from './prisma.js'

export type LocationRole = 'viewer' | 'member' | 'owner'

/**
 * The single authorization seam for location-scoped data.
 *
 * Call sites ask "does the caller hold a sufficient role on this location?"
 * and never inspect `userId` themselves. That is the whole point: today the
 * body below is user ownership, but under location RBAC (owner/member edit,
 * viewer reads) it becomes a membership lookup — and that is a change to THIS
 * function, not to every resolver that calls it.
 *
 * See docs/global/permissions/2026-08-29-design-location-rbac.md.
 *
 * `role` is accepted and deliberately unused pre-RBAC. Do not remove the
 * parameter to silence the unused warning: its presence at every call site is
 * what makes landing RBAC a one-function change.
 */
export async function requireLocationRole(
  ctx: Context,
  locationId: string,
  role: LocationRole,
): Promise<{ id: string; userId: string; isDefault: boolean }> {
  const userId = requireAuth(ctx)
  void role

  const location = await prisma.location.findFirst({
    where: { id: locationId, userId },
    select: { id: true, userId: true, isDefault: true },
  })

  // Deliberately indistinguishable from "not found": a caller must not be able
  // to probe for the existence of another user's location ids.
  if (!location) {
    throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })
  }

  return location
}
