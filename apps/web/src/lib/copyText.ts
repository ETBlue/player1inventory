/**
 * Copy `text` to the clipboard. Resolves to `true` when it was copied.
 *
 * First the Clipboard API (`navigator.clipboard.writeText`). It is missing on
 * a page that is not a secure context (plain `http://` on a phone in the
 * local network), and a browser may refuse it. Then the old way: a hidden
 * text area, selected, and `document.execCommand('copy')`.
 *
 * `execCommand` is read through a plain function type, not through
 * `Document`, because the DOM types mark it deprecated, and the gate fails on
 * a deprecated call (TS6385). It still works in every browser this app
 * supports, and it is only the fallback.
 *
 * Used by the Members page for invite links (households H5b, task G.9).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refused or not allowed here. Try the old way below.
  }
  return copyWithTextArea(text)
}

function copyWithTextArea(text: string): boolean {
  const execCommand = (
    document as unknown as { execCommand?: (command: string) => boolean }
  ).execCommand
  if (typeof execCommand !== 'function') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return execCommand.call(document, 'copy') === true
  } catch {
    return false
  } finally {
    area.remove()
  }
}
