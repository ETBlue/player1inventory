import { GraphQLError } from 'graphql'

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

/**
 * Values worked out once per request and then reused. The GraphQL context
 * function in `index.ts` creates a new, empty object for every request, so
 * nothing here outlives its request. A context with no cache (most tests)
 * simply works the value out again on every call.
 */
export interface RequestCache {
  /** The caller's household id. Set by `requireHousehold` (lib/authz.ts). */
  householdId?: Promise<string>
}

export interface Context {
  userId: string | null
  /** From the `x-app-language` header. Missing means `en`. */
  language?: AppLanguage
  requestCache?: RequestCache
}

export function requireAuth(ctx: Context): string {
  if (!ctx.userId)
    throw new GraphQLError('Unauthorized', {
      extensions: { code: 'UNAUTHENTICATED' },
    })
  return ctx.userId
}
