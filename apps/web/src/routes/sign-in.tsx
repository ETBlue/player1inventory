import { SignIn, useAuth } from '@clerk/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
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
        Both props are needed. `forceRedirectUrl` is used after a sign-IN.
        `signUpForceRedirectUrl` is used after a sign-UP, which is what a
        brand-new person who opens an invite link does. Both prop names were
        checked in the installed `@clerk/react` 6.1.0 types (`SignInProps`).
      */}
      <SignIn forceRedirectUrl={path} signUpForceRedirectUrl={path} />
    </div>
  )
}
