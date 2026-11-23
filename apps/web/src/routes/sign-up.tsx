import { SignUp, useAuth } from '@clerk/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { authPageUrl, SIGN_IN_PATH } from '@/lib/authPages'
import { safeRedirectPath } from '@/lib/safeRedirect'

// The sign-up page (cloud mode), the twin of `/sign-in`. Clerk's "Sign up"
// link on `/sign-in` comes here with the same `redirect`, so a brand-new
// person who opened an invite link comes back to it after sign-up.
// docs/global/bugs/2026-11-23-bug-join-redirect-lost-on-sign-up.md

interface SignUpSearch {
  // Where to go after sign-up or sign-in. The same value as on `/sign-in`.
  redirect?: string
}

export const Route = createFileRoute('/sign-up')({
  validateSearch: (search: Record<string, unknown>): SignUpSearch =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  component: SignUpPage,
})

function SignUpPage() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { redirect } = Route.useSearch()
  // Anyone can write `redirect` into a link, so only a path on this site is
  // followed. Anything else goes to `/`.
  const path = safeRedirectPath(redirect)

  useEffect(() => {
    if (isSignedIn) navigate({ to: path })
  }, [isSignedIn, navigate, path])

  if (isSignedIn) return null

  return (
    <div className="flex min-h-screen items-center justify-center">
      {/*
        `forceRedirectUrl` is used after the sign-UP. `signInForceRedirectUrl`
        is used when the person signs in from here instead, and
        `signInUrl` is the target of Clerk's "Sign in" link, with the same
        `redirect`.

        `routing="hash"`: Clerk shows its later steps (the e-mail code) at
        `#/verify-email-address`, so the path stays `/sign-up` and
        `?redirect=` stays in the address bar. Hash is already the default
        of `@clerk/react` 6.1.0's `<SignUp>` (it passes no routing of its
        own), and `/sign-in` uses it too; it is written here so nobody
        switches to `routing="path"` by accident. Path routing would need
        `path="/sign-up"` and a catch-all route for `/sign-up/…`, which this
        app does not have.
      */}
      <SignUp
        routing="hash"
        forceRedirectUrl={path}
        signInForceRedirectUrl={path}
        signInUrl={authPageUrl(SIGN_IN_PATH, path)}
      />
    </div>
  )
}
