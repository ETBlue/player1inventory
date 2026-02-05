// Tag colors with default/inverse variants
export const tagColors = {
  red: {
    default: 'var(--color-tag-red-light)',
    inverse: 'var(--color-tag-red)',
  },
  orange: {
    default: 'var(--color-tag-orange-light)',
    inverse: 'var(--color-tag-orange)',
  },
  amber: {
    default: 'var(--color-tag-amber-light)',
    inverse: 'var(--color-tag-amber)',
  },
  yellow: {
    default: 'var(--color-tag-yellow-light)',
    inverse: 'var(--color-tag-yellow)',
  },
  green: {
    default: 'var(--color-tag-green-light)',
    inverse: 'var(--color-tag-green)',
  },
  teal: {
    default: 'var(--color-tag-teal-light)',
    inverse: 'var(--color-tag-teal)',
  },
  blue: {
    default: 'var(--color-tag-blue-light)',
    inverse: 'var(--color-tag-blue)',
  },
  indigo: {
    default: 'var(--color-tag-indigo-light)',
    inverse: 'var(--color-tag-indigo)',
  },
  purple: {
    default: 'var(--color-tag-purple-light)',
    inverse: 'var(--color-tag-purple)',
  },
  pink: {
    default: 'var(--color-tag-pink-light)',
    inverse: 'var(--color-tag-pink)',
  },
} as const

export type TagColorName = keyof typeof tagColors
export type TagColorVariant = 'default' | 'inverse'

// Tag text colors
export const tagTextColors = {
  default: 'var(--color-tag-text-default)',
  inverse: 'var(--color-tag-text-bold)',
} as const

// Shadows
export const shadows = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
} as const

// Borders
export const borders = {
  default: 'var(--border-default)',
  thick: 'var(--border-thick)',
} as const

// Global states
export const globalStates = {
  normal: 'var(--color-state-normal)',
  ok: 'var(--color-state-ok)',
  warning: 'var(--color-state-warning)',
  error: 'var(--color-state-error)',
  inactive: 'var(--color-state-inactive)',
} as const

// Inventory states
export const inventoryStates = {
  lowStock: 'var(--color-inventory-low-stock)',
  expiring: 'var(--color-inventory-expiring)',
  inStock: 'var(--color-inventory-in-stock)',
  outOfStock: 'var(--color-inventory-out-of-stock)',
} as const
