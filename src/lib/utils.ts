import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns 'white' or 'black' based on background color luminance
 * Uses W3C relative luminance formula
 */
export function getContrastTextColor(hexColor: string): 'white' | 'black' {
  // Parse hex to RGB (handle both #RGB and #RRGGBB)
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255

  // Calculate relative luminance (sRGB)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

  return luminance > 0.5 ? 'black' : 'white'
}
