import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'apps/server/src/schema/*.graphql',
  generates: {
    'apps/server/src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../context.js#Context',
        useIndexSignature: true,
        // GraphQL enums become string unions, not TS enums, so a Prisma enum
        // value such as 'owner' fits the generated type as it is.
        enumsAsTypes: true,
        scalars: {
          JSON: 'Record<string, unknown>',
        },
      },
    },
    'apps/web/src/generated/graphql.ts': {
      documents: 'apps/web/src/apollo/operations/*.graphql',
      plugins: [
        { add: { content: '/* eslint-disable */\n// @ts-nocheck' } },
        'typescript',
        'typescript-operations',
        'typescript-react-apollo',
      ],
      config: {
        withHooks: true,
        apolloReactHooksImportFrom: '@apollo/client/react',
        apolloReactCommonImportFrom: '@apollo/client/react',
        withResultType: false,
        withMutationOptionsType: false,
        withMutationFn: false,
        enumsAsTypes: true,
        scalars: {
          JSON: 'Record<string, unknown>',
        },
      },
    },
  },
}

export default config
