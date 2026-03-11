import express from 'express'
import cors from 'cors'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import { typeDefs } from './schema/index.js'
import { resolvers } from './resolvers/index.js'
import type { Context } from './context.js'

const app = express()

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())

const server = new ApolloServer<Context>({ typeDefs, resolvers })
await server.start()

app.use(
  '/graphql',
  expressMiddleware(server, {
    context: async () => ({ userId: null }),
  }),
)

const PORT = process.env.PORT ?? 4000
app.listen(PORT, () => {
  console.log(`Server ready at http://localhost:${PORT}/graphql`)
})
