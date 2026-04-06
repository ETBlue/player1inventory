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
        primary: `border-importance-primary bg-importance-primary text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        secondary: `border-importance-secondary bg-importance-secondary text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        tertiary: `border-importance-tertiary bg-importance-tertiary text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        destructive: `border-importance-destructive bg-importance-destructive text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        neutral: `border-importance-neutral bg-importance-neutral text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        'primary-outline': `border-importance-primary text-importance-primary-foreground shadow-sm hover:shadow-md`,
        'secondary-outline': `border-importance-secondary text-importance-secondary-foreground shadow-sm hover:shadow-md`,
        'tertiary-outline': `border-importance-tertiary text-importance-tertiary-foreground shadow-sm hover:shadow-md`,
        'destructive-outline': `border-importance-destructive text-importance-destructive-foreground shadow-sm hover:shadow-md`,
        'neutral-outline': `border-importance-neutral text-importance-neutral-foreground shadow-sm hover:shadow-md`,
        'primary-ghost': `border-transparent text-importance-primary-foreground`,
        'secondary-ghost': `border-transparent text-importance-secondary-foreground`,
        'tertiary-ghost': `border-transparent text-importance-tertiary-foreground`,
        'destructive-ghost': `border-transparent text-importance-destructive-foreground`,
        'neutral-ghost': `border-transparent text-importance-neutral-foreground`,
        'primary-link': `border-transparent text-importance-primary-foreground underline-offset-4 hover:underline`,
        'secondary-link': `border-transparent text-importance-secondary-foreground underline-offset-4 hover:underline`,
        'tertiary-link': `border-transparent text-importance-tertiary-foreground underline-offset-4 hover:underline`,
        'destructive-link': `border-transparent text-importance-destructive-foreground underline-offset-4 hover:underline`,
        'neutral-link': `border-transparent text-importance-neutral-foreground underline-offset-4 hover:underline`,
        orange: `border-orange bg-orange text-orange-inverse shadow-sm hover:shadow-md`,
        brown: `border-brown bg-brown text-brown-inverse shadow-sm hover:shadow-md`,
        green: `border-green bg-green text-green-inverse shadow-sm hover:shadow-md`,
        teal: `border-teal bg-teal text-teal-inverse shadow-sm hover:shadow-md`,
        cyan: `border-cyan bg-cyan text-cyan-inverse shadow-sm hover:shadow-md`,
        blue: `border-blue bg-blue text-blue-inverse shadow-sm hover:shadow-md`,
        indigo: `border-indigo bg-indigo text-indigo-inverse shadow-sm hover:shadow-md`,
        purple: `border-purple bg-purple text-purple-inverse shadow-sm hover:shadow-md`,
        pink: `border-pink bg-pink text-pink-inverse shadow-sm hover:shadow-md`,
        rose: `border-rose bg-rose text-rose-inverse shadow-sm hover:shadow-md`,
        'orange-inverse': `bg-orange-inverse border-orange-accessory text-orange-foreground shadow-sm hover:shadow-md`,
        'brown-inverse': `bg-brown-inverse border-brown-accessory text-brown-foreground shadow-sm hover:shadow-md`,
        'green-inverse': `bg-green-inverse border-green-accessory text-green-foreground shadow-sm hover:shadow-md`,
        'teal-inverse': `bg-teal-inverse border-teal-accessory text-teal-foreground shadow-sm hover:shadow-md`,
        'cyan-inverse': `bg-cyan-inverse border-cyan-accessory text-cyan-foreground shadow-sm hover:shadow-md`,
        'blue-inverse': `bg-blue-inverse border-blue-accessory text-blue-foreground shadow-sm hover:shadow-md`,
        'indigo-inverse': `bg-indigo-inverse border-indigo-accessory text-indigo-foreground shadow-sm hover:shadow-md`,
        'purple-inverse': `bg-purple-inverse border-purple-accessory text-purple-foreground shadow-sm hover:shadow-md`,
        'pink-inverse': `bg-pink-inverse border-pink-accessory text-pink-foreground shadow-sm hover:shadow-md`,
        'rose-inverse': `bg-rose-inverse border-rose-accessory text-rose-foreground shadow-sm hover:shadow-md`,
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
