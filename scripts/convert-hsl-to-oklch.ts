// culori is installed in the web package — resolve explicitly for scripts/ context
import { parse, oklch, clampChroma } from '../node_modules/.pnpm/node_modules/culori/src/index.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const C_MAX = 0.4
const __dirname = dirname(fileURLToPath(import.meta.url))
const filePath = resolve(__dirname, '../apps/web/src/design-tokens/theme.css')

function hslToOklch(hslString: string): string {
  const color = parse(hslString)
  if (!color) return hslString
  const ok = clampChroma(oklch(color), 'oklch')
  if (!ok) return hslString
  const l = (ok.l * 100).toFixed(1).replace(/\.0$/, '')
  const c = ((ok.c / C_MAX) * 100).toFixed(1).replace(/\.0$/, '')
  const h = (ok.h ?? 0).toFixed(1).replace(/\.0$/, '')
  return `oklch(${l}% ${c}% ${h})`
}

const src = readFileSync(filePath, 'utf8')
const result = src.replace(
  /hsl\(\s*[\d.]+\s+[\d.]+%\s+[\d.]+%\s*\)/g,
  (match) => hslToOklch(match)
)

if (process.argv.includes('--write')) {
  writeFileSync(filePath, result, 'utf8')
  console.log(`Written: ${filePath}`)
} else {
  process.stdout.write(result)
}
