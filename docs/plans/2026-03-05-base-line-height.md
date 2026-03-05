# Base Line-Height Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change the body base line-height from `1em` to `1.25em` to prevent descender clipping under `overflow: hidden`.

**Architecture:** One-line change in the `body` rule in `src/design-tokens/theme.css`. No logic, no data, no component changes.

**Tech Stack:** Tailwind CSS v4, Vite, Storybook (for visual verification)

---

### Task 1: Change base line-height in theme.css

**Files:**
- Modify: `src/design-tokens/theme.css:218`

**Step 1: Open the file and locate the body rule**

In `src/design-tokens/theme.css`, find:

```css
body {
  background-color: var(--color-background-base);
  color: var(--color-foreground-default);
  line-height: 1em;
}
```

**Step 2: Change `line-height: 1em` to `line-height: 1.25em`**

Result:

```css
body {
  background-color: var(--color-background-base);
  color: var(--color-foreground-default);
  line-height: 1.25em;
}
```

**Step 3: Run the dev server and visually verify**

```bash
pnpm dev
```

Open the app in the browser. Check a few item cards, tag badges, and vendor names. Confirm:
- No layout shifts or unexpected spacing changes
- Descenders on letters like g, p, q, y are not clipped

**Step 4: Commit**

```bash
git add src/design-tokens/theme.css
git commit -m "fix(ux): set base line-height to 1.25em to prevent descender clipping"
```
