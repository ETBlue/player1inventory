# Brainstorming Log: pnpm Migration

**Date:** 2026-02-04

**Goal:** Evaluate pnpm vs npm for this project.

---

## Project Context

- **node_modules size:** 366MB
- **Direct dependencies:** 46 (18 prod + 28 dev)
- **package-lock.json:** 8,313 lines

---

## Q&A

**Q1: What's your primary motivation for considering pnpm?**
- User context: Future plan to switch from IndexedDB to real backend, potentially becoming a monorepo with frontend and backend
- User asked: "I heard that pnpm is good in monorepos. Is that true?"
- Answer: Yes - pnpm has superior workspace support (shared deps, symlinks, workspace protocol, parallel commands, filtering)

**Q2: Given the future monorepo plan, when would you want to switch?**
- User asked: "Other than monorepo plan, is there any other reason you may recommend pnpm over npm?"
- Answer provided:
  - pnpm advantages: disk space savings, strictness (no phantom deps), speed (2-3x faster)
  - npm advantages: zero migration, universal, good enough for single-app
  - Assessment: For single project, npm is fine. But if working on multiple Node projects or planning monorepo, pnpm is better.

**Q3: Do you work on other Node.js projects on this machine?**
- Options: Yes several / Just this one / Not sure
- Answer: **Yes, several** - pnpm's shared store would save disk space

**Q4: Any concerns about switching?**
- Options: CI compatibility / Tool compatibility / Team familiarity / No concerns
- Answer: **Tool compatibility** - Worried about Husky, Storybook, Vite
- Response: All tools fully support pnpm (Vite, Storybook v7+, Husky, Vitest, Biome, TanStack Router)

**Q5: User asked for more info on CI compatibility**
- Explained GitHub Actions setup with pnpm/action-setup@v4
- Explained auto-detection on Vercel/Netlify
- Noted potential gotchas (cache key, store location, first run time)

---

## Decision

**Switch to pnpm** based on:
1. Multiple Node.js projects on same machine → disk space savings
2. Future monorepo plan → pnpm workspaces are superior
3. All tools compatible → low risk
4. Migration effort is low (~15 min)
