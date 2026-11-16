import { GraphQLError } from 'graphql'
import type { LocationRole } from '@prisma/client'

/**
 * The app languages the server knows. The web client sends its current
 * language in the `x-app-language` header (households H3a, decision H3).
 * First sign-in uses it to name the new household and its first location.
 */
export const APP_LANGUAGES = ['en', 'tw'] as const
export type AppLanguage = (typeof APP_LANGUAGES)[number]

/**
 * The `x-app-language` header as an `AppLanguage`. Only `en` and `tw` are
 * accepted. Anything else, a missing header, or a header sent twice gives
 * `en`.
 */
export function appLanguageFrom(header: string | string[] | undefined): AppLanguage {
  return (APP_LANGUAGES as readonly string[]).includes(header as string)
    ? (header as AppLanguage)
    : 'en'
}

/** The longest tab id the server accepts. See `clientIdFrom`. */
export const CLIENT_ID_MAX_LENGTH = 64

/**
 * The tab id from the `x-client-id` header (HTTP) or, from task C.3,
 * `connectionParams.clientId` (WebSocket). Households H3c-1, decision P4.
 *
 * The web client makes a random id per browser tab. The server uses it only
 * to not send a tab's own change back to it, so it is never trusted for
 * anything else. A value that is not a string, is empty, or is longer than
 * `CLIENT_ID_MAX_LENGTH` is treated as missing. A header sent twice arrives
 * as an array and is treated as missing too.
 */
export function clientIdFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= CLIENT_ID_MAX_LENGTH
    ? value
    : undefined
}

/**
 * Values worked out once per request and then reused. The GraphQL context
 * function in `index.ts` creates a new, empty object for every request, so
 * nothing here outlives its request. A context with no cache (most tests)
 * simply works the value out again on every call.
 */
export interface RequestCache {
  /** The caller's household id. Set by `requireHousehold` (lib/authz.ts). */
  householdId?: Promise<string>
  /**
   * The caller's counted location roles, one entry per household asked for.
   * Set by `locationRolesByLocation` (lib/authz.ts, households H5 task F.1).
   * A write that adds or removes a role row must clear it with
   * `forgetLocationRoles` (lib/authz.ts), or a later field of the same
   * mutation reads a stale role.
   */
  locationRoles?: Map<string, Promise<Map<string, LocationRole>>>
  /**
   * The locations with an organizer that still counts, one entry per
   * household asked for. Set by `locationIdsWithOrganizer` (lib/authz.ts).
   * Cleared by `forgetLocationRoles`, for the same reason.
   */
  organizedLocations?: Map<string, Promise<Set<string>>>
}

export interface Context {
  userId: string | null
  /** From the `x-app-language` header. Missing means `en`. */
  language?: AppLanguage
  /**
   * The tab that sent this request (`clientIdFrom`). Missing when the request
   * had no valid `x-client-id` header, for example `makeGql` in E2E or an old
   * web bundle. A change published without it reaches every tab.
   */
  clientId?: string
  requestCache?: RequestCache
}

export function requireAuth(ctx: Context): string {
  if (!ctx.userId)
    throw new GraphQLError('Unauthorized', {
      extensions: { code: 'UNAUTHENTICATED' },
    })
  return ctx.userId
}
