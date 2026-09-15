import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { clerkMiddleware, getAuth } from '@clerk/express'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import { DEFAULT_CLIENT_ORIGIN, DEFAULT_PORT, GRAPHQL_PATH } from './constants.js'
import { prisma } from './lib/prisma.js'
import { typeDefs } from './schema/index.js'
import { resolvers } from './resolvers/index.js'
import type { Context } from './context.js'

const E2E_TEST_MODE = process.env.E2E_TEST_MODE === 'true'

const app = express()
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN }))
app.use(express.json({ limit: '1mb' }))
if (!E2E_TEST_MODE) app.use(clerkMiddleware())

// E2E test-only cleanup endpoint — only mounted when E2E_TEST_MODE is set.
// Deletes all data owned by the test user so each test starts clean.
if (E2E_TEST_MODE) {
  app.delete('/e2e/cleanup', async (req, res) => {
    const userId = req.headers['x-e2e-user-id'] as string | undefined
    if (!userId) {
      res.status(400).json({ error: 'Missing x-e2e-user-id header' })
      return
    }
    await prisma.$transaction([
      prisma.inventoryLog.deleteMany({ where: { userId } }),
      prisma.cartItem.deleteMany({ where: { userId } }),
      prisma.cart.deleteMany({ where: { userId } }),
      prisma.itemTag.deleteMany({ where: { item: { userId } } }),
      prisma.itemVendor.deleteMany({ where: { item: { userId } } }),
      prisma.recipeItem.deleteMany({ where: { item: { userId } } }),
      // ItemStock has no userId — it is scoped through its Location. Both of its
      // FKs are ON DELETE CASCADE, so these rows would go when item or location
      // goes; the explicit delete, and its position before both, keeps this list
      // identical to clearAllData and purgeUserData. See the ordering comment on
      // purgeUserData (purge.resolver.ts), where the order does change the result
      // because that path returns the deleted count.
      prisma.itemStock.deleteMany({ where: { location: { userId } } }),
      prisma.item.deleteMany({ where: { userId } }),
      prisma.tag.deleteMany({ where: { userId } }),
      prisma.tagType.deleteMany({ where: { userId } }),
      prisma.vendor.deleteMany({ where: { userId } }),
      prisma.recipe.deleteMany({ where: { userId } }),
      // Shelves are user-scoped too — without this they accumulate across runs
      // in the shared DB and collide (by id) with imported fixture shelves,
      // surfacing a spurious "Conflicts detected" dialog on import tests.
      prisma.shelf.deleteMany({ where: { userId } }),
      // Locations are user-scoped too. Without this they accumulate across runs
      // in the shared test DB, and ensureDefaultLocation (location.resolver.ts)
      // returns early whenever the user already has one — so the next run starts
      // with the previous run's locations instead of a fresh default.
      prisma.location.deleteMany({ where: { userId } }),
    ])
    res.json({ ok: true })
  })
}

const server = new ApolloServer<Context>({ typeDefs, resolvers })
await server.start()

app.use(
  GRAPHQL_PATH,
  expressMiddleware(server, {
    context: async ({ req }) => {
      // E2E test bypass: accept a static user ID header instead of a Clerk JWT.
      // Only active when the server is started with E2E_TEST_MODE=true.
      if (E2E_TEST_MODE) {
        const testUserId = req.headers['x-e2e-user-id'] as string | undefined
        if (testUserId) return { userId: testUserId }
      }
      const auth = getAuth(req)
      return { userId: auth.userId ?? null }
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
