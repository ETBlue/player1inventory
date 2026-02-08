# Color Showcase Storybook Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a comprehensive Storybook page showcasing all color-related design tokens with developer reference information and usage guidance.

**Architecture:** Single Storybook story file with reusable card components that programmatically render colors from the design token system. Uses runtime `getComputedStyle()` to display actual computed values for developer reference.

**Tech Stack:** React, TypeScript, Storybook, Tailwind CSS, design-tokens system

---

## Task 1: Create Base Story File and Utility Functions

**Files:**
- Create: `src/stories/Colors.stories.tsx`

**Step 1: Create story file with meta configuration**

```tsx
import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'Design Tokens/Colors',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj
```

**Step 2: Add utility function to compute color values**

Add to the same file, before the story export:

```tsx
// Utility to get computed color value from CSS variable
const getColorValue = (cssVar: string, isDark = false): string => {
  const element = document.createElement('div')
  if (isDark) {
    element.className = 'dark'
  }
  element.style.color = cssVar
  document.body.appendChild(element)
  const computed = getComputedStyle(element).color
  document.body.removeChild(element)
  return computed
}
```

**Step 3: Verify Storybook displays the page**

Run: `pnpm storybook`
Navigate to: Design Tokens → Colors
Expected: Empty page shows (no content yet, but no errors)

**Step 4: Commit base setup**

```bash
git add src/stories/Colors.stories.tsx
git commit -m "feat(storybook): add colors showcase story base

- Add story file with meta configuration
- Add getColorValue utility function

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create ColorSection Wrapper Component

**Files:**
- Modify: `src/stories/Colors.stories.tsx`

**Step 1: Add ColorSection component**

Add before the story export:

```tsx
interface ColorSectionProps {
  title: string
  description: string
  children: React.ReactNode
}

const ColorSection = ({ title, description, children }: ColorSectionProps) => (
  <section className="space-y-4">
    <div>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-muted-foreground">{description}</p>
    </div>
    {children}
  </section>
)
```

**Step 2: Create placeholder story**

Add story export:

```tsx
export const AllColors: Story = {
  render: () => (
    <div className="space-y-12 p-8">
      <ColorSection
        title="Test Section"
        description="Testing the section wrapper"
      >
        <div>Content goes here</div>
      </ColorSection>
    </div>
  ),
}
```

**Step 3: Verify component renders**

Run: `pnpm storybook`
Check: Design Tokens → Colors → AllColors
Expected: See "Test Section" heading with description

**Step 4: Commit ColorSection component**

```bash
git add src/stories/Colors.stories.tsx
git commit -m "feat(storybook): add ColorSection wrapper component

- Add section wrapper for organizing color categories
- Add placeholder story to verify rendering

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create TagColorCard Component

**Files:**
- Modify: `src/stories/Colors.stories.tsx`

**Step 1: Add TagColorCard component**

Add before the story export:

```tsx
interface TagColorCardProps {
  name: string
  defaultColor: string
  inverseColor: string
  usage: string
}

const TagColorCard = ({
  name,
  defaultColor,
  inverseColor,
  usage,
}: TagColorCardProps) => {
  const defaultValue = getColorValue(defaultColor)
  const inverseValue = getColorValue(inverseColor)

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{name}</h3>
      <div className="flex gap-2">
        {/* Default variant (light tint) */}
        <div className="flex-1 space-y-1">
          <div
            className="h-20 rounded border flex items-end justify-center p-2"
            style={{ backgroundColor: defaultColor }}
          >
            <span className="text-xs font-mono bg-white/80 px-1 rounded">
              {defaultValue}
            </span>
          </div>
          <div className="text-xs space-y-1">
            <div className="font-mono text-muted-foreground">
              --color-tag-{name.toLowerCase()}-light
            </div>
          </div>
        </div>

        {/* Inverse variant (bold) */}
        <div className="flex-1 space-y-1">
          <div
            className="h-20 rounded border flex items-end justify-center p-2"
            style={{ backgroundColor: inverseColor }}
          >
            <span className="text-xs font-mono bg-white/80 px-1 rounded">
              {inverseValue}
            </span>
          </div>
          <div className="text-xs space-y-1">
            <div className="font-mono text-muted-foreground">
              --color-tag-{name.toLowerCase()}
            </div>
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{usage}</p>
    </div>
  )
}
```

**Step 2: Update story to test TagColorCard**

Update the AllColors story:

```tsx
export const AllColors: Story = {
  render: () => (
    <div className="space-y-12 p-8">
      <ColorSection
        title="Tag Colors"
        description="10-color palette for categorizing items."
      >
        <div className="grid grid-cols-2 gap-4">
          <TagColorCard
            name="Red"
            defaultColor="var(--color-tag-red-light)"
            inverseColor="var(--color-tag-red)"
            usage="Use default for tag backgrounds with dark text. Use inverse for high-contrast emphasis."
          />
        </div>
      </ColorSection>
    </div>
  ),
}
```

**Step 3: Verify TagColorCard renders**

Run: `pnpm storybook`
Check: See red color swatches side-by-side with computed values
Expected: Two color boxes showing light and bold variants

**Step 4: Commit TagColorCard**

```bash
git add src/stories/Colors.stories.tsx
git commit -m "feat(storybook): add TagColorCard component

- Display tag color variants side-by-side
- Show CSS variable names and computed values
- Add usage guidance text

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create ThemeColorCard Component

**Files:**
- Modify: `src/stories/Colors.stories.tsx`

**Step 1: Add ThemeColorCard component**

Add before the story export:

```tsx
interface ThemeColorCardProps {
  name: string
  cssVar: string
  usage: string
}

const ThemeColorCard = ({ name, cssVar, usage }: ThemeColorCardProps) => {
  const lightValue = getColorValue(cssVar, false)
  const darkValue = getColorValue(cssVar, true)

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{name}</h3>
      <div className="flex gap-2">
        {/* Light mode */}
        <div className="flex-1 space-y-1">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Light
          </div>
          <div
            className="h-20 rounded border flex items-end justify-center p-2"
            style={{ backgroundColor: lightValue }}
          >
            <span className="text-xs font-mono bg-white/80 px-1 rounded">
              {lightValue}
            </span>
          </div>
        </div>

        {/* Dark mode */}
        <div className="flex-1 space-y-1">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Dark
          </div>
          <div
            className="h-20 rounded border flex items-end justify-center p-2"
            style={{ backgroundColor: darkValue }}
          >
            <span className="text-xs font-mono bg-black/80 text-white px-1 rounded">
              {darkValue}
            </span>
          </div>
        </div>
      </div>
      <div className="text-xs font-mono text-muted-foreground">{cssVar}</div>
      <p className="text-sm text-muted-foreground">{usage}</p>
    </div>
  )
}
```

**Step 2: Update story to test ThemeColorCard**

Update the AllColors story:

```tsx
export const AllColors: Story = {
  render: () => (
    <div className="space-y-12 p-8">
      <ColorSection
        title="Background Layers"
        description="Three-level elevation system for visual hierarchy."
      >
        <div className="grid grid-cols-3 gap-4">
          <ThemeColorCard
            name="Base"
            cssVar="var(--background-base)"
            usage="Main page background. Applied to body by default."
          />
        </div>
      </ColorSection>
    </div>
  ),
}
```

**Step 3: Verify ThemeColorCard renders**

Run: `pnpm storybook`
Check: See light/dark swatches side-by-side
Expected: Two boxes showing light and dark mode colors

**Step 4: Commit ThemeColorCard**

```bash
git add src/stories/Colors.stories.tsx
git commit -m "feat(storybook): add ThemeColorCard component

- Display light/dark mode variants side-by-side
- Show computed values for both themes
- Add CSS variable name and usage guidance

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create SimpleColorCard Component

**Files:**
- Modify: `src/stories/Colors.stories.tsx`

**Step 1: Add SimpleColorCard component**

Add before the story export:

```tsx
interface SimpleColorCardProps {
  name: string
  cssVar: string
  usage: string
}

const SimpleColorCard = ({ name, cssVar, usage }: SimpleColorCardProps) => {
  const value = getColorValue(cssVar)

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{name}</h3>
      <div
        className="h-20 rounded border flex items-end justify-center p-2"
        style={{ backgroundColor: value }}
      >
        <span className="text-xs font-mono bg-white/80 px-1 rounded">
          {value}
        </span>
      </div>
      <div className="text-xs font-mono text-muted-foreground">{cssVar}</div>
      <p className="text-sm text-muted-foreground">{usage}</p>
    </div>
  )
}
```

**Step 2: Update story to test SimpleColorCard**

Update the AllColors story:

```tsx
export const AllColors: Story = {
  render: () => (
    <div className="space-y-12 p-8">
      <ColorSection
        title="State Colors"
        description="Colors for indicating status and user feedback."
      >
        <div className="grid grid-cols-3 gap-4">
          <SimpleColorCard
            name="OK"
            cssVar="var(--color-state-ok)"
            usage="Success, positive feedback"
          />
        </div>
      </ColorSection>
    </div>
  ),
}
```

**Step 3: Verify SimpleColorCard renders**

Run: `pnpm storybook`
Check: See single green swatch with value
Expected: One color box showing OK state color

**Step 4: Commit SimpleColorCard**

```bash
git add src/stories/Colors.stories.tsx
git commit -m "feat(storybook): add SimpleColorCard component

- Display single color swatch for static colors
- Show computed value and CSS variable
- Add usage guidance

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Implement Tag Colors Section

**Files:**
- Modify: `src/stories/Colors.stories.tsx`

**Step 1: Import tag colors from design tokens**

Add at top of file:

```tsx
import { tagColors, type TagColorName } from '@/design-tokens'
```

**Step 2: Create TagColorsSection component**

Add before the story export:

```tsx
const TAG_COLOR_NAMES: TagColorName[] = [
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

const TagColorsSection = () => (
  <ColorSection
    title="Tag Colors"
    description="10-color palette for categorizing items. Each color has a light tint (default) for subtle backgrounds and a bold variant (inverse) for emphasis."
  >
    <div className="grid grid-cols-2 gap-4">
      {TAG_COLOR_NAMES.map((colorName) => (
        <TagColorCard
          key={colorName}
          name={colorName.charAt(0).toUpperCase() + colorName.slice(1)}
          defaultColor={tagColors[colorName].default}
          inverseColor={tagColors[colorName].inverse}
          usage="Use default for tag backgrounds with dark text. Use inverse for high-contrast emphasis with white text."
        />
      ))}
    </div>
  </ColorSection>
)
```

**Step 3: Update story to use TagColorsSection**

```tsx
export const AllColors: Story = {
  render: () => (
    <div className="space-y-12 p-8">
      <TagColorsSection />
    </div>
  ),
}
```

**Step 4: Verify all tag colors render**

Run: `pnpm storybook`
Check: See all 10 tag colors in 2-column grid
Expected: 10 color pairs displayed

**Step 5: Commit Tag Colors section**

```bash
git add src/stories/Colors.stories.tsx
git commit -m "feat(storybook): implement tag colors section

- Import tag colors from design tokens
- Render all 10 tag color variants programmatically
- Use 2-column grid layout

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Implement Background Layers Section

**Files:**
- Modify: `src/stories/Colors.stories.tsx`

**Step 1: Create BackgroundLayersSection component**

Add before the story export:

```tsx
const BackgroundLayersSection = () => (
  <ColorSection
    title="Background Layers"
    description="Three-level elevation system for creating visual hierarchy and depth."
  >
    <div className="grid grid-cols-3 gap-4">
      <ThemeColorCard
        name="Base"
        cssVar="var(--background-base)"
        usage="Main page background. Applied to body by default."
      />
      <ThemeColorCard
        name="Surface"
        cssVar="var(--background-surface)"
        usage="Cards, panels, list items. One level above base."
      />
      <ThemeColorCard
        name="Elevated"
        cssVar="var(--background-elevated)"
        usage="Toolbars, headers, floating elements. Highest elevation."
      />
    </div>
  </ColorSection>
)
```

**Step 2: Update story to include BackgroundLayersSection**

```tsx
export const AllColors: Story = {
  render: () => (
    <div className="space-y-12 p-8">
      <TagColorsSection />
      <BackgroundLayersSection />
    </div>
  ),
}
```

**Step 3: Verify background layers render**

Run: `pnpm storybook`
Check: See 3 background layers with light/dark variants
Expected: Base, Surface, Elevated showing progression

**Step 4: Commit Background Layers section**

```bash
git add src/stories/Colors.stories.tsx
git commit -m "feat(storybook): implement background layers section

- Add three background layer cards
- Show light/dark mode variants
- Use 3-column grid layout

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Implement State Colors Section

**Files:**
- Modify: `src/stories/Colors.stories.tsx`

**Step 1: Create StateColorsSection component**

Add before the story export:

```tsx
const StateColorsSection = () => (
  <ColorSection
    title="State Colors"
    description="Colors for indicating status and user feedback."
  >
    <div className="space-y-6">
      {/* Global States */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Global States</h3>
        <div className="grid grid-cols-3 gap-4">
          <SimpleColorCard
            name="Normal"
            cssVar="var(--color-state-normal)"
            usage="Default neutral state"
          />
          <SimpleColorCard
            name="OK"
            cssVar="var(--color-state-ok)"
            usage="Success, positive feedback"
          />
          <SimpleColorCard
            name="Warning"
            cssVar="var(--color-state-warning)"
            usage="Caution, needs attention"
          />
          <SimpleColorCard
            name="Error"
            cssVar="var(--color-state-error)"
            usage="Critical issues, errors"
          />
          <SimpleColorCard
            name="Inactive"
            cssVar="var(--color-state-inactive)"
            usage="Disabled or inactive elements"
          />
        </div>
      </div>

      {/* Inventory States */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Inventory States</h3>
        <div className="grid grid-cols-3 gap-4">
          <SimpleColorCard
            name="Low Stock"
            cssVar="var(--color-inventory-low-stock)"
            usage="Item quantity below threshold"
          />
          <SimpleColorCard
            name="Expiring"
            cssVar="var(--color-inventory-expiring)"
            usage="Item approaching expiration"
          />
          <SimpleColorCard
            name="In Stock"
            cssVar="var(--color-inventory-in-stock)"
            usage="Item available and sufficient"
          />
          <SimpleColorCard
            name="Out of Stock"
            cssVar="var(--color-inventory-out-of-stock)"
            usage="Item depleted"
          />
        </div>
      </div>
    </div>
  </ColorSection>
)
```

**Step 2: Update story to include StateColorsSection**

```tsx
export const AllColors: Story = {
  render: () => (
    <div className="space-y-12 p-8">
      <TagColorsSection />
      <BackgroundLayersSection />
      <StateColorsSection />
    </div>
  ),
}
```

**Step 3: Verify state colors render**

Run: `pnpm storybook`
Check: See 5 global states + 4 inventory states
Expected: Two subsections with color cards

**Step 4: Commit State Colors section**

```bash
git add src/stories/Colors.stories.tsx
git commit -m "feat(storybook): implement state colors section

- Add global state colors (5 colors)
- Add inventory state colors (4 colors)
- Organize into subsections

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Implement Theme Colors Section

**Files:**
- Modify: `src/stories/Colors.stories.tsx`

**Step 1: Create ThemeColorsSection component**

Add before the story export:

```tsx
const ThemeColorsSection = () => (
  <ColorSection
    title="Theme Semantic Colors"
    description="Core theme colors that adapt to light/dark mode."
  >
    <div className="grid grid-cols-3 gap-4">
      <ThemeColorCard
        name="Primary"
        cssVar="var(--primary)"
        usage="Main brand color for primary actions"
      />
      <ThemeColorCard
        name="Secondary"
        cssVar="var(--secondary)"
        usage="Secondary actions and accents"
      />
      <ThemeColorCard
        name="Accent"
        cssVar="var(--accent)"
        usage="Highlighted elements"
      />
      <ThemeColorCard
        name="Destructive"
        cssVar="var(--destructive)"
        usage="Destructive actions (delete, remove)"
      />
      <ThemeColorCard
        name="Muted"
        cssVar="var(--muted)"
        usage="Subdued backgrounds"
      />
      <ThemeColorCard
        name="Border"
        cssVar="var(--border)"
        usage="Default border color"
      />
      <ThemeColorCard
        name="Input"
        cssVar="var(--input)"
        usage="Input field borders"
      />
      <ThemeColorCard
        name="Ring"
        cssVar="var(--ring)"
        usage="Focus ring color"
      />
      <ThemeColorCard
        name="Foreground"
        cssVar="var(--foreground)"
        usage="Primary text color"
      />
      <ThemeColorCard
        name="Background"
        cssVar="var(--background)"
        usage="Base background (alias to --background-base)"
      />
      <ThemeColorCard
        name="Card"
        cssVar="var(--card)"
        usage="Card background (alias to --background-surface)"
      />
    </div>
  </ColorSection>
)
```

**Step 2: Update story to include ThemeColorsSection**

```tsx
export const AllColors: Story = {
  render: () => (
    <div className="space-y-12 p-8">
      <TagColorsSection />
      <BackgroundLayersSection />
      <StateColorsSection />
      <ThemeColorsSection />
    </div>
  ),
}
```

**Step 3: Verify theme colors render**

Run: `pnpm storybook`
Check: See 11 theme colors with light/dark variants
Expected: Complete color showcase with all sections

**Step 4: Commit Theme Colors section**

```bash
git add src/stories/Colors.stories.tsx
git commit -m "feat(storybook): implement theme colors section

- Add 11 theme semantic colors
- Show light/dark mode variants
- Complete all four color sections

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Commit Theme CSS Modifications

**Files:**
- Modify: `src/design-tokens/theme.css`

**Step 1: Review theme.css changes**

Run: `git diff src/design-tokens/theme.css`
Check: User's modifications to background colors and hue values

**Step 2: Commit theme modifications**

```bash
git add src/design-tokens/theme.css
git commit -m "refactor(tokens): update theme color values

- Adjust background layer lightness values
- Add warm hue (45deg) to base colors
- Fine-tune dark mode base background

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 3: Verify colors update in Storybook**

Run: `pnpm storybook`
Check: Design Tokens → Colors
Expected: Computed values reflect new theme colors

---

## Completion Checklist

- [ ] Base story file created with utility functions
- [ ] ColorSection wrapper component implemented
- [ ] TagColorCard component created
- [ ] ThemeColorCard component created
- [ ] SimpleColorCard component created
- [ ] Tag Colors section (10 colors × 2 variants)
- [ ] Background Layers section (3 layers × light/dark)
- [ ] State Colors section (5 global + 4 inventory)
- [ ] Theme Colors section (11 semantic colors)
- [ ] Theme CSS modifications committed
- [ ] All sections render correctly in Storybook
- [ ] Computed values display accurately

## Notes

- All color data comes from existing design token system
- Computed values update automatically when CSS changes
- No testing required (this is visual documentation)
- Page works in both Storybook light and dark themes
- Grid layouts optimize for scanning: 2-col for tags, 3-col for others
