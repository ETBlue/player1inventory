import { expect, type Locator } from '@playwright/test'

// Document-order assertions for list partitions.
//
// The "N not stocked here" divider splits a group list into an above half and a
// below half. Asserting only that both a card and the divider are *visible*
// cannot tell a working partition from a broken one — the interesting fact is
// which side of the divider a card lands on.
//
// `compareDocumentPosition` is used rather than bounding-box y-coordinates or a
// shared-parent nth-child index: the divider and the cards it separates are
// siblings today, but a wrapper introduced by a future layout change would
// silently turn an index-based assertion into a no-op, and a y-comparison is
// wrong the moment anything is scrolled or absolutely positioned.
export async function expectInDocumentOrder(earlier: Locator, later: Locator) {
  await expect(earlier).toBeVisible()
  await expect(later).toBeVisible()

  const laterHandle = await later.elementHandle()
  if (!laterHandle) throw new Error('expectInDocumentOrder: "later" resolved to no element')

  try {
    const precedes = await earlier.evaluate(
      (node, other) =>
        Boolean(
          node.compareDocumentPosition(other as Node) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      laterHandle,
    )
    expect(
      precedes,
      `expected the first element to come before the second in document order`,
    ).toBe(true)
  } finally {
    await laterHandle.dispose()
  }
}
