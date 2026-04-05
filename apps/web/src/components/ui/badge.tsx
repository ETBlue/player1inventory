import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  `inline-flex items-center 
  rounded-full px-2 py-0.25 border
  text-xs capitalize whitespace-nowrap`,
  {
    variants: {
      variant: {
        orange: `bg-orange border-orange text-orange-tint`,
        brown: `bg-brown border-brown text-brown-tint`,
        green: `bg-green border-green text-green-tint`,
        teal: `bg-teal border-teal text-teal-tint`,
        cyan: `bg-cyan border-cyan text-cyan-tint`,
        blue: `bg-blue border-blue text-blue-tint`,
        indigo: `bg-indigo border-indigo text-indigo-tint`,
        purple: `bg-purple border-purple text-purple-tint`,
        pink: `bg-pink border-pink text-pink-tint`,
        rose: `bg-rose border-rose text-rose-tint`,

        ok: `bg-status-ok border-status-ok text-status-ok-tint`,
        warning: `bg-status-warning border-status-warning text-status-warning-tint`,
        error: `bg-status-error border-status-error text-status-error-tint`,
        inactive: `bg-status-inactive border-status-inactive text-status-inactive-tint`,

        primary: `bg-primary border-primary text-foreground-colorless-inverse`,
        secondary: `bg-secondary border-secondary text-foreground-colorless-inverse`,
        tertiary: `bg-tertiary border-tertiary text-foreground-colorless-inverse`,
        destructive: `bg-destructive border-destructive text-foreground-colorless-inverse`,
        neutral: `bg-neutral border-neutral text-foreground-colorless-inverse`,

        'orange-tint': `bg-orange-tint border-orange text-foreground-colorless`,
        'brown-tint': `bg-brown-tint border-brown text-foreground-colorless`,
        'green-tint': `bg-green-tint border-green text-foreground-colorless`,
        'teal-tint': `bg-teal-tint border-teal text-foreground-colorless`,
        'cyan-tint': `bg-cyan-tint border-cyan text-foreground-colorless`,
        'blue-tint': `bg-blue-tint border-blue text-foreground-colorless`,
        'indigo-tint': `bg-indigo-tint border-indigo text-foreground-colorless`,
        'purple-tint': `bg-purple-tint border-purple text-foreground-colorless`,
        'pink-tint': `bg-pink-tint border-pink text-foreground-colorless`,
        'rose-tint': `bg-rose-tint border-rose text-foreground-colorless`,

        'ok-outline': `bg-status-ok-tint border-status-ok text-status-ok`,
        'warning-outline': `bg-status-warning-tint border-status-warning text-status-warning`,
        'error-outline': `bg-status-error-tint border-status-error text-status-error`,
        'inactive-outline': `bg-status-inactive-tint border-status-inactive text-status-inactive`,

        'primary-outline': `border-primary text-primary`,
        'secondary-outline': `border-secondary text-secondary`,
        'tertiary-outline': `border-tertiary text-tertiary`,
        'destructive-outline': `border-destructive text-destructive`,
        'neutral-outline': `border-neutral text-neutral`,
      },
    },
    defaultVariants: {
      variant: 'teal',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
