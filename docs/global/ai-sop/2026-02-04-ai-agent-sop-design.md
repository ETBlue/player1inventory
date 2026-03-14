# AI Agent SOP Design

**Goal:** Establish standard operating procedures for AI agents working in this codebase.

**Scope:** Documentation updates, test format, commit/branch/PR conventions.

**Status:** Approved

---

## Documentation Updates

Before creating a PR, update all relevant documentation:

1. **CLAUDE.md** - Update if architecture, commands, or patterns change
2. **Design docs** (`docs/plans/*`) - Update if implementation diverges from plan
3. **Inline comments** - Ensure code comments reflect the changes

---

## Test Format

**Feature/integration tests** - Use "user can ..." naming with Given-When-Then comments:

```ts
it('user can create an item', async () => {
  // Given valid item data
  const itemData = { name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 }

  // When user creates the item
  const item = await createItem(itemData)

  // Then item is persisted with id and timestamps
  expect(item.id).toBeDefined()
  expect(item.createdAt).toBeInstanceOf(Date)
})
```

**Unit tests** - Keep simple naming (existing style is fine)

---

## Commits

Always include scope in commit messages:

- `feat(cart): add checkout confirmation`
- `fix(tags): prevent duplicate tag names`
- `docs(readme): update setup instructions`

---

## Branches

Use prefixes:

- `feature/` - New features (e.g., `feature/cart-checkout`)
- `fix/` - Bug fixes (e.g., `fix/tag-duplication`)
- `docs/` - Documentation only (e.g., `docs/api-reference`)

---

## Pull Requests

Include these sections in PR description:

```
## Summary
- <bullet points of what changed>

## Test Plan
- [ ] <verification steps>
```
