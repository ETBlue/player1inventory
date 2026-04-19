import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 
  whitespace-nowrap border rounded-sm 
  font-medium 
  cursor-pointer disabled:pointer-events-none 
  opacity-90 hover:opacity-100 disabled:opacity-50
  [&_svg]:pointer-events-none [&_svg]:size-[1.2em] [&_svg]:shrink-0`,
  {
    variants: {
      variant: {
        primary: `border-importance-primary-background bg-importance-primary-background text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        secondary: `border-importance-secondary-background bg-importance-secondary-background text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        destructive: `border-importance-destructive-background bg-importance-destructive-background text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        neutral: `border-importance-neutral-background bg-importance-neutral-background text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        'primary-outline': `border-importance-primary-background text-importance-primary-foreground shadow-sm hover:shadow-md`,
        'secondary-outline': `border-importance-secondary-background text-importance-secondary-foreground shadow-sm hover:shadow-md`,
        'destructive-outline': `border-importance-destructive-background text-importance-destructive-foreground shadow-sm hover:shadow-md`,
        'neutral-outline': `border-importance-neutral-background text-importance-neutral-foreground shadow-sm hover:shadow-md`,
        'primary-ghost': `border-transparent text-importance-primary-foreground`,
        'secondary-ghost': `border-transparent text-importance-secondary-foreground`,
        'destructive-ghost': `border-transparent text-importance-destructive-foreground`,
        'neutral-ghost': `border-transparent text-importance-neutral-foreground`,
        'primary-link': `border-transparent text-importance-primary-foreground underline-offset-4 hover:underline`,
        'secondary-link': `border-transparent text-importance-secondary-foreground underline-offset-4 hover:underline`,
        'destructive-link': `border-transparent text-importance-destructive-foreground underline-offset-4 hover:underline`,
        'neutral-link': `border-transparent text-importance-neutral-foreground underline-offset-4 hover:underline`,
        orange: `border-tag-orange-background bg-tag-orange-background text-tag-orange-background-inverse shadow-sm hover:shadow-md`,
        brown: `border-tag-brown-background bg-tag-brown-background text-tag-brown-background-inverse shadow-sm hover:shadow-md`,
        green: `border-tag-green-background bg-tag-green-background text-tag-green-background-inverse shadow-sm hover:shadow-md`,
        teal: `border-tag-teal-background bg-tag-teal-background text-tag-teal-background-inverse shadow-sm hover:shadow-md`,
        cyan: `border-tag-cyan-background bg-tag-cyan-background text-tag-cyan-background-inverse shadow-sm hover:shadow-md`,
        blue: `border-tag-blue-background bg-tag-blue-background text-tag-blue-background-inverse shadow-sm hover:shadow-md`,
        indigo: `border-tag-indigo-background bg-tag-indigo-background text-tag-indigo-background-inverse shadow-sm hover:shadow-md`,
        purple: `border-tag-purple-background bg-tag-purple-background text-tag-purple-background-inverse shadow-sm hover:shadow-md`,
        pink: `border-tag-pink-background bg-tag-pink-background text-tag-pink-background-inverse shadow-sm hover:shadow-md`,
        rose: `border-tag-rose-background bg-tag-rose-background text-tag-rose-background-inverse shadow-sm hover:shadow-md`,
        'orange-inverse': `bg-tag-orange-background-inverse border-tag-orange-accessory text-tag-orange-foreground shadow-sm hover:shadow-md`,
        'brown-inverse': `bg-tag-brown-background-inverse border-tag-brown-accessory text-tag-brown-foreground shadow-sm hover:shadow-md`,
        'green-inverse': `bg-tag-green-background-inverse border-tag-green-accessory text-tag-green-foreground shadow-sm hover:shadow-md`,
        'teal-inverse': `bg-tag-teal-background-inverse border-tag-teal-accessory text-tag-teal-foreground shadow-sm hover:shadow-md`,
        'cyan-inverse': `bg-tag-cyan-background-inverse border-tag-cyan-accessory text-tag-cyan-foreground shadow-sm hover:shadow-md`,
        'blue-inverse': `bg-tag-blue-background-inverse border-tag-blue-accessory text-tag-blue-foreground shadow-sm hover:shadow-md`,
        'indigo-inverse': `bg-tag-indigo-background-inverse border-tag-indigo-accessory text-tag-indigo-foreground shadow-sm hover:shadow-md`,
        'purple-inverse': `bg-tag-purple-background-inverse border-tag-purple-accessory text-tag-purple-foreground shadow-sm hover:shadow-md`,
        'pink-inverse': `bg-tag-pink-background-inverse border-tag-pink-accessory text-tag-pink-foreground shadow-sm hover:shadow-md`,
        'rose-inverse': `bg-tag-rose-background-inverse border-tag-rose-accessory text-tag-rose-foreground shadow-sm hover:shadow-md`,
      },
      size: {
        xs: 'h-6 px-2 text-xs',
        sm: 'h-7 px-3 text-xs',
        default: 'h-8 px-4 text-sm',
        lg: 'h-9 px-5 text-base',
        'icon-xs': 'h-6 w-6 text-xs',
        'icon-sm': 'h-7 w-7 text-xs',
        icon: 'h-8 w-8 text-sm',
        'icon-lg': 'h-9 w-9 text-base',
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
