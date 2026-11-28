import type { KeyboardEvent } from 'react'

/**
 * A key handler for an element with `role="button"` that is not a real
 * `<button>`, such as the tag, vendor and recipe badges on the item page
 * (owner answer 8A of
 * `docs/features/items/2026-11-27-item-relations-save-design.md`). Enter and
 * Space press it, like a real button. Space would scroll the page, so the
 * default action is stopped.
 *
 * A held key sends more keydown events with `repeat: true`. Those do not
 * press again, the same as a real button, so a held Enter does not flip the
 * badge many times.
 */
export function pressOnEnterOrSpace(press: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (event.repeat) return
    press()
  }
}
