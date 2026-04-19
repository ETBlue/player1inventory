import * as React from 'react'

interface SwatchEntry {
  token: string
  label: string
}

interface SwatchGroupProps {
  heading: string
  entries: SwatchEntry[]
}

function SwatchGroup({ heading, entries }: SwatchGroupProps) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{
        fontSize: '0.875rem',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--foreground-muted)',
        marginBottom: '0.75rem',
        marginTop: 0,
      }}>
        {heading}
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        gap: '0.75rem',
      }}>
        {entries.map(({ token, label }) => (
          <div key={token}>
            <div style={{
              backgroundColor: `var(${token})`,
              height: '3rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--accessory-default)',
            }} />
            <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', fontWeight: '500', color: 'var(--foreground-default)' }}>
              {label}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--foreground-muted)', fontFamily: 'monospace' }}>
              {token}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const importanceSwatches: SwatchEntry[] = [
  { token: '--importance-primary-background', label: 'Primary' },
  { token: '--importance-secondary-background', label: 'Secondary' },
  { token: '--importance-destructive-background', label: 'Destructive' },
  { token: '--importance-neutral-background', label: 'Neutral' },
]

const importanceForegroundSwatches: SwatchEntry[] = [
  { token: '--importance-primary-foreground', label: 'Primary FG' },
  { token: '--importance-secondary-foreground', label: 'Secondary FG' },
  { token: '--importance-destructive-foreground', label: 'Destructive FG' },
  { token: '--importance-neutral-foreground', label: 'Neutral FG' },
]

const importanceAccessorySwatches: SwatchEntry[] = [
  { token: '--importance-primary-accessory', label: 'Primary Accessory' },
  { token: '--importance-secondary-accessory', label: 'Secondary Accessory' },
  { token: '--importance-destructive-accessory', label: 'Destructive Accessory' },
  { token: '--importance-neutral-accessory', label: 'Neutral Accessory' },
]

const statusSwatches: SwatchEntry[] = [
  { token: '--status-ok-background', label: 'OK' },
  { token: '--status-warning-background', label: 'Warning' },
  { token: '--status-error-background', label: 'Error' },
  { token: '--status-inactive-background', label: 'Inactive' },
]

const statusInverseSwatches: SwatchEntry[] = [
  { token: '--status-ok-background-inverse', label: 'OK Inverse' },
  { token: '--status-warning-background-inverse', label: 'Warning Inverse' },
  { token: '--status-error-background-inverse', label: 'Error Inverse' },
  { token: '--status-inactive-background-inverse', label: 'Inactive Inverse' },
]

const backgroundSwatches: SwatchEntry[] = [
  { token: '--background-base', label: 'Base' },
  { token: '--background-surface', label: 'Surface' },
  { token: '--background-elevated', label: 'Elevated' },
]

const foregroundSwatches: SwatchEntry[] = [
  { token: '--foreground-emphasized', label: 'Emphasized' },
  { token: '--foreground-default', label: 'Default' },
  { token: '--foreground-muted', label: 'Muted' },
  { token: '--foreground-colorless', label: 'Colorless' },
  { token: '--foreground-colorless-inverse', label: 'Colorless Inv.' },
]

const accessorySwatches: SwatchEntry[] = [
  { token: '--accessory-emphasized', label: 'Emphasized' },
  { token: '--accessory-default', label: 'Default' },
  { token: '--accessory-muted', label: 'Muted' },
]

const tagSwatches: SwatchEntry[] = [
  { token: '--tag-orange-background', label: 'Orange' },
  { token: '--tag-brown-background', label: 'Brown' },
  { token: '--tag-green-background', label: 'Green' },
  { token: '--tag-teal-background', label: 'Teal' },
  { token: '--tag-cyan-background', label: 'Cyan' },
  { token: '--tag-blue-background', label: 'Blue' },
  { token: '--tag-indigo-background', label: 'Indigo' },
  { token: '--tag-purple-background', label: 'Purple' },
  { token: '--tag-pink-background', label: 'Pink' },
  { token: '--tag-rose-background', label: 'Rose' },
]

const tagInverseSwatches: SwatchEntry[] = [
  { token: '--tag-orange-background-inverse', label: 'Orange Tint' },
  { token: '--tag-brown-background-inverse', label: 'Brown Tint' },
  { token: '--tag-green-background-inverse', label: 'Green Tint' },
  { token: '--tag-teal-background-inverse', label: 'Teal Tint' },
  { token: '--tag-cyan-background-inverse', label: 'Cyan Tint' },
  { token: '--tag-blue-background-inverse', label: 'Blue Tint' },
  { token: '--tag-indigo-background-inverse', label: 'Indigo Tint' },
  { token: '--tag-purple-background-inverse', label: 'Purple Tint' },
  { token: '--tag-pink-background-inverse', label: 'Pink Tint' },
  { token: '--tag-rose-background-inverse', label: 'Rose Tint' },
]

export function ColorSwatches() {
  return (
    <div style={{ padding: '1rem 0' }}>
      <SwatchGroup heading="Background" entries={backgroundSwatches} />
      <SwatchGroup heading="Foreground" entries={foregroundSwatches} />
      <SwatchGroup heading="Accessory (borders)" entries={accessorySwatches} />
      <SwatchGroup heading="Importance — Solid" entries={importanceSwatches} />
      <SwatchGroup heading="Importance — Foreground" entries={importanceForegroundSwatches} />
      <SwatchGroup heading="Importance — Accessory" entries={importanceAccessorySwatches} />
      <SwatchGroup heading="Status — Solid" entries={statusSwatches} />
      <SwatchGroup heading="Status — Inverse (tinted backgrounds)" entries={statusInverseSwatches} />
      <SwatchGroup heading="Tag palette — Solid (tag colors)" entries={tagSwatches} />
      <SwatchGroup heading="Tag palette — Inverse (light tints)" entries={tagInverseSwatches} />
    </div>
  )
}
