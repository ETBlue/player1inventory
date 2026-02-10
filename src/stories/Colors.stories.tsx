import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useRef, useState } from 'react'
import { type ColorName, colors } from '@/design-tokens'

const meta: Meta = {
  title: 'Design Tokens/Colors',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj

// Utility to convert RGB values to HSL
const rgbToHSL = (r: number, g: number, b: number): string => {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
}

// Utility to convert hex to HSL
const _hexToHSL = (hex: string): string => {
  // Remove # if present
  hex = hex.replace(/^#/, '')

  // Parse RGB values
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)

  return rgbToHSL(r, g, b)
}

// Utility to parse rgb()/rgba() string and convert to HSL
const parseRgbToHSL = (rgbString: string): string => {
  const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return rgbString

  const r = Number.parseInt(match[1], 10)
  const g = Number.parseInt(match[2], 10)
  const b = Number.parseInt(match[3], 10)

  return rgbToHSL(r, g, b)
}

// Hook to read computed color value from element ref
const useComputedColor = (_cssVar: string) => {
  const ref = useRef<HTMLDivElement>(null)
  const [colorValue, setColorValue] = useState<string>('')

  useEffect(() => {
    if (!ref.current) return

    const computedStyle = getComputedStyle(ref.current)
    const bgColor = computedStyle.backgroundColor

    // Convert RGB to HSL
    const hslValue = parseRgbToHSL(bgColor)
    setColorValue(hslValue)
  }, [])

  return { ref, colorValue }
}

interface ColorSectionProps {
  title: string
  description: string
  children: React.ReactNode
}

const ColorSection = ({ title, description, children }: ColorSectionProps) => (
  <section className="space-y-4">
    <div>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-foreground-muted">{description}</p>
    </div>
    {children}
  </section>
)

interface ColorCardProps {
  name: string
  tintColor: string
  defaultColor: string
  usage: string
}

const ColorCard = ({
  name,
  tintColor,
  defaultColor,
  usage,
}: ColorCardProps) => {
  const tint = useComputedColor(tintColor)
  const defaultVariant = useComputedColor(defaultColor)

  return (
    <div className="space-y-2">
      <h3 className="font-semibold capitalize">{name}</h3>
      <div className="flex gap-2">
        {/* Tint variant */}
        <div className="flex-1 space-y-1">
          <div
            ref={tint.ref}
            className="h-20 rounded border flex items-end justify-center p-2"
            style={{ backgroundColor: tintColor }}
          >
            <span className="text-xs font-mono bg-background-elevated/90 border px-1 rounded">
              {tint.colorValue}
            </span>
          </div>
          <div className="text-xs space-y-1">
            <div className="font-mono text-foreground-muted">
              --color-{name}-tint
            </div>
          </div>
        </div>

        {/* Default variant */}
        <div className="flex-1 space-y-1">
          <div
            ref={defaultVariant.ref}
            className="h-20 rounded border flex items-end justify-center p-2"
            style={{ backgroundColor: defaultColor }}
          >
            <span className="text-xs font-mono bg-background-elevated/90 border px-1 rounded">
              {defaultVariant.colorValue}
            </span>
          </div>
          <div className="text-xs space-y-1">
            <div className="font-mono text-foreground-muted">
              --color-{name}
            </div>
          </div>
        </div>
      </div>
      <p className="text-sm text-foreground-muted">{usage}</p>
    </div>
  )
}

interface ThemeColorCardProps {
  name: string
  cssVar: string
  usage: string
}

const ThemeColorCard = ({ name, cssVar, usage }: ThemeColorCardProps) => {
  const { ref, colorValue } = useComputedColor(cssVar)

  return (
    <div className="space-y-2">
      <h3 className="font-semibold capitalize">{name}</h3>
      <div
        ref={ref}
        className="h-20 rounded border flex items-end justify-center p-2"
        style={{ backgroundColor: cssVar }}
      >
        <span className="text-xs font-mono bg-background-elevated/90 border px-1 rounded">
          {colorValue}
        </span>
      </div>
      <div className="text-xs font-mono text-foreground-muted">{cssVar}</div>
      <p className="text-sm text-foreground-muted">{usage}</p>
    </div>
  )
}

interface SimpleColorCardProps {
  name: string
  cssVar: string
  usage: string
}

const SimpleColorCard = ({ name, cssVar, usage }: SimpleColorCardProps) => {
  const { ref, colorValue } = useComputedColor(cssVar)

  return (
    <div className="space-y-2">
      <h3 className="font-semibold capitalize">{name}</h3>
      <div
        ref={ref}
        className="h-20 rounded border flex items-end justify-center p-2"
        style={{ backgroundColor: cssVar }}
      >
        <span className="text-xs font-mono bg-background-elevated/90 border px-1 rounded">
          {colorValue}
        </span>
      </div>
      <div className="text-xs font-mono text-foreground-muted">{cssVar}</div>
      <p className="text-sm text-foreground-muted">{usage}</p>
    </div>
  )
}

const COLOR_NAMES: ColorName[] = [
  'red',
  'orange',
  'amber',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
]

export const AllColors: Story = {
  render: () => (
    <div className="space-y-12 p-8">
      {/* Colors by Hue */}
      <ColorSection
        title="Colors by Hue"
        description="10-color palette organized by hue. Each color has a light tint variant and a default bold variant."
      >
        <div className="grid grid-cols-2 gap-4">
          {COLOR_NAMES.map((colorName) => (
            <ColorCard
              key={colorName}
              name={colorName}
              tintColor={colors[colorName].tint}
              defaultColor={colors[colorName].default}
              usage="Use tint for subtle backgrounds. Use default for emphasis and high contrast."
            />
          ))}
        </div>
      </ColorSection>

      {/* Background Layers */}
      <ColorSection
        title="Background Layers"
        description="Three-level elevation system for creating visual hierarchy. Lightness increases from base to elevated in light mode, and brightness increases in dark mode. Toggle Storybook theme to see how these colors adapt."
      >
        <div className="grid grid-cols-3 gap-4">
          <ThemeColorCard
            name="base"
            cssVar="var(--color-background-base)"
            usage="Main page background. Applied to body by default."
          />
          <ThemeColorCard
            name="surface"
            cssVar="var(--color-background-surface)"
            usage="Cards, panels, list items. One level above base."
          />
          <ThemeColorCard
            name="elevated"
            cssVar="var(--color-background-elevated)"
            usage="Toolbars, headers, floating elements. Highest elevation."
          />
        </div>
      </ColorSection>

      {/* Foreground Colors */}
      <ColorSection
        title="Foreground Colors"
        description="Text and content colors with three levels of emphasis. Use for typography and readable content. Toggle Storybook theme to see how these colors adapt."
      >
        <div className="grid grid-cols-3 gap-4">
          <ThemeColorCard
            name="muted"
            cssVar="var(--color-foreground-muted)"
            usage="Secondary text, captions, placeholders."
          />
          <ThemeColorCard
            name="default"
            cssVar="var(--color-foreground-default)"
            usage="Primary text, body copy, default content."
          />
          <ThemeColorCard
            name="emphasized"
            cssVar="var(--color-foreground-emphasized)"
            usage="Headings, emphasized text, important labels."
          />
        </div>
      </ColorSection>

      {/* Accessory Colors */}
      <ColorSection
        title="Accessory Colors"
        description="Colors for borders, dividers, and decorative elements. Subtle visual accents that support content hierarchy. Toggle Storybook theme to see how these colors adapt."
      >
        <div className="grid grid-cols-3 gap-4">
          <ThemeColorCard
            name="muted"
            cssVar="var(--color-accessory-muted)"
            usage="Subtle dividers, background borders."
          />
          <ThemeColorCard
            name="default"
            cssVar="var(--color-accessory-default)"
            usage="Standard borders, input outlines."
          />
          <ThemeColorCard
            name="emphasized"
            cssVar="var(--color-accessory-emphasized)"
            usage="Active borders, focused states, prominent dividers."
          />
        </div>
      </ColorSection>

      {/* Importance Colors */}
      <ColorSection
        title="Importance Colors"
        description="Semantic colors indicating priority and action types. Colors adapt between light and dark modes while maintaining their semantic meaning. Toggle Storybook theme to see how these colors adapt."
      >
        <div className="grid grid-cols-3 gap-4">
          <ThemeColorCard
            name="primary"
            cssVar="var(--color-importance-primary)"
            usage="Primary actions, key interactive elements."
          />
          <ThemeColorCard
            name="secondary"
            cssVar="var(--color-importance-secondary)"
            usage="Secondary actions, supporting elements."
          />
          <ThemeColorCard
            name="tertiary"
            cssVar="var(--color-importance-tertiary)"
            usage="Tertiary actions, low-priority elements."
          />
          <ThemeColorCard
            name="destructive"
            cssVar="var(--color-importance-destructive)"
            usage="Destructive actions, warnings, errors."
          />
          <ThemeColorCard
            name="neutral"
            cssVar="var(--color-importance-neutral)"
            usage="Neutral actions, informational elements."
          />
        </div>
      </ColorSection>

      {/* Status Colors */}
      <ColorSection
        title="Status Colors"
        description="Colors for indicating system and item status. Used for feedback, notifications, and state visualization. Toggle Storybook theme to see how these colors adapt."
      >
        <div className="grid grid-cols-3 gap-4">
          <SimpleColorCard
            name="ok"
            cssVar="var(--color-status-ok)"
            usage="Success states, positive feedback, items in stock."
          />
          <SimpleColorCard
            name="warning"
            cssVar="var(--color-status-warning)"
            usage="Warning states, items needing attention, low stock."
          />
          <SimpleColorCard
            name="error"
            cssVar="var(--color-status-error)"
            usage="Error states, critical issues, expiring items."
          />
          <SimpleColorCard
            name="inactive"
            cssVar="var(--color-status-inactive)"
            usage="Disabled states, inactive elements, out of stock items."
          />
        </div>
      </ColorSection>
    </div>
  ),
}
