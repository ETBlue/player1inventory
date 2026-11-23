import { SignIn, useAuth } from '@clerk/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { authPageUrl, SIGN_UP_PATH } from '@/lib/authPages'
import { safeRedirectPath } from '@/lib/safeRedirect'

interface SignInSearch {
  // Where to go after sign-in or sign-up (households H5b, decision T24).
  // `CloudAuthGuard` sets it to the page the person was on.
  redirect?: string
}

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): SignInSearch =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  component: SignInPage,
})

function SignInPage() {
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
        `forceRedirectUrl` is used after a sign-IN.

        `signUpUrl` is the target of Clerk's "Sign up" link. It must be OUR
        `/sign-up` page with the same `redirect`. Without it the link went
        to Clerk's hosted page, which keeps no `redirect`, so a brand-new
        person who opened an invite link never came back to it
        (docs/global/bugs/2026-11-23-bug-join-redirect-lost-on-sign-up.md).

        `signUpForceRedirectUrl` alone does NOT fix that: Clerk does not put
        it on the "Sign up" link. It is kept for the flows that do read it
        (an e-mail link, an SSO callback that ends in a sign-up).
      */}
      <SignIn
        forceRedirectUrl={path}
        signUpForceRedirectUrl={path}
        signUpUrl={authPageUrl(SIGN_UP_PATH, path)}
      />
    </div>
  )
}
