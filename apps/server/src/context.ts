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
 * `CLIENT_ID_MAX_LENGTH` is treated as missing. So is an array, which the
 * type allows.
 *
 * A header sent twice does NOT arrive as an array. Node joins the values into
 * one string, `"tab-1, tab-2"` (measured on Node 22.17.1; only
 * `req.headersDistinct` gives an array). That string is kept as the tab id.
 * This is harmless: the id only decides which tab does not get its own change
 * back, and no real tab has that id, so every tab gets the change.
 */
export function clientIdFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= CLIENT_ID_MAX_LENGTH
    ? value
    : undefined
}

/** The longest household id the server accepts. See `householdIdFrom`. */
export const HOUSEHOLD_ID_MAX_LENGTH = 64

/**
 * The household a tab shows, from the `x-household-id` header (households H7
 * task L.1, decision T66). The web sends the household id it last saw
 * (`localStorage['last-household-id']`) on every HTTP request.
 *
 * `requireHousehold` (lib/authz.ts) compares it with the household the person
 * acts in now, and refuses with `HOUSEHOLD_CHANGED` when the two differ. It is
 * never used to CHOOSE a household, and it grants nothing.
 *
 * A value that is not a string, is empty, is longer than
 * `HOUSEHOLD_ID_MAX_LENGTH`, or holds a comma or any whitespace is treated as
 * missing. So is an array, which the type allows. Missing means "compare
 * nothing", which is what an old web bundle and `makeGql` in E2E send.
 *
 * Why a comma or whitespace: a header sent twice does NOT arrive as an
 * array. Node joins the values into one string, `"A, B"` (measured on Node
 * 22.17.1; only `req.headersDistinct` gives an array). A household id is a
 * `cuid()`, which never holds either character, so such a value cannot be a
 * household id.
 *
 * Why "missing" and not a refusal: a client that sends `"A, B"` could just as
 * well send no header, and no header already skips the compare. That has to
 * stay possible, because old web bundles send none and must keep working. So
 * refusing `"A, B"` would protect nothing, and treating it as missing keeps one
 * rule: a header that names no single household compares nothing.
 */
export function householdIdFrom(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= HOUSEHOLD_ID_MAX_LENGTH &&
    !/[,\s]/.test(value)
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
   * Forgotten before and after every root `Mutation` field
   * (`forgetRolesAroundEach`, lib/mutationRoleCache.ts), so a later field of
   * the same mutation never reads a stale role.
   */
  locationRoles?: Map<string, Promise<Map<string, LocationRole>>>
  /**
   * The locations with an organizer that still counts, one entry per
   * household asked for. Set by `locationIdsWithOrganizer` (lib/authz.ts).
   * Cleared by `forgetLocationRoles`, for the same reason.
   */
  organizedLocations?: Map<string, Promise<Set<string>>>
  /**
   * OLD-BUNDLE SHIM. Remove with `Location.isDefault`, in the release after
   * households. The id of the caller's first location, by `order` then `id`,
   * one entry per household asked for (`null` when the caller has none). Set
   * by `firstLocationIdOf` (resolvers/location.resolver.ts), so a list of N
   * locations reads it once, not N times. Cleared by `forgetLocationRoles`,
   * because a create, delete or reorder changes which location is first.
   */
  firstLocationIds?: Map<string, Promise<string | null>>
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
  /**
   * The household the tab shows (`householdIdFrom`, households H7 task L.1).
   * Missing when the request had no valid `x-household-id` header: an old web
   * bundle, `makeGql` in E2E, or a tab that has not seen a household yet.
   */
  shownHouseholdId?: string
  requestCache?: RequestCache
}

export function requireAuth(ctx: Context): string {
  if (!ctx.userId)
    throw new GraphQLError('Unauthorized', {
      extensions: { code: 'UNAUTHENTICATED' },
    })
  return ctx.userId
}
