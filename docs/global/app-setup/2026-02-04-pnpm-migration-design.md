# pnpm Migration Design

**Goal:** Migrate from npm to pnpm for better disk efficiency and monorepo readiness.

**Status:** Planned

---

## Why pnpm

| Factor | Benefit |
|--------|---------|
| **Disk space** | Shared content-addressable store across all projects |
| **Monorepo ready** | Superior workspace support for future backend addition |
| **Strictness** | Prevents phantom dependencies |
| **Speed** | 2-3x faster installs via linking vs copying |

---

## Tool Compatibility

All current tools are pnpm-compatible:

| Tool | Status |
|------|--------|
| Vite | Full support |
| Storybook | Full support (v7+) |
| Husky | Full support |
| Vitest | Full support |
| Biome | Full support |
| TanStack Router | Full support |

---

## Migration Steps

### 1. Install pnpm globally

```bash
npm install -g pnpm
```

Or via corepack (recommended):
```bash
corepack enable
corepack prepare pnpm@latest --activate
```

### 2. Remove npm artifacts

```bash
rm -rf node_modules package-lock.json
```

### 3. Install with pnpm

```bash
pnpm install
```

This creates `pnpm-lock.yaml`.

### 4. Verify everything works

```bash
pnpm run dev          # Dev server
pnpm run build        # Production build
pnpm test             # Tests
pnpm run storybook    # Storybook
pnpm run typecheck    # TypeScript
pnpm run lint         # Biome
```

### 5. Update CI (if applicable)

For GitHub Actions:

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'pnpm'
- run: pnpm install --frozen-lockfile
```

### 6. Update CLAUDE.md

Update commands section to use pnpm.

---

## Files Changed

| File | Change |
|------|--------|
| `package-lock.json` | Delete |
| `pnpm-lock.yaml` | Create (generated) |
| `CLAUDE.md` | Update commands to pnpm |
| `.github/workflows/*` | Update if CI exists |

---

## Rollback

If issues arise:

```bash
rm -rf node_modules pnpm-lock.yaml
npm install
```
