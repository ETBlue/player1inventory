// Run with: pnpm test:spec
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findSecrets } from './secrets.mjs'

describe('findSecrets', () => {
  it('finds nothing in clean text', () => {
    assert.deepEqual(
      findSecrets('{"env":{"VITE_GRAPHQL_HTTP_URL":"http://localhost:4000"}}'),
      [],
    )
  })

  // One case per pattern, each written the way it would appear in a report.
  const cases = [
    ['sk_live', 'CLERK_SECRET_KEY=sk_live_abc123'],
    ['sk_test', '"VITE_CLERK_SECRET":"sk_test_abc123"'],
    ['DATABASE_URL', '"TEST_DATABASE_URL":"x"'],
    ['postgres://', 'postgres://user:pw@host/db'],
    ['postgresql://', 'postgresql://user:pw@host/db'],
    ['BEGIN PRIVATE KEY', '-----BEGIN PRIVATE KEY-----'],
  ]
  for (const [pattern, text] of cases) {
    it(`finds ${pattern}`, () => assert.ok(findSecrets(text).includes(pattern)))
  }

  it('does not flag a Clerk publishable key', () => {
    assert.deepEqual(
      findSecrets('"VITE_CLERK_PUBLISHABLE_KEY":"pk_test_ZmxlZXQtbW9uYXJjaA"'),
      [],
    )
  })
})
