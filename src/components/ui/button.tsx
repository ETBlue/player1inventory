import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 
  whitespace-nowrap border rounded-sm 
  text-sm font-medium 
  cursor-pointer disabled:pointer-events-none 
  opacity-90 hover:opacity-100 disabled:opacity-50
  [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0`,
  {
    variants: {
      variant: {
        primary: `border-transparent bg-primary text-tint shadow-sm hover:shadow-md`,
        'primary-outline': `border-primary text-primary shadow-sm hover:shadow-md`,
        'primary-ghost': `border-transparent text-primary`,
        'primary-link': `border-transparent text-primary underline-offset-4 hover:underline`,
        secondary: `border-transparent bg-secondary text-tint shadow-sm hover:shadow-md`,
        'secondary-outline': `border-secondary text-secondary shadow-sm hover:shadow-md`,
        'secondary-ghost': `border-transparent text-secondary`,
        'secondary-link': `border-transparent text-secondary underline-offset-4 hover:underline`,
        tertiary: `border-transparent bg-tertiary text-tint shadow-sm hover:shadow-md`,
        'tertiary-outline': `border-tertiary text-tertiary shadow-sm hover:shadow-md`,
        'tertiary-ghost': `border-transparent text-tertiary`,
        'tertiary-link': `border-transparent text-tertiary underline-offset-4 hover:underline`,
        destructive: `border-transparent bg-destructive text-tint shadow-sm hover:shadow-md`,
        'destructive-outline': `border-destructive text-destructive shadow-sm hover:shadow-md`,
        'destructive-ghost': `border-transparent text-destructive`,
        'destructive-link': `border-transparent text-destructive underline-offset-4 hover:underline`,
        neutral: `border-transparent bg-neutral text-tint shadow-sm hover:shadow-md`,
        'neutral-outline': `border-neutral text-neutral shadow-sm hover:shadow-md`,
        'neutral-ghost': `border-transparent text-neutral`,
        'neutral-link': `border-transparent text-neutral underline-offset-4 hover:underline`,
      },
      size: {
        mini: 'h-6 px-2 text-xs',
        sm: 'h-7 px-3 text-xs',
        default: 'h-8 px-4',
        lg: 'h-9 px-5 text-lg',
        'icon-mini': 'h-6 w-6',
        'icon-sm': 'h-7 w-7',
        icon: 'h-8 w-8',
        'icon-lg': 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
