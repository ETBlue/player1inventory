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
        primary: `border-transparent bg-primary text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        'primary-outline': `border-primary text-primary shadow-sm hover:shadow-md`,
        'primary-ghost': `border-transparent text-primary`,
        'primary-link': `border-transparent text-primary underline-offset-4 hover:underline`,
        secondary: `border-transparent bg-secondary text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        'secondary-outline': `border-secondary text-secondary shadow-sm hover:shadow-md`,
        'secondary-ghost': `border-transparent text-secondary`,
        'secondary-link': `border-transparent text-secondary underline-offset-4 hover:underline`,
        tertiary: `border-transparent bg-tertiary text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        'tertiary-outline': `border-tertiary text-tertiary shadow-sm hover:shadow-md`,
        'tertiary-ghost': `border-transparent text-tertiary`,
        'tertiary-link': `border-transparent text-tertiary underline-offset-4 hover:underline`,
        destructive: `border-transparent bg-destructive text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        'destructive-outline': `border-destructive text-destructive shadow-sm hover:shadow-md`,
        'destructive-ghost': `border-transparent text-destructive`,
        'destructive-link': `border-transparent text-destructive underline-offset-4 hover:underline`,
        neutral: `border-transparent bg-neutral text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        'neutral-outline': `border-neutral text-neutral shadow-sm hover:shadow-md`,
        'neutral-ghost': `border-transparent text-neutral`,
        'neutral-link': `border-transparent text-neutral underline-offset-4 hover:underline`,
        orange: `border-transparent bg-orange text-orange-tint shadow-sm hover:shadow-md`,
        brown: `border-transparent bg-brown text-brown-tint shadow-sm hover:shadow-md`,
        amber: `border-transparent bg-amber text-amber-tint shadow-sm hover:shadow-md`,
        lime: `border-transparent bg-lime text-lime-tint shadow-sm hover:shadow-md`,
        green: `border-transparent bg-green text-green-tint shadow-sm hover:shadow-md`,
        teal: `border-transparent bg-teal text-teal-tint shadow-sm hover:shadow-md`,
        cyan: `border-transparent bg-cyan text-cyan-tint shadow-sm hover:shadow-md`,
        blue: `border-transparent bg-blue text-blue-tint shadow-sm hover:shadow-md`,
        indigo: `border-transparent bg-indigo text-indigo-tint shadow-sm hover:shadow-md`,
        purple: `border-transparent bg-purple text-purple-tint shadow-sm hover:shadow-md`,
        pink: `border-transparent bg-pink text-pink-tint shadow-sm hover:shadow-md`,
        rose: `border-transparent bg-rose text-rose-tint shadow-sm hover:shadow-md`,
        'orange-tint': `bg-orange-tint border-orange text-orange shadow-sm hover:shadow-md`,
        'brown-tint': `bg-brown-tint border-brown text-brown shadow-sm hover:shadow-md`,
        'amber-tint': `bg-amber-tint border-amber text-amber shadow-sm hover:shadow-md`,
        'lime-tint': `bg-lime-tint border-lime text-lime shadow-sm hover:shadow-md`,
        'green-tint': `bg-green-tint border-green text-green shadow-sm hover:shadow-md`,
        'teal-tint': `bg-teal-tint border-teal text-teal shadow-sm hover:shadow-md`,
        'cyan-tint': `bg-cyan-tint border-cyan text-cyan shadow-sm hover:shadow-md`,
        'blue-tint': `bg-blue-tint border-blue text-blue shadow-sm hover:shadow-md`,
        'indigo-tint': `bg-indigo-tint border-indigo text-indigo shadow-sm hover:shadow-md`,
        'purple-tint': `bg-purple-tint border-purple text-purple shadow-sm hover:shadow-md`,
        'pink-tint': `bg-pink-tint border-pink text-pink shadow-sm hover:shadow-md`,
        'rose-tint': `bg-rose-tint border-rose text-rose shadow-sm hover:shadow-md`,
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
