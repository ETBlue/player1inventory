# Coding Standards Automation Setup

**Goal:** Automate code formatting, quality checks, and commit message validation using git hooks.

**Scope:** Pre-commit formatting, pre-push quality gates, Conventional Commits enforcement.

**Architecture:** Husky for git hooks, lint-staged for staged file processing, commitlint for message validation.

---

## Tools & Dependencies

**New devDependencies:**

| Package | Purpose |
|---------|---------|
| `husky` | Git hooks manager |
| `lint-staged` | Run formatters only on staged files |
| `@commitlint/cli` | Validate commit messages |
| `@commitlint/config-conventional` | Conventional Commits rules |

**Existing tools leveraged:**
- `biome` - Format + lint (already configured)
- `vitest` - Tests (already configured)
- `tsc` - TypeScript check (already configured)

---

## Git Hooks Configuration

| Hook | When | Actions |
|------|------|---------|
| `pre-commit` | Before each commit | Format staged files with Biome |
| `commit-msg` | After writing commit message | Validate against Conventional Commits |
| `pre-push` | Before pushing to remote | TypeScript check, lint, tests |

**lint-staged config:**
```json
{
  "src/**/*.{ts,tsx}": [
    "biome check --write --unsafe"
  ]
}
```

**Allowed commit types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`

---

## File Structure

**Files to create:**

```
.husky/
├── pre-commit          # Runs lint-staged
├── commit-msg          # Runs commitlint
└── pre-push            # Runs typecheck, lint, tests

commitlint.config.js    # Commitlint configuration
```

**Files to modify:**

```
package.json            # Add devDependencies, lint-staged config, prepare script
```

---

## Implementation Order

1. Install dependencies
2. Initialize Husky
3. Create commitlint config
4. Add lint-staged config to package.json
5. Create pre-commit hook (format)
6. Create commit-msg hook (commitlint)
7. Create pre-push hook (typecheck, lint, tests)

---

## Testing Strategy

- Test pre-commit: Make a small change, commit, verify formatting runs
- Test commit-msg: Try invalid message, verify rejection
- Test commit-msg: Try valid message, verify acceptance
- Test pre-push: Push to remote, verify all checks run

---

## Rollback

If issues arise: `rm -rf .husky` and remove packages to restore previous state.
