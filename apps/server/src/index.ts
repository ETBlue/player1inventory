import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { clerkMiddleware, getAuth } from '@clerk/express'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import { DEFAULT_CLIENT_ORIGIN, DEFAULT_PORT, GRAPHQL_PATH } from './constants.js'
import { connectDB } from './db.js'
import { typeDefs } from './schema/index.js'
import { resolvers } from './resolvers/index.js'
import { ItemModel } from './models/Item.model.js'
import { TagModel, TagTypeModel } from './models/Tag.model.js'
import { VendorModel } from './models/Vendor.model.js'
import { RecipeModel } from './models/Recipe.model.js'
import { CartItemModel, CartModel } from './models/Cart.model.js'
import { InventoryLogModel } from './models/InventoryLog.model.js'
import type { Context } from './context.js'

const E2E_TEST_MODE = !!process.env.E2E_TEST_MODE

await connectDB()

const app = express()
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN }))
app.use(express.json())
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
    await Promise.all([
      ItemModel.deleteMany({ userId }),
      TagModel.deleteMany({ userId }),
      TagTypeModel.deleteMany({ userId }),
      VendorModel.deleteMany({ userId }),
      RecipeModel.deleteMany({ userId }),
      CartModel.deleteMany({ userId }),
      CartItemModel.deleteMany({ userId }),
      InventoryLogModel.deleteMany({ userId }),
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
app.listen(PORT, () => {
  console.log(`Server ready at http://localhost:${PORT}${GRAPHQL_PATH}`)
})
