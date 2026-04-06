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
        orange: `bg-orange border-orange text-orange-inverse`,
        brown: `bg-brown border-brown text-brown-inverse`,
        green: `bg-green border-green text-green-inverse`,
        teal: `bg-teal border-teal text-teal-inverse`,
        cyan: `bg-cyan border-cyan text-cyan-inverse`,
        blue: `bg-blue border-blue text-blue-inverse`,
        indigo: `bg-indigo border-indigo text-indigo-inverse`,
        purple: `bg-purple border-purple text-purple-inverse`,
        pink: `bg-pink border-pink text-pink-inverse`,
        rose: `bg-rose border-rose text-rose-inverse`,

        ok: `bg-status-ok border-status-ok text-status-ok-inverse`,
        warning: `bg-status-warning border-status-warning text-status-warning-inverse`,
        error: `bg-status-error border-status-error text-status-error-inverse`,
        inactive: `bg-status-inactive border-status-inactive text-status-inactive-inverse`,

        primary: `bg-importance-primary border-importance-primary text-foreground-colorless-inverse`,
        secondary: `bg-importance-secondary border-importance-secondary text-foreground-colorless-inverse`,
        destructive: `bg-importance-destructive border-importance-destructive text-foreground-colorless-inverse`,
        neutral: `bg-importance-neutral border-importance-neutral text-foreground-colorless-inverse`,

        'orange-inverse': `bg-orange-inverse border-orange-accessory text-orange-foreground`,
        'brown-inverse': `bg-brown-inverse border-brown-accessory text-brown-foreground`,
        'green-inverse': `bg-green-inverse border-green-accessory text-green-foreground`,
        'teal-inverse': `bg-teal-inverse border-teal-accessory text-teal-foreground`,
        'cyan-inverse': `bg-cyan-inverse border-cyan-accessory text-cyan-foreground`,
        'blue-inverse': `bg-blue-inverse border-blue-accessory text-blue-foreground`,
        'indigo-inverse': `bg-indigo-inverse border-indigo-accessory text-indigo-foreground`,
        'purple-inverse': `bg-purple-inverse border-purple-accessory text-purple-foreground`,
        'pink-inverse': `bg-pink-inverse border-pink-accessory text-pink-foreground`,
        'rose-inverse': `bg-rose-inverse border-rose-accessory text-rose-foreground`,

        'ok-inverse': `bg-status-ok-inverse border-status-ok-accessory text-status-ok-foreground`,
        'warning-inverse': `bg-status-warning-inverse border-status-warning-accessory text-status-warning-foreground`,
        'error-inverse': `bg-status-error-inverse border-status-error-accessory text-status-error-foreground`,
        'inactive-inverse': `bg-status-inactive-inverse border-status-inactive-accessory text-status-inactive-foreground`,

        'primary-outline': `border-importance-primary text-importance-primary-foreground`,
        'secondary-outline': `border-importance-secondary text-importance-secondary-foreground`,
        'destructive-outline': `border-importance-destructive text-importance-destructive-foreground`,
        'neutral-outline': `border-importance-neutral text-importance-neutral-foreground`,
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
