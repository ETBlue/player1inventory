import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight, Tags } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

function Settings() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-2">
        <Link to="/settings/tags">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Tags className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Tags</p>
                  <p className="text-sm text-muted-foreground">
                    Manage tag types and tags
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
