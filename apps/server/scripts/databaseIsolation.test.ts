// Guards the safety check that stands between `verify-migration.ts` and
// `prisma migrate reset --force`, which drops and recreates a schema.
//
// Every URL in this file is FABRICATED. No real connection string belongs here:
// the file is committed, and a real host plus database name is exactly what the
// guard exists to keep out of reach.
import { describe, expect, it } from 'vitest'
import { assertNotAnotherDatabase, databaseIdentity } from './databaseIsolation.js'

const TEST_URL = 'postgresql://u:p@fake-host-a/dbTest'

describe('databaseIdentity', () => {
  it('is host plus database name, so the query string is ignored', () => {
    expect(databaseIdentity('postgresql://u:p@fake-host-a/dbTest?sslmode=require')).toBe(
      databaseIdentity('postgresql://u:p@fake-host-a/dbTest'),
    )
  })

  it('tells two database names on one host apart', () => {
    expect(databaseIdentity('postgresql://u:p@fake-host-a/dbA')).not.toBe(
      databaseIdentity('postgresql://u:p@fake-host-a/dbB'),
    )
  })

  it('tells one database name on two hosts apart', () => {
    expect(databaseIdentity('postgresql://u:p@fake-host-a/dbA')).not.toBe(
      databaseIdentity('postgresql://u:p@fake-host-b/dbA'),
    )
  })
})

describe('assertNotAnotherDatabase', () => {
  it('throws and names DATABASE_URL when the target is the dev database', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DATABASE_URL', TEST_URL, {
        DATABASE_URL: TEST_URL,
      }),
    ).toThrow(/TEST_DATABASE_URL resolves to the same database \(fake-host-a\/dbTest\) as DATABASE_URL/)
  })

  it('throws and names DIRECT_URL when the target is the dev direct database', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DIRECT_URL', TEST_URL, {
        DIRECT_URL: TEST_URL,
      }),
    ).toThrow(/as DIRECT_URL/)
  })

  // The gap this widening closed. The old guard compared DATABASE_URL and
  // DIRECT_URL only, so a PROD_COPY_* value pasted into TEST_DATABASE_URL
  // dropped the schema of a copy of production without complaint.
  it('throws and names PROD_COPY_DATABASE_URL when the target is a production copy', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DATABASE_URL', TEST_URL, {
        DATABASE_URL: 'postgresql://u:p@fake-host-dev/dbDev',
        DIRECT_URL: 'postgresql://u:p@fake-host-dev-direct/dbDev',
        PROD_COPY_DATABASE_URL: TEST_URL,
      }),
    ).toThrow(/as PROD_COPY_DATABASE_URL/)
  })

  it('throws and names PROD_COPY_DIRECT_URL when the target is a production copy direct URL', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DIRECT_URL', TEST_URL, {
        PROD_COPY_DIRECT_URL: TEST_URL,
      }),
    ).toThrow(/as PROD_COPY_DIRECT_URL/)
  })

  // Found by name, so a variable nobody anticipated is compared too.
  it('throws and names an arbitrary other variable ending in _URL', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DATABASE_URL', TEST_URL, {
        SOMEONES_SCRATCH_DB_URL: TEST_URL,
      }),
    ).toThrow(/as SOMEONES_SCRATCH_DB_URL/)
  })

  // This is the point of comparing host + database name instead of the raw
  // string. A re-pasted URL in a different format is still the same database.
  it('throws when the only difference is the query string', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DATABASE_URL', 'postgresql://u:p@fake-host-a/dbTest', {
        DATABASE_URL: 'postgresql://u:p@fake-host-a/dbTest?sslmode=require&pool=1',
      }),
    ).toThrow(/as DATABASE_URL/)
  })

  it('throws when the only difference is the credentials', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DATABASE_URL', 'postgresql://u:p@fake-host-a/dbTest', {
        DATABASE_URL: 'postgresql://other-user:other-pass@fake-host-a/dbTest',
      }),
    ).toThrow(/as DATABASE_URL/)
  })

  it('does not throw when every other database is a different one', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DATABASE_URL', TEST_URL, {
        DATABASE_URL: 'postgresql://u:p@fake-host-dev/dbDev',
        DIRECT_URL: 'postgresql://u:p@fake-host-dev-direct/dbDev',
        PROD_COPY_DATABASE_URL: 'postgresql://u:p@fake-host-prodcopy/dbProdCopy',
        PROD_COPY_DIRECT_URL: 'postgresql://u:p@fake-host-prodcopy-direct/dbProdCopy',
      }),
    ).not.toThrow()
  })

  // Both TEST_* names are excluded from the deny-list. On Neon the pooled host
  // and the direct host are often different names for the same database, so
  // sharing an identity is a correct setup, not a mistake.
  it('does not throw when TEST_DATABASE_URL and TEST_DIRECT_URL are the same database', () => {
    const env = {
      TEST_DATABASE_URL: TEST_URL,
      TEST_DIRECT_URL: `${TEST_URL}?sslmode=require`,
      DATABASE_URL: 'postgresql://u:p@fake-host-dev/dbDev',
    }
    expect(() => assertNotAnotherDatabase('TEST_DATABASE_URL', TEST_URL, env)).not.toThrow()
    expect(() =>
      assertNotAnotherDatabase('TEST_DIRECT_URL', `${TEST_URL}?sslmode=require`, env),
    ).not.toThrow()
  })

  it('skips an unrelated _URL variable whose value is not a URL', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DATABASE_URL', TEST_URL, {
        CALLBACK_URL: 'not a url at all',
        ANOTHER_URL: '',
        DATABASE_URL: 'postgresql://u:p@fake-host-dev/dbDev',
      }),
    ).not.toThrow()
  })

  it('ignores a variable whose name does not end in _URL', () => {
    expect(() =>
      assertNotAnotherDatabase('TEST_DATABASE_URL', TEST_URL, {
        DATABASE_URL_BACKUP_NOTE: TEST_URL,
      }),
    ).not.toThrow()
  })

  it('throws when the target itself is not a URL', () => {
    expect(() => assertNotAnotherDatabase('TEST_DATABASE_URL', 'nonsense', {})).toThrow(
      /TEST_DATABASE_URL is not a valid URL/,
    )
  })
})
