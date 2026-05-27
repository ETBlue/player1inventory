import * as React from 'react'

const t = {
  base: 'var(--background-base)',
  surface: 'var(--background-surface)',
  elevated: 'var(--background-elevated)',
  border: 'var(--accessory-muted)',
  fg: 'var(--foreground-default)',
  fgMuted: 'var(--foreground-muted)',
}

function Toolbar() {
  return (
    <div
      style={{
        height: 28,
        background: t.surface,
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        gap: 4,
        flexShrink: 0,
      }}
    >
      <div style={{ width: 12, height: 12, background: t.fgMuted, borderRadius: 2 }} />
      <div style={{ flex: 1, height: 7, background: t.border, borderRadius: 2 }} />
      <div style={{ width: 12, height: 12, background: t.fgMuted, borderRadius: 2 }} />
    </div>
  )
}

function ListRows({ count = 5 }: { count?: number }) {
  return (
    <div
      style={{
        flex: 1,
        overflow: 'hidden',
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ height: 18, background: t.elevated, borderRadius: 2, flexShrink: 0 }}
        />
      ))}
    </div>
  )
}

function BottomNav() {
  return (
    <div
      style={{
        height: 36,
        background: t.surface,
        borderTop: `1px solid ${t.border}`,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        flexShrink: 0,
      }}
    >
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              background: i === 0 ? t.fg : t.fgMuted,
              borderRadius: 2,
            }}
          />
          <div
            style={{
              width: 18,
              height: 3,
              background: i === 0 ? t.fg : t.fgMuted,
              borderRadius: 1,
            }}
          />
        </div>
      ))}
    </div>
  )
}

function SidebarNav() {
  return (
    <div
      style={{
        width: 56,
        background: t.surface,
        borderRight: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: 4,
        flexShrink: 0,
      }}
    >
      <div
        style={{ height: 8, background: t.fgMuted, borderRadius: 1, marginBottom: 6 }}
      />
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            height: 14,
            background: i === 0 ? t.elevated : 'transparent',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '0 3px',
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              background: i === 0 ? t.fg : t.fgMuted,
              borderRadius: 1,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              height: 4,
              background: i === 0 ? t.fg : t.fgMuted,
              borderRadius: 1,
              opacity: i === 0 ? 1 : 0.4,
            }}
          />
        </div>
      ))}
    </div>
  )
}

function FormFields() {
  return (
    <div
      style={{
        flex: 1,
        overflow: 'hidden',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: t.elevated,
      }}
    >
      {[0, 1, 2].map(i => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div
            style={{
              height: 5,
              width: '50%',
              background: t.fgMuted,
              borderRadius: 1,
              opacity: 0.5,
            }}
          />
          <div
            style={{
              height: 14,
              background: t.base,
              borderRadius: 2,
              border: `1px solid ${t.border}`,
            }}
          />
        </div>
      ))}
    </div>
  )
}

function DiagramCard({
  label,
  width,
  height,
  children,
}: {
  label: string
  width: number
  height: number
  children: React.ReactNode
}) {
  return (
    <figure
      style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}
    >
      <div
        style={{
          width,
          height,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: t.base,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
      <figcaption
        style={{
          fontSize: 12,
          color: t.fgMuted,
          textAlign: 'center',
          lineHeight: 1.3,
          maxWidth: `${width}px`,
        }}
      >
        {label}
      </figcaption>
    </figure>
  )
}

export function MobileLayouts() {
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '16px 0' }}>
      <DiagramCard label="Toolbar + scrollable list" width={120} height={200}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Toolbar />
          <ListRows count={5} />
        </div>
        <BottomNav />
      </DiagramCard>

      <DiagramCard label="Fullscreen toolbar + list" width={120} height={200}>
        <Toolbar />
        <ListRows count={7} />
      </DiagramCard>

      <DiagramCard label="Padded form page" width={120} height={200}>
        <FormFields />
      </DiagramCard>
    </div>
  )
}

export function DesktopLayouts() {
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '16px 0' }}>
      <DiagramCard label="Sidebar + toolbar + scrollable list" width={260} height={160}>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <SidebarNav />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Toolbar />
            <ListRows count={4} />
          </div>
        </div>
      </DiagramCard>

      <DiagramCard label="Fullscreen toolbar + list" width={260} height={160}>
        <Toolbar />
        <ListRows count={4} />
      </DiagramCard>

      <DiagramCard label="Padded form page" width={260} height={160}>
        <FormFields />
      </DiagramCard>
    </div>
  )
}
