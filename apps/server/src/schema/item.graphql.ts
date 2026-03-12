export const itemTypeDefs = `#graphql
  type Item {
    id: ID!
    name: String!
    tagIds: [String!]!
    vendorIds: [String!]
    packageUnit: String
    measurementUnit: String
    amountPerPackage: Float
    targetUnit: String!
    targetQuantity: Float!
    refillThreshold: Float!
    packedQuantity: Float!
    unpackedQuantity: Float!
    consumeAmount: Float!
    dueDate: String
    estimatedDueDays: Int
    expirationThreshold: Int
    userId: String!
    familyId: String
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    items: [Item!]!
    item(id: ID!): Item
  }

  extend type Mutation {
    createItem(name: String!): Item!
    updateItem(id: ID!, input: UpdateItemInput!): Item!
    deleteItem(id: ID!): Boolean!
  }

  input UpdateItemInput {
    name: String
    tagIds: [String!]
    vendorIds: [String!]
    targetUnit: String
    targetQuantity: Float
    refillThreshold: Float
    packedQuantity: Float
    unpackedQuantity: Float
    consumeAmount: Float
    packageUnit: String
    measurementUnit: String
    amountPerPackage: Float
    dueDate: String
    estimatedDueDays: Int
    expirationThreshold: Int
  }
`
