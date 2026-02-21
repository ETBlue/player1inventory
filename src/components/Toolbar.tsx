import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ToolbarProps {
  children: ReactNode
  className?: string
}

export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 border-b-2 border-accessory-default bg-background-surface',
        className,
      )}
    >
      {children}
    </div>
  )
}
