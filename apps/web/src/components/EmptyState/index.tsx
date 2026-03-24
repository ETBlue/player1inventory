import { cn } from '@/lib/utils'

interface EmptyStateProps {
  title: string
  description: string
  className?: string
}

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={cn('text-center py-12 text-foreground-muted', className)}>
      <p>{title}</p>
      <p className="text-sm mt-1">{description}</p>
    </div>
  )
}
