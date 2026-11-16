import type { Server as HttpServer } from 'node:http'
import type { GraphQLSchema } from 'graphql'
import { CloseCode, type Context as WsContext } from 'graphql-ws'
import { useServer } from 'graphql-ws/lib/use/ws'
import { WebSocketServer } from 'ws'
import { GRAPHQL_PATH } from '../constants.js'
import { type AppLanguage, appLanguageFrom, type Context, clientIdFrom } from '../context.js'
import { identifyCaller } from './graphqlContext.js'

// The WebSocket endpoint for live updates (households H3c-1, task C.3).
//
// It shares the HTTP server's port and path (`/graphql`) and the same
// executable schema. A tab opens one socket and subscribes to
// `householdChanged` on it.
//
// ── WHAT THE CLIENT SENDS (`connectionParams`) ──
//
// | Key             | When                 | What                                   |
// |-----------------|----------------------|----------------------------------------|
// | `authorization` | outside E2E mode     | `Bearer <Clerk session token>`         |
// | `e2eUserId`     | E2E mode only        | the user id. IGNORED outside E2E mode  |
// | `clientId`      | always               | the tab id (`clientIdFrom`). Required  |
// | `language`      | optional             | `en` or `tw`, like `x-app-language`    |
//
// ── CLOSE CODES ──
//
// | Code   | When                                          | graphql-ws 5 client   |
// |--------|-----------------------------------------------|-----------------------|
// | `4401` | no user, a bad token, or no valid `clientId`  | does NOT retry        |
// | `1001` | the socket is 60 minutes old                  | retries, with a wait  |
//
// Why 1001 (Going Away) for the age limit: graphql-ws 5's client treats
// `4401` and every 1xxx code except 1000, 1001, 1005, 1006, 1012, 1013 and
// 1014 as fatal (`isFatalInternalCloseCode` in `graphql-ws/lib/client.js`).
// 1001 goes through the normal retry path: a random wait of about 1.3 to 4
// seconds, then a new socket, whose `connectionParams` function runs again
// and so sends a fresh token. 1000 would also reconnect, but at once and only
// while a subscription is open; the random wait spreads out sockets that
// were all opened at the same moment (after a deploy). The retry counter
// starts again at 0 after each successful connect, so a socket closed every
// hour never uses up the client's 5 retries.
//
// ── WHY THE AGE LIMIT ──
//
// The Clerk token is checked once, when the socket opens. A user who signs
// out or is removed keeps an open socket until it closes. The limit makes
// sure the token is checked again at least once an hour. (Roles are checked
// for every event anyway: `shouldDeliver` in `resolvers/live.resolver.ts`.)

/** How long a socket may stay open. */
export const SOCKET_MAX_AGE_MS = 60 * 60 * 1000

/** Close code for a socket that is refused. graphql-ws's own `Unauthorized`. */
export const CLOSE_UNAUTHORIZED = CloseCode.Unauthorized

/** Close code for a socket that reached the age limit. The client retries it. */
export const CLOSE_MAX_AGE = 1001

/**
 * What the socket server needs from the outside. `index.ts` passes the real
 * ones; a test passes its own. Like `GraphQLContextDeps`.
 */
export interface WsServerDeps {
  /** True when the server runs with `E2E_TEST_MODE=true`. */
  e2eTestMode: boolean
  /**
   * Check a Clerk session token and return its user id. May throw or return
   * `null` for a bad token. Must never log the token.
   */
  verifyClerkToken: (token: string) => Promise<string | null>
  /** `ensureUserOrLog` in `index.ts`, which never throws (plan P11). */
  ensureUser: (userId: string) => Promise<void>
  /** For tests. Default `SOCKET_MAX_AGE_MS`. */
  maxAgeMs?: number
}

/** What `onConnect` keeps for one socket. */
interface SocketState {
  userId: string
  clientId: string
  language: AppLanguage
  timer: ReturnType<typeof setTimeout>
}

/** The part of the `ws` socket this file uses. A test passes a fake. */
interface ClosableSocket {
  close(code: number, reason: string): void
}

/** The `extra` that `useServer` from `graphql-ws/lib/use/ws` gives. */
export type SocketExtra = {
  socket: ClosableSocket
}

/** The graphql-ws context the handlers get. Exported for the tests. */
export type Ctx = WsContext<Record<string, unknown> | undefined, SocketExtra>

/** `Bearer <token>` → the token. Anything else → `null`. */
function bearerToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value)
  return match?.[1] ?? null
}

/**
 * The `useServer` options, without the schema. Split out so a unit test can
 * call `onConnect`, `onClose` and `context` with a fake socket and fake
 * timers, with no network.
 */
export function createWsHandlers(deps: WsServerDeps) {
  const maxAgeMs = deps.maxAgeMs ?? SOCKET_MAX_AGE_MS
  // Keyed by the `extra` object, which graphql-ws makes once per socket.
  const sockets = new WeakMap<SocketExtra, SocketState>()

  function refuse(ctx: Ctx, reason: string): false {
    // Close with 4401 ourselves. Returning `false` alone would close with
    // 4403 (Forbidden), which the client RETRIES. graphql-ws then also calls
    // `close(4403)`, but `ws` ignores a second close on a closing socket, so
    // the first code is the one the client sees (checked by the real-socket
    // test in `wsServer.test.ts`).
    ctx.extra.socket.close(CLOSE_UNAUTHORIZED, reason)
    return false
  }

  return {
    onConnect: async (ctx: Ctx): Promise<boolean> => {
      const params = ctx.connectionParams ?? {}

      // A socket must have a tab id, so the server can skip the tab that made
      // a change. Unlike HTTP, where a missing id is allowed.
      const clientId = clientIdFrom(params.clientId)
      if (!clientId) return refuse(ctx, 'Unauthorized')

      let userId: string | null
      try {
        userId = await identifyCaller({
          e2eTestMode: deps.e2eTestMode,
          e2eUserId: params.e2eUserId,
          clerkUserId: async () => {
            const token = bearerToken(params.authorization)
            return token ? deps.verifyClerkToken(token) : null
          },
          ensureUser: deps.ensureUser,
        })
      } catch (err) {
        // A bad or expired token. The error's name only: never the token,
        // and never a message that may hold it.
        console.error(
          'wsServer: token check failed:',
          err instanceof Error ? err.name : 'unknown error',
        )
        userId = null
      }
      if (!userId) return refuse(ctx, 'Unauthorized')

      const timer = setTimeout(() => {
        ctx.extra.socket.close(CLOSE_MAX_AGE, 'Socket age limit')
      }, maxAgeMs)
      sockets.set(ctx.extra, {
        userId,
        clientId,
        language: appLanguageFrom(typeof params.language === 'string' ? params.language : undefined),
        timer,
      })
      return true
    },

    /**
     * Called for every closed socket, accepted or not, whatever closed it.
     * So this is the one place the timer is cleared.
     */
    onClose: (ctx: Ctx): void => {
      const state = sockets.get(ctx.extra)
      if (!state) return
      clearTimeout(state.timer)
      sockets.delete(ctx.extra)
    },

    /**
     * The context of one subscription. A new `requestCache` for each
     * operation, the same as one HTTP request.
     */
    context: (ctx: Ctx): Context => {
      const state = sockets.get(ctx.extra)
      // graphql-ws runs no operation before `onConnect` has accepted the
      // socket, so the state is always there. Without it, no user:
      // `requireAuth` in the resolver refuses.
      if (!state) return { userId: null, requestCache: {} }
      return {
        userId: state.userId,
        clientId: state.clientId,
        language: state.language,
        requestCache: {},
      }
    },
  }
}

/**
 * Open the WebSocket endpoint on an HTTP server, at `/graphql`. Returns the
 * `ws` server and a `dispose` that closes every socket.
 */
export function attachWsServer(server: HttpServer, schema: GraphQLSchema, deps: WsServerDeps) {
  const wsServer = new WebSocketServer({ server, path: GRAPHQL_PATH })
  const handlers = createWsHandlers(deps)
  const cleanup = useServer({ schema, ...handlers }, wsServer)
  return { wsServer, dispose: () => cleanup.dispose() }
}
