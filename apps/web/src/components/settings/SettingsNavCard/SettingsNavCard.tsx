import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface SettingsNavCardProps {
  icon: LucideIcon
  label: string
  description: string
  to: string
}

export function SettingsNavCard({
  icon: Icon,
  label,
  description,
  to,
}: SettingsNavCardProps) {
  return (
    <Link to={to} className="block">
      <Card>
        <CardContent className="px-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-foreground-muted" />
            <div>
              <p className="font-medium">{label}</p>
              <p className="text-sm text-foreground-muted">{description}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-foreground-muted" />
        </CardContent>
      </Card>
    </Link>
  )
}
