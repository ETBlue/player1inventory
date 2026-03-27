import * as React from 'react'

import { cn } from '@/lib/utils'

interface InputProps extends React.ComponentProps<'input'> {
  error?: string | undefined
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            `flex h-10 w-full px-2 py-0
            file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground
            placeholder:text-accessory-emphasized
            disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
            border border-accessory bg-background-surface
            rounded-sm`,
            error && 'border-destructive focus-visible:outline-destructive',
            className,
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      </div>
    )
  },
)
Input.displayName = 'Input'

export { Input }
