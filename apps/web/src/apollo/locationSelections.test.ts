import type { DocumentNode } from '@apollo/client'
import { describe, expect, it } from 'vitest'
import {
  CreateLocationDocument,
  GetHouseholdLocationsDocument,
  GetLocationsDocument,
  ReorderLocationsDocument,
  UpdateLocationDocument,
} from '@/generated/graphql'

// A mutation whose result is written into a cached query must select every
// field that query selects (review of households H5 task F.1). If it does
// not, the cached query is incomplete: Apollo reads it back as missing data,
// and a page that reads it can show nothing or refetch.
//
// F.1 added `myRole` to GetLocations and forgot the mutations. The one that
// matters most is ReorderLocations: `useReorderLocations`
// (hooks/useLocations.ts) writes its list straight into GetLocations with
// `cache.writeQuery`. Create and Update are merged into the same normalized
// `Location` entity that both location queries read.
//
// When you add a field to GetLocations or GetHouseholdLocations, add it to the
// three mutations too. When you add a mutation whose result is written into
// either query, add a row here.

/** The field names selected under the first root field of a document. */
function rootFieldSelection(doc: DocumentNode): string[] {
  const op = doc.definitions.find((d) => d.kind === 'OperationDefinition')
  if (!op || op.kind !== 'OperationDefinition') throw new Error('no operation')
  const root = op.selectionSet.selections[0]
  if (!root || root.kind !== 'Field' || !root.selectionSet) {
    throw new Error('the first root field has no selection set')
  }
  return names(root.selectionSet)
}

type SelectionSet = NonNullable<
  Extract<
    Extract<
      DocumentNode['definitions'][number],
      { kind: 'OperationDefinition' }
    >['selectionSet']['selections'][number],
    { kind: 'Field' }
  >['selectionSet']
>

function names(set: SelectionSet): string[] {
  return set.selections.flatMap((s) =>
    s.kind === 'Field' ? [s.name.value] : [],
  )
}

const WRITES: Array<{
  mutation: string
  doc: DocumentNode
  into: Array<[string, DocumentNode]>
}> = [
  {
    mutation: 'ReorderLocations',
    doc: ReorderLocationsDocument,
    into: [
      ['GetLocations', GetLocationsDocument],
      ['GetHouseholdLocations', GetHouseholdLocationsDocument],
    ],
  },
  {
    mutation: 'CreateLocation',
    doc: CreateLocationDocument,
    into: [
      ['GetLocations', GetLocationsDocument],
      ['GetHouseholdLocations', GetHouseholdLocationsDocument],
    ],
  },
  {
    mutation: 'UpdateLocation',
    doc: UpdateLocationDocument,
    into: [
      ['GetLocations', GetLocationsDocument],
      ['GetHouseholdLocations', GetHouseholdLocationsDocument],
    ],
  },
]

describe('location mutation results cover the location queries', () => {
  for (const { mutation, doc, into } of WRITES) {
    for (const [query, queryDoc] of into) {
      it(`${mutation} selects every field of ${query}`, () => {
        const selected = new Set(rootFieldSelection(doc))
        const missing = rootFieldSelection(queryDoc).filter(
          (f) => !selected.has(f),
        )
        expect(missing).toEqual([])
      })
    }
  }

  it('reads real selections (a guard against an empty list passing)', () => {
    expect(rootFieldSelection(GetLocationsDocument)).toContain('myRole')
    expect(rootFieldSelection(GetHouseholdLocationsDocument)).toContain(
      'hasOrganizer',
    )
  })
})
