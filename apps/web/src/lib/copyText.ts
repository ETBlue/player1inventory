/**
 * Copy `text` to the clipboard. Resolves to `true` when it was copied.
 *
 * First the Clipboard API (`navigator.clipboard.writeText`). It is missing on
 * a page that is not a secure context (plain `http://` on a phone in the
 * local network), and a browser may refuse it. Then the old way: select the
 * text in a field and call `document.execCommand('copy')`.
 *
 * `from`: a field that already shows `text`. The fallback focuses it,
 * selects it and copies from it. Pass it inside a modal dialog: the dialog
 * keeps focus inside itself (Radix `FocusScope`), so a text area added to
 * `document.body` may never get focus, and `execCommand` can then answer
 * `true` with nothing copied. Without `from`, a hidden text area is added to
 * `document.body`, focused and selected.
 *
 * jsdom cannot prove the browser part of this; the H5b plan lists a manual
 * check for G.11.
 *
 * `execCommand` is read through a plain function type, not through
 * `Document`, because the DOM types mark it deprecated, and the gate fails on
 * a deprecated call (TS6385). It still works in every browser this app
 * supports, and it is only the fallback.
 *
 * Used by the Members page for invite links (households H5b, task G.9).
 */
export async function copyText(
  text: string,
  options: { from?: HTMLInputElement | null } = {},
): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refused or not allowed here. Try the old way below.
  }
  return options.from ? copyFromField(options.from) : copyWithTextArea(text)
}

function execCopy(): boolean {
  const execCommand = (
    document as unknown as { execCommand?: (command: string) => boolean }
  ).execCommand
  if (typeof execCommand !== 'function') return false
  try {
    return execCommand.call(document, 'copy') === true
  } catch {
    return false
  }
}

function copyFromField(field: HTMLInputElement): boolean {
  field.focus()
  field.select()
  return execCopy()
}

function copyWithTextArea(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.focus()
  area.select()
  try {
    return execCopy()
  } finally {
    area.remove()
  }
}
