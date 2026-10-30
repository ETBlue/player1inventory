import { ApolloLink, execute, gql, Observable } from '@apollo/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { noopApolloClient } from '@/test/apolloStub'

const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}))

import { OfflineWriteError, offlineWriteLink } from './offlineWriteLink'

const MUTATION = gql`
  mutation AddItem {
    addItem(name: "Milk") {
      id
    }
  }
`

const QUERY = gql`
  query GetItems {
    items {
      id
    }
  }
`

let reachedNetwork = false

const fakeNetwork = new ApolloLink(() => {
  reachedNetwork = true
  return new Observable((observer) => {
    observer.next({ data: { ok: true } })
    observer.complete()
  })
})

// `execute`'s third argument is `ApolloLink.ExecuteContext`, whose only field is
// the client that issued the request
// (node_modules/@apollo/client/link/core/ApolloLink.d.ts:12-17). Apollo hangs it
// off `operation.client` in `createOperation` and reads nothing else from it,
// and `offlineWriteLink` reads only `operation.query`
// (src/apollo/offlineWriteLink.ts:27). So a real, empty client is the whole
// fixture.
const EXECUTE_CONTEXT: ApolloLink.ExecuteContext = { client: noopApolloClient }

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

afterEach(() => {
  reachedNetwork = false
  toastErrorMock.mockClear()
  vi.restoreAllMocks()
})

describe('offlineWriteLink', () => {
  it('user sees an error instead of a hang when saving offline', async () => {
    // Given the device is offline
    setOnLine(false)
    const link = offlineWriteLink.concat(fakeNetwork)

    // When a mutation runs
    const error = await new Promise<Error>((resolve) => {
      execute(link, { query: MUTATION }, EXECUTE_CONTEXT).subscribe({
        error: resolve,
        next: () => resolve(new Error('should not succeed')),
      })
    })

    // Then it fails at once, never reaches the network, and tells the user
    expect(error).toBeInstanceOf(OfflineWriteError)
    expect(reachedNetwork).toBe(false)
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
  })

  it('user can still read cached data while offline', async () => {
    // Given the device is offline
    setOnLine(false)
    const link = offlineWriteLink.concat(fakeNetwork)

    // When a query runs
    await new Promise<void>((resolve) => {
      execute(link, { query: QUERY }, EXECUTE_CONTEXT).subscribe({
        complete: resolve,
        error: resolve,
      })
    })

    // Then the query is NOT blocked — only writes are
    expect(reachedNetwork).toBe(true)
  })

  it('user can save normally when online', async () => {
    // Given the device is online
    setOnLine(true)
    const link = offlineWriteLink.concat(fakeNetwork)

    // When a mutation runs
    await new Promise<void>((resolve) => {
      execute(link, { query: MUTATION }, EXECUTE_CONTEXT).subscribe({
        complete: resolve,
        error: resolve,
      })
    })

    // Then it reaches the network as usual
    expect(reachedNetwork).toBe(true)
  })
})
