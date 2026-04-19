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
        orange: `bg-tag-orange-background border-tag-orange-background text-tag-orange-background-inverse`,
        brown: `bg-tag-brown-background border-tag-brown-background text-tag-brown-background-inverse`,
        green: `bg-tag-green-background border-tag-green-background text-tag-green-background-inverse`,
        teal: `bg-tag-teal-background border-tag-teal-background text-tag-teal-background-inverse`,
        cyan: `bg-tag-cyan-background border-tag-cyan-background text-tag-cyan-background-inverse`,
        blue: `bg-tag-blue-background border-tag-blue-background text-tag-blue-background-inverse`,
        indigo: `bg-tag-indigo-background border-tag-indigo-background text-tag-indigo-background-inverse`,
        purple: `bg-tag-purple-background border-tag-purple-background text-tag-purple-background-inverse`,
        pink: `bg-tag-pink-background border-tag-pink-background text-tag-pink-background-inverse`,
        rose: `bg-tag-rose-background border-tag-rose-background text-tag-rose-background-inverse`,

        ok: `bg-status-ok-background border-status-ok-background text-status-ok-background-inverse`,
        warning: `bg-status-warning-background border-status-warning-background text-status-warning-background-inverse`,
        error: `bg-status-error-background border-status-error-background text-status-error-background-inverse`,
        inactive: `bg-status-inactive-background border-status-inactive-background text-status-inactive-background-inverse`,

        primary: `bg-importance-primary-background border-importance-primary-background text-foreground-colorless-inverse`,
        secondary: `bg-importance-secondary-background border-importance-secondary-background text-foreground-colorless-inverse`,
        destructive: `bg-importance-destructive-background border-importance-destructive-background text-foreground-colorless-inverse`,
        neutral: `bg-importance-neutral-background border-importance-neutral-background text-foreground-colorless-inverse`,

        'orange-inverse': `bg-tag-orange-background-inverse border-tag-orange-accessory text-tag-orange-foreground`,
        'brown-inverse': `bg-tag-brown-background-inverse border-tag-brown-accessory text-tag-brown-foreground`,
        'green-inverse': `bg-tag-green-background-inverse border-tag-green-accessory text-tag-green-foreground`,
        'teal-inverse': `bg-tag-teal-background-inverse border-tag-teal-accessory text-tag-teal-foreground`,
        'cyan-inverse': `bg-tag-cyan-background-inverse border-tag-cyan-accessory text-tag-cyan-foreground`,
        'blue-inverse': `bg-tag-blue-background-inverse border-tag-blue-accessory text-tag-blue-foreground`,
        'indigo-inverse': `bg-tag-indigo-background-inverse border-tag-indigo-accessory text-tag-indigo-foreground`,
        'purple-inverse': `bg-tag-purple-background-inverse border-tag-purple-accessory text-tag-purple-foreground`,
        'pink-inverse': `bg-tag-pink-background-inverse border-tag-pink-accessory text-tag-pink-foreground`,
        'rose-inverse': `bg-tag-rose-background-inverse border-tag-rose-accessory text-tag-rose-foreground`,

        'ok-inverse': `bg-status-ok-background-inverse border-status-ok-accessory text-status-ok-foreground`,
        'warning-inverse': `bg-status-warning-background-inverse border-status-warning-accessory text-status-warning-foreground`,
        'error-inverse': `bg-status-error-background-inverse border-status-error-accessory text-status-error-foreground`,
        'inactive-inverse': `bg-status-inactive-background-inverse border-status-inactive-accessory text-status-inactive-foreground`,

        'primary-outline': `border-importance-primary-background text-importance-primary-foreground`,
        'secondary-outline': `border-importance-secondary-background text-importance-secondary-foreground`,
        'destructive-outline': `border-importance-destructive-background text-importance-destructive-foreground`,
        'neutral-outline': `border-importance-neutral-background text-importance-neutral-foreground`,
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
