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
  { token: '--importance-primary', label: 'Primary' },
  { token: '--importance-secondary', label: 'Secondary' },
  { token: '--importance-destructive', label: 'Destructive' },
  { token: '--importance-neutral', label: 'Neutral' },
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
  { token: '--status-ok', label: 'OK' },
  { token: '--status-warning', label: 'Warning' },
  { token: '--status-error', label: 'Error' },
  { token: '--status-inactive', label: 'Inactive' },
]

const statusInverseSwatches: SwatchEntry[] = [
  { token: '--status-ok-inverse', label: 'OK Inverse' },
  { token: '--status-warning-inverse', label: 'Warning Inverse' },
  { token: '--status-error-inverse', label: 'Error Inverse' },
  { token: '--status-inactive-inverse', label: 'Inactive Inverse' },
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

const hueSwatches: SwatchEntry[] = [
  { token: '--hue-orange', label: 'Orange' },
  { token: '--hue-brown', label: 'Brown' },
  { token: '--hue-green', label: 'Green' },
  { token: '--hue-teal', label: 'Teal' },
  { token: '--hue-cyan', label: 'Cyan' },
  { token: '--hue-blue', label: 'Blue' },
  { token: '--hue-indigo', label: 'Indigo' },
  { token: '--hue-purple', label: 'Purple' },
  { token: '--hue-pink', label: 'Pink' },
  { token: '--hue-rose', label: 'Rose' },
]

const hueInverseSwatches: SwatchEntry[] = [
  { token: '--hue-orange-inverse', label: 'Orange Tint' },
  { token: '--hue-brown-inverse', label: 'Brown Tint' },
  { token: '--hue-green-inverse', label: 'Green Tint' },
  { token: '--hue-teal-inverse', label: 'Teal Tint' },
  { token: '--hue-cyan-inverse', label: 'Cyan Tint' },
  { token: '--hue-blue-inverse', label: 'Blue Tint' },
  { token: '--hue-indigo-inverse', label: 'Indigo Tint' },
  { token: '--hue-purple-inverse', label: 'Purple Tint' },
  { token: '--hue-pink-inverse', label: 'Pink Tint' },
  { token: '--hue-rose-inverse', label: 'Rose Tint' },
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
      <SwatchGroup heading="Hue palette — Solid (tag colors)" entries={hueSwatches} />
      <SwatchGroup heading="Hue palette — Inverse (light tints)" entries={hueInverseSwatches} />
    </div>
  )
}
