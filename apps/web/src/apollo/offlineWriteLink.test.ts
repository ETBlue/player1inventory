import { ApolloLink, execute, gql, Observable } from '@apollo/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
      execute(link, { query: MUTATION }, {}).subscribe({
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
      execute(link, { query: QUERY }, {}).subscribe({
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
      execute(link, { query: MUTATION }, {}).subscribe({
        complete: resolve,
        error: resolve,
      })
    })

    // Then it reaches the network as usual
    expect(reachedNetwork).toBe(true)
  })
})
