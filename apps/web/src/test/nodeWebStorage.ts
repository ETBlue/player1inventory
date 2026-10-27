// Repoints the `localStorage` and `sessionStorage` globals at jsdom's own
// Storage objects. Runs as the FIRST entry in `setupFiles`, before
// `setup.ts`, because `setup.ts` imports `../i18n`, whose language detector
// reads `localStorage` at import time.
//
// Why this is needed: Node 25 enables the Web Storage API by default. With no
// `--localstorage-file` it still defines a `localStorage` global, and that
// placeholder has no methods. Measured on v25.8.0 inside the jsdom
// environment: `typeof localStorage` is 'object' and `localStorage.setItem`
// is undefined. Vitest's jsdom environment does not copy a window key that
// already exists on `globalThis`, so Node's placeholder shadows jsdom's
// working Storage and every test file fails with
// "localStorage.setItem is not a function".
//
// jsdom keeps its own Storage objects on the window as `_localStorage` and
// `_sessionStorage`. Both are real `Storage` instances and both work under
// Node 25 (measured: write, read, `length` and `key(0)` all behave). Pointing
// the globals at them restores exactly the Node 22 state, where
// `globalThis.localStorage === window._localStorage` is already true.
//
// On Node 22.17.1 this is a no-op: both globals are already jsdom's, so the
// identity check below returns early. Node 25 also shadows `sessionStorage`
// with a working Storage of its own, which no test fails on — it is
// repointed anyway so both globals come from one place.

/** jsdom's private handles for the two Storage areas. */
type JsdomStorageWindow = {
  _localStorage?: Storage
  _sessionStorage?: Storage
}

function repointAtJsdomStorage(
  name: 'localStorage' | 'sessionStorage',
  jsdomKey: '_localStorage' | '_sessionStorage',
): void {
  if (typeof window === 'undefined') return

  const jsdomStorage = (window as unknown as JsdomStorageWindow)[jsdomKey]
  if (!jsdomStorage || typeof jsdomStorage.setItem !== 'function') return

  // Node 22: the global already IS jsdom's object. Leave it alone.
  if (globalThis[name] === jsdomStorage) return

  // The global is an accessor property, so replace it with defineProperty
  // rather than assigning through Node's setter.
  Object.defineProperty(globalThis, name, {
    value: jsdomStorage,
    configurable: true,
    writable: true,
    enumerable: true,
  })
}

repointAtJsdomStorage('localStorage', '_localStorage')
repointAtJsdomStorage('sessionStorage', '_sessionStorage')

// Fail once, by name, instead of letting every test file report
// "localStorage.setItem is not a function" with no cause.
for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (typeof globalThis[name]?.setItem !== 'function') {
    throw new Error(
      `[test setup] \`${name}.setItem\` is not a function, so no test can run.\n` +
        `Running Node ${process.version}. Node 25 enables Web Storage by default and ` +
        `defines a method-less \`${name}\` global that shadows jsdom's working one; ` +
        `apps/web/src/test/nodeWebStorage.ts normally repoints it at jsdom's ` +
        `\`window._${name}\`, ` +
        `and that no longer worked.\n` +
        `Fix: run the Node version in .node-version at the repo root ` +
        `(\`node -v\`; \`node -e "console.log(typeof localStorage)"\` printing ` +
        `"object" outside a browser means the wrong Node). ` +
        `If jsdom renamed its internal handle, update nodeWebStorage.ts.`,
    )
  }
}
