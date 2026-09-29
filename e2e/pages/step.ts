import { test } from '@playwright/test'

// `checkRecipe` → `Check recipe`
function toWords(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Show only simple values in the step name. A Locator or Page argument would
// print as a long internal string, so it is left out.
function formatArg(arg: unknown): string | null {
  if (typeof arg === 'string') return `"${arg}"`
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg)
  return null
}

/**
 * Wrap every async method of a page object in `test.step`, so the HTML report
 * shows `Check recipe "Pasta"` instead of raw locator calls.
 *
 * Only async methods are wrapped. The `get…` methods return a Locator
 * synchronously; wrapping them would make them return a Promise and break
 * every caller.
 *
 * Only methods on the object's own class prototype are wrapped:
 * - An arrow-function class field (`foo = async () => {}`) is not on the
 *   prototype, so it is not wrapped.
 * - A page object that extends another class gets only its own methods
 *   wrapped, not the parent's.
 *
 * A wrapped method that calls another async method on `this` shows a nested
 * step, because `this` is the object that holds the wrappers.
 *
 * `box: true` makes an error point at the line in the test that called the
 * method, not at a line inside the page object.
 *
 * Call once, at the end of the constructor: `withSteps(this)`.
 * `test.step` throws outside a test or hook, so create page objects only
 * inside a test or hook.
 */
export function withSteps<T extends object>(obj: T): T {
  const proto = Object.getPrototypeOf(obj)
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue
    const fn = Object.getOwnPropertyDescriptor(proto, key)?.value
    if (typeof fn !== 'function' || fn.constructor.name !== 'AsyncFunction') continue
    Object.defineProperty(obj, key, {
      configurable: true,
      writable: true,
      value(...args: unknown[]) {
        const parts = args.map(formatArg).filter((p): p is string => p !== null)
        const title = [toWords(key), ...parts].join(' ')
        return test.step(title, () => fn.apply(obj, args), { box: true })
      },
    })
  }
  return obj
}
