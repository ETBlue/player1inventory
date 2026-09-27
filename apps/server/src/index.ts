import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { clerkMiddleware, getAuth } from '@clerk/express'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import { DEFAULT_CLIENT_ORIGIN, DEFAULT_PORT, GRAPHQL_PATH } from './constants.js'
import { isAllowedOrigin } from './lib/cors.js'
import { prisma } from './lib/prisma.js'
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
    // Every `deleteMany` result is `{ count }`. The counts used to be thrown
    // away, and that is what made a WRONG `where` clause invisible: the route
    // answered 200 either way. `purge-coverage.test.ts` cannot see it either —
    // it is a source-text check that only asks whether the string
    // `prisma.<model>.deleteMany(` appears in this file, never what filter the
    // call carries. So the counts are returned, and
    // `e2e/tests/cleanup-endpoint.spec.ts` seeds one row of every model below
    // and asserts each count is at least 1.
    //
    // ORDER MATTERS FOR THE COUNTS, not only for the deletes. Every child is
    // deleted before its parent, so each count is the number of rows this
    // statement removed. Move `item.deleteMany` above `itemTag.deleteMany` and
    // the ItemTag rows go by ON DELETE CASCADE instead, reporting 0.
    const [
      inventoryLogs,
      cartItems,
      carts,
      itemTags,
      itemVendors,
      recipeItems,
      itemStocks,
      items,
      tags,
      tagTypes,
      vendors,
      recipes,
      shelves,
      locations,
    ] = await prisma.$transaction([
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
      // in the shared test DB, and ensureDefaultLocation
      // (lib/defaultLocation.ts) returns early whenever the user already has a
      // default — so the next run starts with the previous run's locations
      // instead of a fresh default.
      prisma.location.deleteMany({ where: { userId } }),
    ])
    // One key per model the transaction above deletes — 14. The key names match
    // `CLEANUP_MODEL_KEYS` in e2e/helpers/cloudTeardown.ts, which checks that
    // every one of them is present in this body. The 11 names shared with
    // `PurgeResult` (apps/server/src/schema/purge.graphql) are spelled the same
    // way there.
    res.json({
      ok: true,
      deleted: {
        inventoryLogs: inventoryLogs.count,
        cartItems: cartItems.count,
        carts: carts.count,
        itemTags: itemTags.count,
        itemVendors: itemVendors.count,
        recipeItems: recipeItems.count,
        itemStocks: itemStocks.count,
        items: items.count,
        tags: tags.count,
        tagTypes: tagTypes.count,
        vendors: vendors.count,
        recipes: recipes.count,
        shelves: shelves.count,
        locations: locations.count,
      },
    })
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
