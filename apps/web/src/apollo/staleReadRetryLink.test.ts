import {
  ApolloClient,
  ApolloLink,
  gql,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { describe, expect, it } from 'vitest'
import {
  createStaleReadRetryLink,
  MAX_QUERY_ATTEMPTS,
} from './staleReadRetryLink'

const LIST = gql`
  query List {
    list
  }
`
const SAVE = gql`
  mutation Save {
    save
  }
`

type Pending = {
  operationName: string
  answer: (data: Record<string, unknown>) => void
  fail: (error: Error) => void
}

/**
 * A terminating link that holds every request until the test answers it.
 * `sent` lists each request in order, so a test can count how many times a
 * query was really sent.
 */
function heldServer() {
  const sent: Pending[] = []
  const link = new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        sent.push({
          operationName: operation.operationName ?? '?',
          answer: (data) => {
            observer.next({ data })
            observer.complete()
          },
          fail: (error) => observer.error(error),
        })
      }),
  )
  return { sent, link }
}

function clientWith(link: ApolloLink) {
  return new ApolloClient({
    link: createStaleReadRetryLink().concat(link),
    cache: new InMemoryCache(),
  })
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function last(sent: Pending[], operationName: string): Pending {
  const found = sent.filter((p) => p.operationName === operationName).pop()
  if (!found) throw new Error(`no ${operationName} was sent`)
  return found
}

function count(sent: Pending[], operationName: string) {
  return sent.filter((p) => p.operationName === operationName).length
}

describe('createStaleReadRetryLink', () => {
  it('sends a query once when no mutation answers while it waits', async () => {
    // Given a query that is waiting for its answer
    const server = heldServer()
    const client = clientWith(server.link)
    const query = client.query({ query: LIST, fetchPolicy: 'network-only' })
    await tick()

    // When it answers with no mutation in between
    last(server.sent, 'List').answer({ list: ['a'] })

    // Then that answer is passed on, and the query was sent once
    expect((await query).data).toEqual({ list: ['a'] })
    expect(count(server.sent, 'List')).toBe(1)
  })

  it('sends a query again when a mutation answers while it waits', async () => {
    // Given a query that is waiting for its answer, and a mutation
    const server = heldServer()
    const client = clientWith(server.link)
    const query = client.query({ query: LIST, fetchPolicy: 'network-only' })
    const mutation = client.mutate({ mutation: SAVE })
    await tick()

    // When the mutation answers first, then the query's old answer arrives
    last(server.sent, 'Save').answer({ save: true })
    await mutation
    last(server.sent, 'List').answer({ list: [] })
    await tick()

    // Then the query was sent again, and only the new answer is passed on
    expect(count(server.sent, 'List')).toBe(2)
    last(server.sent, 'List').answer({ list: ['saved'] })
    expect((await query).data).toEqual({ list: ['saved'] })
  })

  it('also sends a query again when the mutation failed', async () => {
    // Given a query that is waiting, and a mutation that will fail
    const server = heldServer()
    const client = clientWith(server.link)
    const query = client.query({ query: LIST, fetchPolicy: 'network-only' })
    const mutation = client.mutate({ mutation: SAVE }).catch(() => 'failed')
    await tick()

    // When the mutation fails (the server may still have saved it)
    last(server.sent, 'Save').fail(new Error('connection reset'))
    expect(await mutation).toBe('failed')
    last(server.sent, 'List').answer({ list: [] })
    await tick()

    // Then the query is sent again
    expect(count(server.sent, 'List')).toBe(2)
    last(server.sent, 'List').answer({ list: ['saved'] })
    expect((await query).data).toEqual({ list: ['saved'] })
  })

  it('does not send a query again when the mutation answered before it was sent', async () => {
    // Given a mutation that has already answered
    const server = heldServer()
    const client = clientWith(server.link)
    const mutation = client.mutate({ mutation: SAVE })
    await tick()
    last(server.sent, 'Save').answer({ save: true })
    await mutation

    // When a query is sent after that and answers
    const query = client.query({ query: LIST, fetchPolicy: 'network-only' })
    await tick()
    last(server.sent, 'List').answer({ list: ['saved'] })

    // Then it was sent once
    expect((await query).data).toEqual({ list: ['saved'] })
    expect(count(server.sent, 'List')).toBe(1)
  })

  it(`stops after ${MAX_QUERY_ATTEMPTS} sends and passes the last answer on`, async () => {
    // Given a query that is waiting
    const server = heldServer()
    const client = clientWith(server.link)
    const query = client.query({ query: LIST, fetchPolicy: 'network-only' })
    await tick()

    // When a mutation answers during every one of its attempts
    for (let attempt = 1; attempt <= MAX_QUERY_ATTEMPTS; attempt += 1) {
      const mutation = client.mutate({ mutation: SAVE })
      await tick()
      last(server.sent, 'Save').answer({ save: true })
      await mutation
      last(server.sent, 'List').answer({ list: [`attempt ${attempt}`] })
      await tick()
    }

    // Then the query was sent exactly the limit, and the last answer is kept
    expect(count(server.sent, 'List')).toBe(MAX_QUERY_ATTEMPTS)
    expect((await query).data).toEqual({
      list: [`attempt ${MAX_QUERY_ATTEMPTS}`],
    })
  })

  it('a refetch sent after the mutation answers is sent once', async () => {
    // Given a server that answers every request a little later, and no query
    // in flight
    const sent: string[] = []
    const delayedLink = new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          const name = operation.operationName ?? '?'
          sent.push(name)
          const timer = setTimeout(() => {
            observer.next({
              data: name === 'Save' ? { save: true } : { list: ['saved'] },
            })
            observer.complete()
          }, 5)
          return () => clearTimeout(timer)
        }),
    )
    const client = clientWith(delayedLink)

    // When a mutation answers and Apollo sends its refetch
    await client.mutate({
      mutation: SAVE,
      refetchQueries: [{ query: LIST }],
      awaitRefetchQueries: true,
    })

    // Then the refetch joined nothing, and was sent exactly once
    expect(sent).toEqual(['Save', 'List'])
  })

  it('leaves no request open after unsubscribe when the server answers at once', async () => {
    // Given a mutation the server holds
    let heldSave:
      | { next: (r: { data: unknown }) => void; complete: () => void }
      | undefined
    let listSends = 0
    const open = new Set<number>()
    const syncLink = new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          if (operation.operationName === 'Save') {
            heldSave = observer
            return
          }
          listSends += 1
          if (listSends === 1) {
            // The held save answers while this query is being sent, and then
            // the query answers at once, before `subscribe` returns. So the
            // link starts its resend inside that same `subscribe` call.
            heldSave?.next({ data: { save: true } })
            heldSave?.complete()
            observer.next({ data: { list: [] } })
            observer.complete()
            return
          }
          // Later sends are held, and record whether they are still open
          const id = listSends
          open.add(id)
          return () => open.delete(id)
        }),
    )
    const client = clientWith(syncLink)
    const mutation = client.mutate({ mutation: SAVE })
    await tick()

    // When a query is watched, sent again, and then unsubscribed
    const watching = client
      .watchQuery({ query: LIST, fetchPolicy: 'network-only' })
      .subscribe(() => {})
    await mutation
    await tick()
    expect(listSends).toBe(2)
    expect(open.size).toBe(1)
    watching.unsubscribe()
    await tick()

    // Then the resend was cancelled too
    expect(open.size).toBe(0)
  })

  it('passes a query error on without sending the query again', async () => {
    // Given a query that is waiting, and a mutation that answers first
    const server = heldServer()
    const client = clientWith(server.link)
    const query = client
      .query({ query: LIST, fetchPolicy: 'network-only' })
      .then(
        () => 'answered',
        () => 'failed',
      )
    const mutation = client.mutate({ mutation: SAVE })
    await tick()
    last(server.sent, 'Save').answer({ save: true })
    await mutation

    // When the query fails
    last(server.sent, 'List').fail(new Error('Failed to fetch'))

    // Then the error is passed on, and the query was sent once
    expect(await query).toBe('failed')
    expect(count(server.sent, 'List')).toBe(1)
  })
})
