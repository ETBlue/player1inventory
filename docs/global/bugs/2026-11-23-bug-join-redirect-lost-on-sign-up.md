# Bug: an invite link is lost when the person signs up

Date: 2026-11-23. Found by the owner on a local dev server (dev Clerk instance), during
release plan step B.4 row 4 (`docs/global/backend/2026-11-23-households-release-plan.md`).

## Bug description

A signed-out person opens an invite link, `/join/<token>`. `CloudAuthGuard` sends them to
`/sign-in?redirect=/join/<token>`. They choose **Sign up** and make a new account. After
sign-up they do not come back to `/join/<token>`. They must open the link again by hand.

Sign-in with an existing account is not affected (read from the code; not reported broken).

## Root cause

Clerk loses the return path. The app does not move the person away afterwards.

1. `apps/web/src/main.tsx` renders `<ClerkProvider>` with no `signInUrl` or `signUpUrl`, and
   `apps/web/src/routes/sign-in.tsx` renders `<SignIn>` with no `signUpUrl`. The app has no
   `/sign-up` page.
2. So Clerk's "Sign up" link goes to the hosted Account Portal
   (`<instance>.accounts.dev/sign-up`), another website (`@clerk/ui`, `SignIn.ts`: the link is
   `ctx.signUpUrl || options.signUpUrl || displayConfig.signUpUrl`).
3. The link carries only Clerk's "preserved" search values. In `@clerk/shared` 4.3.0 that is
   `redirect_url` only. Our page uses `redirect=`, so nothing travels.
4. `signUpForceRedirectUrl` on our `<SignIn>` is never added to that link. It is used only for
   the e-mail link and SSO callback URLs. Clerk's docs say otherwise; the source does not.
5. After sign-up the Account Portal has no return address and uses the dashboard's default
   page.

Checked and NOT a cause: `shouldRedirectToOnboarding`, the copy question
(`isCopyPromptPausedPath`), `NoHouseholdGate` and `HouseholdChangeGuard` all leave a person on
`/join/…`.

Docs that claimed this worked: H4 runbook section 9.5 ("Fix the Clerk setting; no code change
is needed"), decision T24 in `docs/global/permissions/2026-11-18-households-plan-h5b.md`, and
`apps/web/src/routes/CLAUDE.md`, *Join Page* ("so a sign-up returns too"). The test
`sign-in.test.tsx` "user who signs in or signs up from an invite link goes back to it" checks
only that the prop is passed, so it stayed green.

## Fix applied

- A new page, `apps/web/src/routes/sign-up.tsx`, built like `sign-in.tsx`: the same
  `safeRedirectPath`, `<SignUp routing="hash" forceRedirectUrl={path}
  signInForceRedirectUrl={path} signInUrl="/sign-in?redirect=…">`. With hash routing the
  e-mail code step stays on our page, and `?redirect=` stays in the URL.
- `sign-in.tsx` passes `signUpUrl="/sign-up?redirect=…"` to `<SignIn>` (plain `/sign-up` when
  there is no safe return path).
- `main.tsx`: `ClerkProvider` gets `signInUrl="/sign-in"` and `signUpUrl="/sign-up"`, so no
  Clerk link falls back to the Account Portal. Both are set: with only `signInUrl`, Clerk runs
  sign-up inside the sign-in page (`/sign-in#/create`).
- One rule for "an auth page", `isAuthPage()` in `apps/web/src/lib/authPages.ts`, used by
  `CloudAuthGuard`, `isCopyPromptPausedPath` and `NoHouseholdGate`. Without the guard change,
  a signed-out person on `/sign-up` would have been sent back to `/sign-in`.

## Test added

- `apps/web/src/routes/sign-up.test.tsx` (7 tests), 3 new tests in `sign-in.test.tsx`, and one
  each for the guard, the copy-question pause and `NoHouseholdGate`. All 13 were red before the
  fix. 13 mutation checks, each turned at least one test red.
- The old test "user who signs in or signs up from an invite link goes back to it" checked only
  that a prop was passed. It is renamed to cover sign-in only.
- E2E has no Clerk, so no automated test proves Clerk follows these props. A manual check on
  the dev instance, and runbook H4 section 9.5 on production, prove it.

## PR / commit

Branch `fix/join-redirect-after-sign-up`: `8ecbdd1b` (fix and tests), `38399fc2` (docs).
PR: see the branch's PR into `develop`.
