/**
 * TypographyScale — visual demo of the app's type scale.
 *
 * Uses inline styles only (no Tailwind) so it works inside the Starlight/Astro
 * build pipeline without cross-app CSS processing.  CSS variables come from the
 * app's theme.css, which custom.css already imports into the Starlight page.
 */

const SCALE_ENTRIES = [
  {
    label: 'text-3xl / 1.875rem',
    style: { fontSize: '1.875rem', lineHeight: '2.25rem', fontWeight: 700 },
    sample: 'Pantry',
    usage: 'Page headings (h1)',
  },
  {
    label: 'text-2xl / 1.5rem',
    style: { fontSize: '1.5rem', lineHeight: '2rem', fontWeight: 700 },
    sample: 'Shopping List',
    usage: 'Section headings (h2)',
  },
  {
    label: 'text-xl / 1.25rem',
    style: { fontSize: '1.25rem', lineHeight: '1.75rem', fontWeight: 600 },
    sample: 'Filter by tag',
    usage: 'Sub-headings, dialog titles (h3)',
  },
  {
    label: 'text-lg / 1.125rem',
    style: { fontSize: '1.125rem', lineHeight: '1.75rem', fontWeight: 500 },
    sample: 'Organic Whole Milk',
    usage: 'Item card names, list row primaries',
  },
  {
    label: 'text-base / 1rem',
    style: { fontSize: '1rem', lineHeight: '1.5rem', fontWeight: 400 },
    sample: 'Last restocked 3 days ago',
    usage: 'Body text, descriptions, form labels',
  },
  {
    label: 'text-sm / 0.875rem',
    style: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 400 },
    sample: 'Added to cart',
    usage: 'Secondary metadata, helper text, badge labels',
  },
  {
    label: 'text-xs / 0.75rem',
    style: { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 400 },
    sample: 'Expires 2026-05-01',
    usage: 'Timestamps, fine print, tooltip text',
  },
]

export function TypographyScale() {
  return (
    <div style={{ fontFamily: "'Rosario', sans-serif" }}>
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
