// Stub for @clerk/react used in Storybook only.
// Prevents "Missing ClerkProvider" errors for components that call useUser/useAuth.
import type { ReactNode } from 'react'

export function useUser() {
  return {
    user: {
      id: 'storybook-user-id',
      primaryEmailAddress: { emailAddress: 'storybook@example.com' },
    },
    isSignedIn: true as const,
    isLoaded: true as const,
  }
}

export function useAuth() {
  return {
    isSignedIn: true as const,
    isLoaded: true as const,
    userId: 'storybook-user-id',
  }
}

export function useClerk() {
  return { signOut: async () => {} }
}

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
