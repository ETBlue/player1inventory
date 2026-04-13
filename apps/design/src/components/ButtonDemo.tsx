import * as React from 'react'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'neutral'
  | 'primary-outline'
  | 'secondary-outline'
  | 'destructive-outline'
  | 'neutral-outline'
  | 'primary-ghost'
  | 'secondary-ghost'
  | 'destructive-ghost'
  | 'neutral-ghost'
  | 'primary-link'
  | 'secondary-link'
  | 'destructive-link'
  | 'neutral-link'

interface DemoButtonProps {
  variant: ButtonVariant
  label: string
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--importance-primary)',
    borderColor: 'var(--importance-primary)',
    color: 'var(--foreground-colorless-inverse)',
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  },
  secondary: {
    backgroundColor: 'var(--importance-secondary)',
    borderColor: 'var(--importance-secondary)',
    color: 'var(--foreground-colorless-inverse)',
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  },
  destructive: {
    backgroundColor: 'var(--importance-destructive)',
    borderColor: 'var(--importance-destructive)',
    color: 'var(--foreground-colorless-inverse)',
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  },
  neutral: {
    backgroundColor: 'var(--importance-neutral)',
    borderColor: 'var(--importance-neutral)',
    color: 'var(--foreground-colorless-inverse)',
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  },
  'primary-outline': {
    backgroundColor: 'transparent',
    borderColor: 'var(--importance-primary)',
    color: 'var(--importance-primary-foreground)',
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  },
  'secondary-outline': {
    backgroundColor: 'transparent',
    borderColor: 'var(--importance-secondary)',
    color: 'var(--importance-secondary-foreground)',
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  },
  'destructive-outline': {
    backgroundColor: 'transparent',
    borderColor: 'var(--importance-destructive)',
    color: 'var(--importance-destructive-foreground)',
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  },
  'neutral-outline': {
    backgroundColor: 'transparent',
    borderColor: 'var(--importance-neutral)',
    color: 'var(--importance-neutral-foreground)',
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  },
  'primary-ghost': {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: 'var(--importance-primary-foreground)',
  },
  'secondary-ghost': {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: 'var(--importance-secondary-foreground)',
  },
  'destructive-ghost': {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: 'var(--importance-destructive-foreground)',
  },
  'neutral-ghost': {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: 'var(--importance-neutral-foreground)',
  },
  'primary-link': {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: 'var(--importance-primary-foreground)',
    textDecoration: 'underline',
    textUnderlineOffset: '4px',
  },
  'secondary-link': {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: 'var(--importance-secondary-foreground)',
    textDecoration: 'underline',
    textUnderlineOffset: '4px',
  },
  'destructive-link': {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: 'var(--importance-destructive-foreground)',
    textDecoration: 'underline',
    textUnderlineOffset: '4px',
  },
  'neutral-link': {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: 'var(--importance-neutral-foreground)',
    textDecoration: 'underline',
    textUnderlineOffset: '4px',
  },
}

const baseButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  whiteSpace: 'nowrap',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderRadius: '0.125rem',
  fontWeight: '500',
  fontSize: '0.875rem',
  height: '2rem',
  padding: '0 1rem',
  cursor: 'pointer',
  opacity: '0.9',
  fontFamily: 'inherit',
}

function DemoButton({ variant, label }: DemoButtonProps) {
  return (
    <button
      type="button"
      style={{ ...baseButtonStyle, ...variantStyles[variant] }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
    >
      {label}
    </button>
  )
}

const groups = [
  {
    heading: 'Solid (importance)',
    buttons: [
      { variant: 'primary' as ButtonVariant, label: 'Primary' },
      { variant: 'secondary' as ButtonVariant, label: 'Secondary' },
      { variant: 'destructive' as ButtonVariant, label: 'Destructive' },
      { variant: 'neutral' as ButtonVariant, label: 'Neutral' },
    ],
  },
  {
    heading: 'Outline',
    buttons: [
      { variant: 'primary-outline' as ButtonVariant, label: 'Primary' },
      { variant: 'secondary-outline' as ButtonVariant, label: 'Secondary' },
      { variant: 'destructive-outline' as ButtonVariant, label: 'Destructive' },
      { variant: 'neutral-outline' as ButtonVariant, label: 'Neutral' },
    ],
  },
  {
    heading: 'Ghost',
    buttons: [
      { variant: 'primary-ghost' as ButtonVariant, label: 'Primary' },
      { variant: 'secondary-ghost' as ButtonVariant, label: 'Secondary' },
      { variant: 'destructive-ghost' as ButtonVariant, label: 'Destructive' },
      { variant: 'neutral-ghost' as ButtonVariant, label: 'Neutral' },
    ],
  },
  {
    heading: 'Link',
    buttons: [
      { variant: 'primary-link' as ButtonVariant, label: 'Primary' },
      { variant: 'secondary-link' as ButtonVariant, label: 'Secondary' },
      { variant: 'destructive-link' as ButtonVariant, label: 'Destructive' },
      { variant: 'neutral-link' as ButtonVariant, label: 'Neutral' },
    ],
  },
]

export function ButtonDemo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem 0' }}>
      {groups.map(group => (
        <div key={group.heading}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--foreground-muted)',
            marginBottom: '0.5rem',
          }}>
            {group.heading}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {group.buttons.map(btn => (
              <DemoButton key={btn.variant} variant={btn.variant} label={btn.label} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
