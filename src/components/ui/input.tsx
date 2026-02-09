import * as React from 'react'

import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          `flex h-10 w-full rounded-sm px-3 py-2
          text-foreground-default
          bg-background-surface
          border border-accessory-default
          placeholder:text-foreground-muted
          focus:outline-none focus:border-accessory-emphasized
          disabled:cursor-not-allowed disabled:opacity-50
          file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground-default
          md:text-sm`,
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
