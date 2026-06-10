/**
 * TypographyScale — visual demo of the app's type scale.
 *
 * Uses inline styles only (no Tailwind) so it works inside the Starlight/Astro
 * build pipeline without cross-app CSS processing.  CSS variables come from the
 * app's theme.css, which custom.css already imports into the Starlight page.
 */

const SCALE_ENTRIES = [
  {
    label: 'text-2xl / 1.5rem',
    style: { fontSize: '1.5rem', lineHeight: '2rem', fontWeight: 700 },
    sample: 'Welcome to Player 1 Inventory',
    usage: 'Onboarding welcome title — not used in main app',
  },
  {
    label: 'text-xl / 1.25rem',
    style: { fontSize: '1.25rem', lineHeight: '1.75rem', fontWeight: 600 },
    sample: 'Choose from a template',
    usage: 'Onboarding headings — not used in main app',
  },
  {
    label: 'text-base / 1rem',
    style: { fontSize: '1rem', lineHeight: '1.5rem', fontWeight: 400 },
    sample: 'Costco',
    usage: 'Page title (h1) — vendor / shelf / recipe detail headers',
  },
  {
    label: 'text-sm / 0.875rem · font-medium',
    style: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500 },
    sample: 'Organic Whole Milk',
    usage: 'Card titles, button labels, section headings, form labels',
  },
  {
    label: 'text-sm / 0.875rem · font-normal',
    style: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 400 },
    sample: 'Your data is stored on this device',
    usage: 'Card descriptions (default), body text, dropdown items, navigation labels',
  },
  {
    label: 'text-xs / 0.75rem',
    style: { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 400 },
    sample: '3 / 8 active · 2 low stock · dairy',
    usage: 'Badges, fine print, card descriptions (many components override to text-xs), secondary metadata',
  },
]

export function TypographyScale() {
  return (
    <div>
      {SCALE_ENTRIES.map((entry) => (
        <div
          key={entry.label}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'baseline',
            gap: '0.5rem 1.5rem',
            padding: '0.75rem 0',
            borderBottom: '1px solid var(--accessory-default, #ccc)',
          }}
        >
          <div>
            <div style={entry.style}>{entry.sample}</div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--foreground-muted, #888)',
                marginTop: '0.125rem',
              }}
            >
              {entry.usage}
            </div>
          </div>
          <code
            style={{
              fontSize: '0.75rem',
              color: 'var(--foreground-muted, #888)',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.label}
          </code>
        </div>
      ))}
    </div>
  )
}
