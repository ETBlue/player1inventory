// scripts/audit-contrast.ts
// Usage: npx tsx scripts/audit-contrast.ts
//
// Parses theme.css, extracts all oklch(...) token values, and checks
// key text/background pairs against WCAG AA contrast requirements.

import { parse, wcagContrast } from 'culori'
import { readFileSync } from 'node:fs'

const src = readFileSync('apps/web/src/design-tokens/theme.css', 'utf8')

// Extract token values: --token-name: oklch(...) or hsl(...) etc.
function extractTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  const re = /--([\w-]+)\s*:\s*(oklch\([^)]+\)|hsl\([^)]+\)|#[\da-f]+|\w+\([^)]+\))/gi
  for (const m of css.matchAll(re)) {
    tokens[m[1]] = m[2]
  }
  return tokens
}

// Extract light mode tokens (from :root block) and dark mode tokens (from .dark block)
const lightSection = src.match(/:root\s*\{([^}]+)\}/s)?.[1] ?? ''
const darkSection = src.match(/\.dark\s*\{([^}]+)\}/s)?.[1] ?? ''
const light = extractTokens(lightSection)
const dark = extractTokens(darkSection)

function ratio(fg: string, bg: string): number {
  const f = parse(fg), b = parse(bg)
  if (!f || !b) return 0
  return Math.round(wcagContrast(f, b) * 100) / 100
}

function row(mode: string, fgName: string, bgName: string, tokens: Record<string, string>, required: number) {
  const fg = tokens[fgName], bg = tokens[bgName]
  if (!fg || !bg) { console.log(`  ${mode} | MISSING: ${fgName} or ${bgName}`); return }
  const r = ratio(fg, bg)
  const pass = r >= required ? '✅' : '❌'
  console.log(`  ${pass} ${mode.padEnd(6)} | ${r.toFixed(2).padStart(5)}:1 (need ${required}:1) | ${fgName} on ${bgName}`)
}

console.log('\n=== WCAG Contrast Audit ===\n')

// Light mode pairs
const lightPairs: [string, string, number][] = [
  ['foreground-default', 'background-base', 4.5],
  ['foreground-muted', 'background-base', 4.5],
  ['foreground-emphasized', 'background-base', 4.5],
  ['foreground-default', 'background-surface', 4.5],
  ['foreground-default', 'background-elevated', 4.5],
  ['importance-primary', 'background-base', 4.5],
  ['importance-secondary', 'background-base', 4.5],
  ['importance-destructive', 'background-base', 4.5],
  ['status-ok', 'status-ok-tint', 4.5],
  ['status-warning', 'status-warning-tint', 4.5],
  ['status-error', 'status-error-tint', 4.5],
  ['status-inactive', 'status-inactive-tint', 4.5],
]
for (const [fg, bg, req] of lightPairs) row('light', fg, bg, light, req)

// Hue colors on white
const white = 'oklch(100% 0% 0)'
const hues = ['red','orange','amber','yellow','green','teal','blue','indigo','purple','pink','brown','lime','cyan','rose']
console.log()
for (const h of hues) {
  const fg = light[`hue-${h}`]
  if (!fg) { console.log(`  -- light  | hue-${h}: not found`); continue }
  const r = ratio(fg, white)
  const pass = r >= 4.5 ? '✅' : '❌'
  console.log(`  ${pass} light  | ${r.toFixed(2).padStart(5)}:1 (need 4.5:1) | hue-${h} on white`)
}

// Dark mode pairs
console.log()
const darkPairs: [string, string, number][] = [
  ['foreground-default', 'background-base', 4.5],
  ['foreground-muted', 'background-base', 4.5],
  ['importance-primary', 'background-base', 4.5],
  ['importance-destructive', 'background-base', 4.5],
  ['status-ok', 'status-ok-tint', 4.5],
  ['status-warning', 'status-warning-tint', 4.5],
  ['status-error', 'status-error-tint', 4.5],
  ['status-inactive', 'status-inactive-tint', 4.5],
]
for (const [fg, bg, req] of darkPairs) row('dark', fg, bg, { ...light, ...dark }, req)

// Hue colors on dark background-base
const darkBg = dark['background-base'] ?? light['background-base']
console.log()
for (const h of hues) {
  const fg = dark[`hue-${h}`] ?? light[`hue-${h}`]  // dark mode overrides first, fall back to light
  if (!fg) { console.log(`  -- dark   | hue-${h}: not found`); continue }
  const r = ratio(fg, darkBg)
  const pass = r >= 4.5 ? '✅' : '❌'
  console.log(`  ${pass} dark   | ${r.toFixed(2).padStart(5)}:1 (need 4.5:1) | hue-${h} on dark background-base`)
}
