import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import { DEFAULT_CLIENT_ORIGIN, DEFAULT_PORT, GRAPHQL_PATH } from './constants.js'
import { connectDB } from './db.js'
import { typeDefs } from './schema/index.js'
import { resolvers } from './resolvers/index.js'
import type { Context } from './context.js'

await connectDB()

const app = express()
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN }))
app.use(express.json())

const server = new ApolloServer<Context>({ typeDefs, resolvers })
await server.start()

app.use(
  GRAPHQL_PATH,
  expressMiddleware(server, {
    context: async () => ({ userId: null }),
  }),
)

const PORT = process.env.PORT ?? DEFAULT_PORT
app.listen(PORT, () => {
  console.log(`Server ready at http://localhost:${PORT}${GRAPHQL_PATH}`)
})
