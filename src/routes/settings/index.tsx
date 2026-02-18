import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight, Moon, Store, Sun, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTheme } from '@/hooks/useTheme'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

function Settings() {
  const { preference, theme, setPreference } = useTheme()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-2">
        {/* Theme Control Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              {theme === 'dark' ? (
                <Moon className="h-5 w-5 text-foreground-muted" />
              ) : (
                <Sun className="h-5 w-5 text-foreground-muted" />
              )}
              <div>
                <p className="font-medium">Theme</p>
                <p className="text-sm text-foreground-muted">
                  Choose light, dark, or system theme
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant={preference === 'light' ? 'neutral' : 'neutral-outline'}
                onClick={() => setPreference('light')}
                className="flex-1"
              >
                Light
              </Button>
              <Button
                variant={
                  preference === 'system' ? 'neutral' : 'neutral-outline'
                }
                onClick={() => setPreference('system')}
                className="flex-1"
              >
                System
              </Button>
              <Button
                variant={preference === 'dark' ? 'neutral' : 'neutral-outline'}
                onClick={() => setPreference('dark')}
                className="flex-1"
              >
                Dark
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tags Card */}
        <Link to="/settings/tags">
          <Card className="hover:bg-background-surface/50 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Tags className="h-5 w-5 text-foreground-muted" />
                <div>
                  <p className="font-medium">Tags</p>
                  <p className="text-sm text-foreground-muted">
                    Manage tag types and tags
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground-muted" />
            </CardContent>
          </Card>
        </Link>

        {/* Vendors Card */}
        <Link to="/settings/vendors">
          <Card className="hover:bg-background-surface/50 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Store className="h-5 w-5 text-foreground-muted" />
                <div>
                  <p className="font-medium">Vendors</p>
                  <p className="text-sm text-foreground-muted">
                    Manage vendors
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground-muted" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
