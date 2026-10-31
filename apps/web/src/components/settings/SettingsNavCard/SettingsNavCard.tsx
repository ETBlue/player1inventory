import { Link, type LinkProps } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface SettingsNavCardProps {
  icon: LucideIcon
  label: string
  description: string
  // The `to` type of `<Link>`: only paths the router knows. `tsc` rejects a
  // path with no route, such as `'/settings/nope'`.
  to: NonNullable<LinkProps['to']>
}

export function SettingsNavCard({
  icon: Icon,
  label,
  description,
  to,
}: SettingsNavCardProps) {
  return (
    <Link to={to} className="block">
      <Card className="flex items-center gap-4">
        <Icon className="h-5 w-5 text-foreground-muted shrink-0" />
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <div className="flex-1" />
        <ChevronRight className="h-5 w-5 text-foreground-muted" />
      </Card>
    </Link>
  )
}
