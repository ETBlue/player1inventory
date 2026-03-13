import { SignIn, useAuth } from '@clerk/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isSignedIn) navigate({ to: '/' })
  }, [isSignedIn, navigate])

  if (isSignedIn) return null

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn />
    </div>
  )
}
