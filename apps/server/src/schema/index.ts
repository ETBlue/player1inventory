import { itemTypeDefs } from './item.graphql.js'

export const typeDefs = `#graphql
  type Query
  type Mutation

  ${itemTypeDefs}

  extend type Query {
    health: String!
  }
`
