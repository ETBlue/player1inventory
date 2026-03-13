import { ApolloProvider } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { useMemo } from 'react'
import { createApolloClient } from './client'

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth()
  const client = useMemo(() => createApolloClient(() => getToken()), [getToken])
  return <ApolloProvider client={client}>{children}</ApolloProvider>
}
