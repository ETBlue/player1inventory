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
        red: `bg-red border-red text-tint`,
        orange: `bg-orange border-orange text-tint`,
        amber: `bg-amber border-amber text-tint`,
        yellow: `bg-yellow border-yellow text-tint`,
        green: `bg-green border-green text-tint`,
        teal: `bg-teal border-teal text-tint`,
        blue: `bg-blue border-blue text-tint`,
        indigo: `bg-indigo border-indigo text-tint`,
        purple: `bg-purple border-purple text-tint`,
        pink: `bg-pink border-pink text-tint`,

        ok: `bg-status-ok border-status-ok text-tint`,
        warning: `bg-status-warning border-status-warning text-tint`,
        error: `bg-status-error border-status-error text-tint`,
        inactive: `bg-status-inactive border-status-inactive text-tint`,

        primary: `bg-primary border-primary text-tint`,
        secondary: `bg-secondary border-secondary text-tint`,
        tertiary: `bg-tertiary border-tertiary text-tint`,
        destructive: `bg-destructive border-destructive text-tint`,
        neutral: `bg-neutral border-neutral text-tint`,

        'red-tint': `bg-red-tint border-red text-dark`,
        'orange-tint': `bg-orange-tint border-orange text-dark`,
        'amber-tint': `bg-amber-tint border-amber text-dark`,
        'yellow-tint': `bg-yellow-tint border-yellow text-dark`,
        'green-tint': `bg-green-tint border-green text-dark`,
        'teal-tint': `bg-teal-tint border-teal text-dark`,
        'blue-tint': `bg-blue-tint border-blue text-dark`,
        'indigo-tint': `bg-indigo-tint border-indigo text-dark`,
        'purple-tint': `bg-purple-tint border-purple text-dark`,
        'pink-tint': `bg-pink-tint border-pink text-dark`,

        'ok-outline': `border-status-ok text-status-ok`,
        'warning-outline': `border-status-warning text-status-warning`,
        'error-outline': `border-status-error text-status-error`,
        'inactive-outline': `border-status-inactive text-status-inactive`,

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
