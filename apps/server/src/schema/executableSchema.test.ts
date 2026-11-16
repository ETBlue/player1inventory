import { ApolloServer } from '@apollo/server'
import { type GraphQLFieldResolver, type GraphQLObjectType, type GraphQLScalarType, Kind } from 'graphql'
import { describe, expect, it } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { createExecutableSchema } from './executableSchema.js'

// The schema that Apollo and the WebSocket server share (households H3c-1,
// decision P2). Before P2, Apollo built the schema itself from `typeDefs` and
// `resolvers`. These tests check that nothing in `resolvers` is lost on the
// way into the schema we now build ourselves.

type FieldResolverLike = GraphQLFieldResolver<unknown, unknown> | { subscribe?: unknown }

describe('createExecutableSchema', () => {
  const schema = createExecutableSchema()

  it('attaches every resolver function in the resolvers object to its field', () => {
    // Every object type in `resolvers` (Query, Mutation, Subscription, Recipe,
    // InventoryLog, Cart). A field resolver lands on `resolve`; a
    // subscription's `{ subscribe }` lands on `subscribe`.
    //
    // No `instanceof` and no `isObjectType` here. Under Vitest this file gets
    // `graphql`'s ESM build (`index.mjs`), but `@graphql-tools/schema` is
    // loaded by Node and gets the CommonJS build (`index.js`). graphql-js
    // refuses a type from the other copy ("Cannot use GraphQLObjectType
    // \"Query\" from another module or realm"). The running server loads only
    // the CommonJS build, so this is a test-only problem.
    let checked = 0
    for (const [typeName, fields] of Object.entries(resolvers)) {
      if (typeName === 'JSON') continue
      const type = schema.getType(typeName)
      expect(type && 'getFields' in type, `${typeName} is an object type`).toBe(true)
      const objectFields = (type as GraphQLObjectType).getFields()
      for (const [fieldName, given] of Object.entries(fields as Record<string, FieldResolverLike>)) {
        const field = objectFields[fieldName]
        expect(field, `${typeName}.${fieldName} exists`).toBeDefined()
        if (typeof given === 'function') {
          // `makeExecutableSchema` binds a field resolver to its resolver
          // object, so the schema holds `bound <name>`, not the same
          // function. The name still tells the given resolver from
          // graphql-js's default one, which is `defaultFieldResolver`.
          expect(field?.resolve?.name, `${typeName}.${fieldName}`).toBe(`bound ${given.name}`)
        } else {
          // A subscription's `subscribe` is attached as it is, not bound.
          expect(typeof given.subscribe).toBe('function')
          expect(field?.subscribe, `${typeName}.${fieldName}`).toBe(given.subscribe)
        }
        checked++
      }
    }
    // A loop that checks nothing would pass. 98 fields on 2026-11-16; the
    // 62 Mutation fields alone are more than this floor. The number only
    // proves the loop ran.
    expect(checked).toBeGreaterThan(60)
  })

  it('uses the JSON scalar from the resolvers, not a default one', () => {
    // A default scalar would parse a literal into a value. Ours gives null.
    const json = schema.getType('JSON') as GraphQLScalarType
    expect(json.parseLiteral({ kind: Kind.STRING, value: 'x' }, undefined)).toBeNull()
  })

  it('has the householdChanged subscription with its subscribe function', () => {
    const field = schema.getSubscriptionType()?.getFields().householdChanged
    expect(typeof field?.subscribe).toBe('function')
  })

  it('runs a query through Apollo when Apollo is given the schema', async () => {
    const server = new ApolloServer<Context>({ schema })
    await server.start()
    try {
      const res = await server.executeOperation(
        { query: '{ health }' },
        { contextValue: { userId: null } },
      )
      expect(res.body.kind).toBe('single')
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined()
        expect(res.body.singleResult.data).toEqual({ health: 'ok' })
      }
    } finally {
      await server.stop()
    }
  })
})
