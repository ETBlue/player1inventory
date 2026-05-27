import { Loader2 } from 'lucide-react'

export function LoadingSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="size-8 animate-spin [transform-box:fill-box] text-foreground-muted" />
    </div>
  )
}
