import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TagColor } from '@/types'

interface ColorSelectProps {
  value: TagColor
  onChange: (color: TagColor) => void
  id?: string
}

export function ColorSelect({ value, onChange, id }: ColorSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (color: TagColor) => {
    onChange(color)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-full items-center justify-between rounded-sm px-3 py-2 text-foreground-default bg-background-surface border border-accessory-default focus:outline-none focus:border-accessory-emphasized disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
      >
        <div className="flex items-center gap-2">
          <Badge variant={value} className="pointer-events-none">
            {value}
          </Badge>
        </div>
        <svg
          className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-sm border border-accessory-default bg-background-surface shadow-lg max-h-60 overflow-auto">
          <div className="p-1">
            {Object.values(TagColor).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleSelect(color)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-background-elevated transition-colors text-left',
                  value === color && 'bg-background-elevated',
                )}
              >
                <Badge variant={color} className="pointer-events-none">
                  {color}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
