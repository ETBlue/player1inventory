import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const cardVariants = cva('text-foreground-default', {
  variants: {
    variant: {
      default: 'bg-background-elevated',
      ok: 'bg-status-ok-background-inverse',
      warning: 'bg-status-warning-background-inverse',
      error: 'bg-status-error-background-inverse',
      inactive: 'bg-status-inactive-background-inverse',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative p-3 pl-4',
        cardVariants({ variant }),
        variant === 'inactive' && 'opacity-80',
        className,
      )}
      {...props}
    >
      {variant && ['ok', 'warning', 'error', 'inactive'].includes(variant) && (
        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 w-1',
            variant === 'ok' && 'bg-status-ok-background-muted',
            variant === 'warning' && 'bg-status-warning-background-muted',
            variant === 'error' && 'bg-status-error-background-muted',
            variant === 'inactive' && 'bg-status-inactive-background-muted',
          )}
        />
      )}
      {children}
    </div>
  ),
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm font-medium leading-tight', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm text-foreground-muted', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center', className)} {...props} />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
