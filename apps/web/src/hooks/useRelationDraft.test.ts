// The draft of the item Tags, Vendors and Recipes tabs: a press changes only
// the screen, and Save sends the list on screen.
// Design: docs/features/items/2026-11-27-item-relations-save-design.md,
// *The draft* (the press rule and the clean-up table).
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  cleanUpRelationDraft,
  pressRelation,
  type RelationDraftOptions,
  useRelationDraft,
} from './useRelationDraft'

const EMPTY = { added: [], removed: [] }

describe('pressRelation (the press rule)', () => {
  it('a press on a badge that is off puts it in added', () => {
    expect(pressRelation(EMPTY, ['a'], 'b')).toEqual({
      added: ['b'],
      removed: [],
    })
  })

  it('a press on a saved badge that is on puts it in removed', () => {
    expect(pressRelation(EMPTY, ['a'], 'a')).toEqual({
      added: [],
      removed: ['a'],
    })
  })

  it('a second press on an added badge takes it out of added', () => {
    expect(pressRelation({ added: ['b'], removed: [] }, ['a'], 'b')).toEqual(
      EMPTY,
    )
  })

  it('a second press on a removed badge takes it out of removed', () => {
    expect(pressRelation({ added: [], removed: ['a'] }, ['a'], 'a')).toEqual(
      EMPTY,
    )
  })

  it('with canAdd false, a press on a badge that is off does nothing', () => {
    // Recipes: a non-consumable item cannot be added to a recipe
    expect(pressRelation(EMPTY, ['a'], 'b', { canAdd: false })).toEqual(EMPTY)
  })

  it('with canAdd false, a press can still remove, and undo a remove', () => {
    const removed = pressRelation(EMPTY, ['a'], 'a', { canAdd: false })
    expect(removed).toEqual({ added: [], removed: ['a'] })
    expect(pressRelation(removed, ['a'], 'a', { canAdd: false })).toEqual(EMPTY)
  })
})

describe('cleanUpRelationDraft (the clean-up on every new saved list)', () => {
  const base = {
    previousExistingIds: ['a', 'b', 'c'],
    existingIds: ['a', 'b', 'c'],
  }

  it('an id in added that is now in saved leaves added', () => {
    expect(
      cleanUpRelationDraft({
        ...base,
        saved: ['a', 'b'],
        added: ['b'],
        removed: [],
      }),
    ).toEqual(EMPTY)
  })

  it('an id in removed that is no longer in saved leaves removed', () => {
    expect(
      cleanUpRelationDraft({ ...base, saved: [], added: [], removed: ['a'] }),
    ).toEqual(EMPTY)
  })

  it('an id another tab added, that this person did not press, changes nothing', () => {
    // It is in saved, so it shows as selected; the draft stays empty
    expect(
      cleanUpRelationDraft({
        ...base,
        saved: ['a', 'c'],
        added: [],
        removed: [],
      }),
    ).toEqual(EMPTY)
  })

  it('an id another tab removed, that this person pressed on, stays in added', () => {
    // The person had pressed `b` on; another tab removed `b` from saved
    expect(
      cleanUpRelationDraft({ ...base, saved: [], added: ['b'], removed: [] }),
    ).toEqual({ added: ['b'], removed: [] })
  })

  it('an id in added whose row was in the list and is gone now leaves added', () => {
    // Another tab deleted tag `b` (owner answer 10A)
    expect(
      cleanUpRelationDraft({
        saved: ['a'],
        previousExistingIds: ['a', 'b'],
        existingIds: ['a'],
        added: ['b'],
        removed: [],
      }),
    ).toEqual(EMPTY)
  })

  it('the trap: an id in added that was never in the list yet is KEPT', () => {
    // A row just created from the tab: the create answered, the list
    // refetch has not landed yet. Dropping it would bring back issue #402.
    expect(
      cleanUpRelationDraft({
        saved: ['a'],
        previousExistingIds: ['a'],
        existingIds: ['a'],
        added: ['new'],
        removed: [],
      }),
    ).toEqual({ added: ['new'], removed: [] })
  })

  it('while the list is not loaded, an added id is kept', () => {
    expect(
      cleanUpRelationDraft({
        saved: [],
        previousExistingIds: undefined,
        existingIds: undefined,
        added: ['b'],
        removed: [],
      }),
    ).toEqual({ added: ['b'], removed: [] })
  })

  it('Recipes: when the item is no longer consumable, added is emptied and removed stays', () => {
    expect(
      cleanUpRelationDraft({
        ...base,
        saved: ['a'],
        added: ['b'],
        removed: ['a'],
        canAdd: false,
      }),
    ).toEqual({ added: [], removed: ['a'] })
  })

  it('read only: both sets are emptied', () => {
    // A manager demoted in another tab (owner answer 5A)
    expect(
      cleanUpRelationDraft({
        ...base,
        saved: ['a'],
        added: ['b'],
        removed: ['a'],
        canEdit: false,
      }),
    ).toEqual(EMPTY)
  })
})

describe('useRelationDraft', () => {
  type Props = {
    saved: string[]
    existingIds: string[] | undefined
  } & RelationDraftOptions

  function setup(initial: Props) {
    return renderHook(
      ({ saved, existingIds, ...options }: Props) =>
        useRelationDraft(saved, existingIds, options),
      { initialProps: initial },
    )
  }

  it('starts clean and shows the saved list', () => {
    const { result } = setup({ saved: ['a'], existingIds: ['a', 'b'] })
    expect(result.current.dirty).toBe(false)
    expect(result.current.shown).toEqual(['a'])
  })

  it('a press changes shown and makes the draft dirty; a second press undoes it', () => {
    const { result } = setup({ saved: ['a'], existingIds: ['a', 'b'] })

    act(() => result.current.press('b'))
    expect(result.current.shown).toEqual(['a', 'b'])
    expect(result.current.dirty).toBe(true)

    act(() => result.current.press('a'))
    expect(result.current.shown).toEqual(['b'])
    expect(result.current.added).toEqual(['b'])
    expect(result.current.removed).toEqual(['a'])

    act(() => result.current.press('b'))
    act(() => result.current.press('a'))
    expect(result.current.shown).toEqual(['a'])
    expect(result.current.dirty).toBe(false)
  })

  it('add puts a new row in added, and reset empties the draft', () => {
    const { result } = setup({ saved: ['a'], existingIds: ['a'] })

    act(() => result.current.add('new'))
    expect(result.current.shown).toEqual(['a', 'new'])
    expect(result.current.dirty).toBe(true)

    act(() => result.current.reset())
    expect(result.current.shown).toEqual(['a'])
    expect(result.current.dirty).toBe(false)
  })

  it('another tab saving the same press makes the draft clean again', () => {
    const { result, rerender } = setup({
      saved: ['a'],
      existingIds: ['a', 'b'],
    })
    act(() => result.current.press('b'))
    expect(result.current.dirty).toBe(true)

    // When the saved list is read again and now holds `b`
    rerender({ saved: ['a', 'b'], existingIds: ['a', 'b'] })

    // Then nothing differs from the server any more
    expect(result.current.dirty).toBe(false)
    expect(result.current.shown).toEqual(['a', 'b'])
  })

  it('the trap: a new row stays pressed when the list refetch lands later', () => {
    const { result, rerender } = setup({ saved: ['a'], existingIds: ['a'] })
    // The create answered; the row is not in the list yet
    act(() => result.current.add('new'))
    // An unrelated read of the saved list lands first
    rerender({ saved: ['a'], existingIds: ['a'] })
    expect(result.current.added).toEqual(['new'])

    // Then the list refetch lands with the new row
    rerender({ saved: ['a'], existingIds: ['a', 'new'] })
    expect(result.current.shown).toEqual(['a', 'new'])
    expect(result.current.dirty).toBe(true)
  })

  it('a pressed row deleted in another tab leaves the draft', () => {
    const { result, rerender } = setup({
      saved: ['a'],
      existingIds: ['a', 'b'],
    })
    act(() => result.current.press('b'))

    rerender({ saved: ['a'], existingIds: ['a'] })

    expect(result.current.dirty).toBe(false)
    expect(result.current.shown).toEqual(['a'])
  })

  it('read only: a press does nothing, and a draft is dropped when the role is lost', () => {
    const { result, rerender } = setup({
      saved: ['a'],
      existingIds: ['a', 'b'],
      canEdit: true,
    })
    act(() => result.current.press('b'))
    expect(result.current.dirty).toBe(true)

    // When the role is lost (owner answer 5A)
    rerender({ saved: ['a'], existingIds: ['a', 'b'], canEdit: false })
    expect(result.current.dirty).toBe(false)
    expect(result.current.shown).toEqual(['a'])

    act(() => result.current.press('b'))
    act(() => result.current.add('c'))
    expect(result.current.dirty).toBe(false)
  })

  // The list of rows can go back to "not loaded" (a refetch after a cache
  // reset). The hook keeps the last list it saw, so the check that decides
  // whether a clean-up is due must compare with that kept list. Before the
  // fix it compared with `undefined`, never matched, and set state on every
  // render: "Too many re-renders".
  it('the list of rows going back to not loaded keeps the draft and does not loop', () => {
    const { result, rerender } = setup({
      saved: ['a'],
      existingIds: ['a', 'b', 'c'],
    })
    // Given a press made while the list was loaded
    act(() => result.current.press('b'))

    // When the list of rows is not loaded any more
    rerender({ saved: ['a'], existingIds: undefined })

    // Then the draft is kept
    expect(result.current.added).toEqual(['b'])
    expect(result.current.shown).toEqual(['a', 'b'])

    // And the "was in the list, gone now" rule still uses the last list:
    // when the list comes back without `b`, the press leaves the draft
    rerender({ saved: ['a'], existingIds: ['a', 'c'] })
    expect(result.current.added).toEqual([])
    expect(result.current.dirty).toBe(false)
  })

  it('Recipes: the item turning non-consumable drops added, keeps removed', () => {
    const { result, rerender } = setup({
      saved: ['a'],
      existingIds: ['a', 'b'],
      canAdd: true,
    })
    act(() => result.current.press('b'))
    act(() => result.current.press('a'))

    rerender({ saved: ['a'], existingIds: ['a', 'b'], canAdd: false })

    expect(result.current.added).toEqual([])
    expect(result.current.removed).toEqual(['a'])
    expect(result.current.dirty).toBe(true)
  })
})
