// Full-width label separating a list into sections — the "N inactive items" row
// the pantry and cart pages have always had, and now the "N not stocked here"
// row on group lists. Callers pass an already-translated label.
export function ListSectionDivider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
      {children}
    </div>
  )
}
