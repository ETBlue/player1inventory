import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'apps/server/src/schema/*.graphql',
  generates: {
    'apps/server/src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../context.js#Context',
        useIndexSignature: true,
      },
    },
    'apps/web/src/generated/graphql.ts': {
      documents: 'apps/web/src/apollo/operations/*.graphql',
      plugins: ['typescript', 'typescript-operations', 'typescript-react-apollo'],
      config: {
        withHooks: true,
      },
    },
  },
}

export default config
