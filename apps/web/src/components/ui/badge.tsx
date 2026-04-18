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
        orange: `bg-tag-orange border-tag-orange text-tag-orange-inverse`,
        brown: `bg-tag-brown border-tag-brown text-tag-brown-inverse`,
        green: `bg-tag-green border-tag-green text-tag-green-inverse`,
        teal: `bg-tag-teal border-tag-teal text-tag-teal-inverse`,
        cyan: `bg-tag-cyan border-tag-cyan text-tag-cyan-inverse`,
        blue: `bg-tag-blue border-tag-blue text-tag-blue-inverse`,
        indigo: `bg-tag-indigo border-tag-indigo text-tag-indigo-inverse`,
        purple: `bg-tag-purple border-tag-purple text-tag-purple-inverse`,
        pink: `bg-tag-pink border-tag-pink text-tag-pink-inverse`,
        rose: `bg-tag-rose border-tag-rose text-tag-rose-inverse`,

        ok: `bg-status-ok border-status-ok text-status-ok-inverse`,
        warning: `bg-status-warning border-status-warning text-status-warning-inverse`,
        error: `bg-status-error border-status-error text-status-error-inverse`,
        inactive: `bg-status-inactive border-status-inactive text-status-inactive-inverse`,

        primary: `bg-importance-primary border-importance-primary text-foreground-colorless-inverse`,
        secondary: `bg-importance-secondary border-importance-secondary text-foreground-colorless-inverse`,
        destructive: `bg-importance-destructive border-importance-destructive text-foreground-colorless-inverse`,
        neutral: `bg-importance-neutral border-importance-neutral text-foreground-colorless-inverse`,

        'orange-inverse': `bg-tag-orange-inverse border-tag-orange-accessory text-tag-orange-foreground`,
        'brown-inverse': `bg-tag-brown-inverse border-tag-brown-accessory text-tag-brown-foreground`,
        'green-inverse': `bg-tag-green-inverse border-tag-green-accessory text-tag-green-foreground`,
        'teal-inverse': `bg-tag-teal-inverse border-tag-teal-accessory text-tag-teal-foreground`,
        'cyan-inverse': `bg-tag-cyan-inverse border-tag-cyan-accessory text-tag-cyan-foreground`,
        'blue-inverse': `bg-tag-blue-inverse border-tag-blue-accessory text-tag-blue-foreground`,
        'indigo-inverse': `bg-tag-indigo-inverse border-tag-indigo-accessory text-tag-indigo-foreground`,
        'purple-inverse': `bg-tag-purple-inverse border-tag-purple-accessory text-tag-purple-foreground`,
        'pink-inverse': `bg-tag-pink-inverse border-tag-pink-accessory text-tag-pink-foreground`,
        'rose-inverse': `bg-tag-rose-inverse border-tag-rose-accessory text-tag-rose-foreground`,

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
