# Brainstorming — location switcher in the desktop sidebar

**Date:** 2026-08-22
**Participants:** ETBlue (designer), Claude
**Outcome:** design doc `2026-08-22-design-sidebar-location-switcher.md`

## The requirement

> RWD requirement on desktop: render location switcher in sidebar, instead of
> rendering it in the top navbar of the main area

## What the code said

`components/global/Sidebar/Sidebar.tsx` is `hidden lg:flex`, `w-56`, rendered by
`components/global/Layout/Layout.tsx`. It returns `null` on fullscreen pages
(`/onboarding`, `/items/*`, `/settings/tags|vendors|recipes|shelves`).

The switcher currently has **11 toolbar mount sites**: the three pantry group
views, the three pantry detail views, `PantryListView`, `routes/cooking.tsx`,
`routes/shopping/index.tsx`, `routes/shopping/$vendorId.tsx`.

**Checked before proposing anything:** every one of those 11 sites is on a page
where the sidebar renders. No page loses the switcher by this move. The
fullscreen pages that suppress the sidebar do not mount a switcher today either,
so their behaviour is unchanged.

## Q — where in the sidebar?

Three options offered, with mockups: under the app title above the nav;
pinned to the bottom; or replacing the app title outright.

**Answer: under the app title, above the nav links.**

Rationale recorded at the time: it reads as the context that scopes everything
below it — the nav links and the page they open — which is where workspace and
project switchers conventionally sit. "Bottom" would have put a
frequently-changed control furthest from the eye; "replacing the title" would
have cost the wordmark and forced rework of the sr-only heading logic in
`Layout.tsx`.

## Consequence surfaced by the mockup — a second visual variant is needed

The approved mockup shows `📍 Home ▾` — the location **name**. The component
today renders an icon-sized `Button` containing only the **first letter**
(`LocationSwitcher.tsx`: `size="icon"`, `initial = name.charAt(0).toUpperCase()`).
A single-letter glyph in a 224px sidebar column would read as a bug.

So this is not a pure remount: the component needs a second presentation. The
compact glyph stays correct for the mobile toolbar, where horizontal space is
contested; the sidebar gets a full-width variant showing the name.

## Deliberately NOT done

- **Removing the toolbar mounts.** Below `lg` there is no sidebar, so the
  toolbar copy is the only switcher a mobile user has. "Instead of" applies at
  desktop only — the sole reading consistent with the stated RWD framing.
- **Changing which pages have a switcher.** Exactly the same set as today.
