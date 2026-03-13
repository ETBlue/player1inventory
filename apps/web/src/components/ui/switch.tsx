import * as SwitchPrimitives from '@radix-ui/react-switch'
import * as React from 'react'

import { cn } from '@/lib/utils'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      `peer h-6 w-11 rounded-full cursor-pointer 
      inline-flex shrink-0 items-center 
      border-2 border-transparent transition-colors 
      disabled:cursor-not-allowed disabled:opacity-50 
      data-[state=checked]:bg-primary data-[state=unchecked]:bg-accessory-default`,
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        `pointer-events-none block 
        h-5 w-5 rounded-full 
        bg-background-elevated shadow-md transition-transform 
        data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0`,
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
