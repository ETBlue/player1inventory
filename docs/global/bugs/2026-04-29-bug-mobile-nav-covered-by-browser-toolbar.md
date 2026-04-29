# Bug: Mobile Bottom Nav Covered by Browser Toolbar

**Date:** 2026-04-29
**Branch:** fix/mobile-nav-viewport

## Bug Description

On iOS Safari and Chrome for iPhone, the app's bottom navigation bar was hidden behind the browser's toolbar (address bar / bottom chrome). Users had to scroll to reveal it.

## Root Cause

The root layout used `h-screen` (`height: 100vh`). On mobile browsers, `100vh` is computed as the full viewport height *excluding* the browser chrome — meaning when the toolbar is shown, it physically overlaps the bottom of the layout, covering the `<Navigation>` component.

**Affected file:** `apps/web/src/components/global/Layout/Layout.tsx` (line 24)

## Fix Applied

Changed `h-screen` → `h-dvh` in `Layout.tsx`.

`dvh` (dynamic viewport height, `100dvh`) adjusts dynamically as the browser toolbar appears and disappears — the layout shrinks to fit the visible area, keeping the nav bar above the toolbar at all times.

No `viewport-fit=cover` or `env(safe-area-inset-bottom)` needed: without `viewport-fit=cover`, the browser already constrains the viewport to the safe area (above the home indicator), so `dvh` naturally avoids overlap with both the toolbar and the home indicator.

**Browser support:** iOS Safari 15.4+, Chrome for Android 108+ — covers all modern mobile browsers.

## Test Added

No automated test added — this is a CSS rendering behavior that cannot be meaningfully unit-tested or captured by axe-playwright. Verified manually on iPhone with Safari and Chrome.

## PR / Commit

PR #193
