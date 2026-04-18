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
        destructive: `border-importance-destructive bg-importance-destructive text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        neutral: `border-importance-neutral bg-importance-neutral text-foreground-colorless-inverse shadow-sm hover:shadow-md`,
        'primary-outline': `border-importance-primary text-importance-primary-foreground shadow-sm hover:shadow-md`,
        'secondary-outline': `border-importance-secondary text-importance-secondary-foreground shadow-sm hover:shadow-md`,
        'destructive-outline': `border-importance-destructive text-importance-destructive-foreground shadow-sm hover:shadow-md`,
        'neutral-outline': `border-importance-neutral text-importance-neutral-foreground shadow-sm hover:shadow-md`,
        'primary-ghost': `border-transparent text-importance-primary-foreground`,
        'secondary-ghost': `border-transparent text-importance-secondary-foreground`,
        'destructive-ghost': `border-transparent text-importance-destructive-foreground`,
        'neutral-ghost': `border-transparent text-importance-neutral-foreground`,
        'primary-link': `border-transparent text-importance-primary-foreground underline-offset-4 hover:underline`,
        'secondary-link': `border-transparent text-importance-secondary-foreground underline-offset-4 hover:underline`,
        'destructive-link': `border-transparent text-importance-destructive-foreground underline-offset-4 hover:underline`,
        'neutral-link': `border-transparent text-importance-neutral-foreground underline-offset-4 hover:underline`,
        orange: `border-tag-orange bg-tag-orange text-tag-orange-inverse shadow-sm hover:shadow-md`,
        brown: `border-tag-brown bg-tag-brown text-tag-brown-inverse shadow-sm hover:shadow-md`,
        green: `border-tag-green bg-tag-green text-tag-green-inverse shadow-sm hover:shadow-md`,
        teal: `border-tag-teal bg-tag-teal text-tag-teal-inverse shadow-sm hover:shadow-md`,
        cyan: `border-tag-cyan bg-tag-cyan text-tag-cyan-inverse shadow-sm hover:shadow-md`,
        blue: `border-tag-blue bg-tag-blue text-tag-blue-inverse shadow-sm hover:shadow-md`,
        indigo: `border-tag-indigo bg-tag-indigo text-tag-indigo-inverse shadow-sm hover:shadow-md`,
        purple: `border-tag-purple bg-tag-purple text-tag-purple-inverse shadow-sm hover:shadow-md`,
        pink: `border-tag-pink bg-tag-pink text-tag-pink-inverse shadow-sm hover:shadow-md`,
        rose: `border-tag-rose bg-tag-rose text-tag-rose-inverse shadow-sm hover:shadow-md`,
        'orange-inverse': `bg-tag-orange-inverse border-tag-orange-accessory text-tag-orange-foreground shadow-sm hover:shadow-md`,
        'brown-inverse': `bg-tag-brown-inverse border-tag-brown-accessory text-tag-brown-foreground shadow-sm hover:shadow-md`,
        'green-inverse': `bg-tag-green-inverse border-tag-green-accessory text-tag-green-foreground shadow-sm hover:shadow-md`,
        'teal-inverse': `bg-tag-teal-inverse border-tag-teal-accessory text-tag-teal-foreground shadow-sm hover:shadow-md`,
        'cyan-inverse': `bg-tag-cyan-inverse border-tag-cyan-accessory text-tag-cyan-foreground shadow-sm hover:shadow-md`,
        'blue-inverse': `bg-tag-blue-inverse border-tag-blue-accessory text-tag-blue-foreground shadow-sm hover:shadow-md`,
        'indigo-inverse': `bg-tag-indigo-inverse border-tag-indigo-accessory text-tag-indigo-foreground shadow-sm hover:shadow-md`,
        'purple-inverse': `bg-tag-purple-inverse border-tag-purple-accessory text-tag-purple-foreground shadow-sm hover:shadow-md`,
        'pink-inverse': `bg-tag-pink-inverse border-tag-pink-accessory text-tag-pink-foreground shadow-sm hover:shadow-md`,
        'rose-inverse': `bg-tag-rose-inverse border-tag-rose-accessory text-tag-rose-foreground shadow-sm hover:shadow-md`,
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
