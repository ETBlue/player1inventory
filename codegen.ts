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
      },
    },
  },
}

export default config
