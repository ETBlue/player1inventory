import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { clerkClient, clerkMiddleware, getAuth } from '@clerk/express'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import { DEFAULT_CLIENT_ORIGIN, DEFAULT_PORT, GRAPHQL_PATH } from './constants.js'
import { clerkWebhookHandler } from './lib/clerkWebhook.js'
import { e2eCleanupHandler } from './lib/e2eCleanup.js'
import {
  e2eCreateUserHandler,
  e2eReadUserHandler,
  e2eUserDeletedHandler,
} from './lib/e2eUsers.js'
import { isAllowedOrigin } from './lib/cors.js'
import { prisma } from './lib/prisma.js'
import type { UserSource } from './lib/userRow.js'
import { ensureUserOrLog } from './lib/userRow.js'
import { typeDefs } from './schema/index.js'
import { resolvers } from './resolvers/index.js'
import type { Context } from './context.js'

const E2E_TEST_MODE = process.env.E2E_TEST_MODE === 'true'
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN

const app = express()
app.use(
  cors({
    // A function (rather than a single string) so both the configured client
    // origin AND any Cloudflare Pages preview origin for this project are
    // allowed — see lib/cors.ts for the matching rules.
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, CLIENT_ORIGIN)) {
        callback(null, true)
      } else {
        callback(new Error(`Origin ${origin} is not allowed by CORS`))
      }
    },
  }),
)
// Clerk user webhooks (lib/clerkWebhook.ts). This route MUST stay above the
// app-wide JSON parser below. The signature covers the raw bytes Clerk sent,
// so the route reads the body with express.raw. Below the JSON parser, the
// body would already be an object, and the check would run on re-serialized
// JSON. webhookRouteOrder.test.ts guards the order.
app.post('/webhooks/clerk', express.raw({ type: 'application/json' }), clerkWebhookHandler)
app.use(express.json({ limit: '1mb' }))
if (!E2E_TEST_MODE) app.use(clerkMiddleware())

// E2E test-only routes — only mounted when E2E_TEST_MODE is set.
if (E2E_TEST_MODE) {
  // Delete all data owned by the test user, its User row included, so each
  // test starts clean (lib/e2eCleanup.ts).
  app.delete('/e2e/cleanup', e2eCleanupHandler)

  // Create a User row, fake Clerk's user.deleted event, and read a row back
  // (lib/e2eUsers.ts). No signature is checked, and no test signing secret
  // exists. That is safe only because these lines are inside this block:
  // webhookRouteOrder.test.ts fails if any route in this block moves out of it.
  app.post('/e2e/users', e2eCreateUserHandler)
  app.post('/e2e/users/:id/deleted', e2eUserDeletedHandler)
  app.get('/e2e/users/:id', e2eReadUserHandler)
}

// Where ensureUser takes a new User row's name and email. E2E mode never
// calls Clerk: the display name is the user id.
const USER_SOURCE: UserSource = E2E_TEST_MODE
  ? { kind: 'e2e' }
  : { kind: 'clerk', lookup: async (id) => (await clerkClient.users.getUser(id)).raw }

const server = new ApolloServer<Context>({ typeDefs, resolvers })
await server.start()

app.use(
  GRAPHQL_PATH,
  expressMiddleware(server, {
    context: async ({ req }) => {
      // E2E test bypass: accept a static user ID header instead of a Clerk JWT.
      // Only active when the server is started with E2E_TEST_MODE=true.
      //
      // Both branches call ensureUserOrLog (lib/userRow.ts): it creates a
      // missing User row and records lastSeenAt once per UTC day. It never
      // throws, so a failure there never fails the request (plan P11). The
      // E2E branch returns early, so it needs its own call.
      // contextEnsureUser.test.ts guards both calls.
      if (E2E_TEST_MODE) {
        const testUserId = req.headers['x-e2e-user-id'] as string | undefined
        if (testUserId) {
          await ensureUserOrLog(testUserId, USER_SOURCE)
          return { userId: testUserId }
        }
      }
      const auth = getAuth(req)
      const userId = auth.userId ?? null
      if (userId) await ensureUserOrLog(userId, USER_SOURCE)
      return { userId }
    },
  }),
)

const PORT = process.env.PORT ?? DEFAULT_PORT

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

app.listen(PORT, () => {
  console.log(`Server ready at http://localhost:${PORT}${GRAPHQL_PATH}`)
})
