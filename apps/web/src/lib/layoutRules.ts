// Hide sidebar on fullscreen pages (onboarding, items, tags, vendors, recipes,
// shelves). Layout, Sidebar and Navigation all ask this one function, so a
// route move changes one place.
export function isFullscreenPage(pathname: string): boolean {
  return (
    pathname === '/onboarding' ||
    pathname.startsWith('/items/') ||
    pathname.startsWith('/settings/household/tags') ||
    pathname.startsWith('/settings/household/vendors') ||
    pathname.startsWith('/settings/household/recipes') ||
    pathname.startsWith('/settings/household/shelves')
  )
}
