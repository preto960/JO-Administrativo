'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// oklch values matching the format in globals.css
// Each color has light (:root) and dark (.dark) variants
const colorOptions = [
  {
    name: 'Esmeralda',
    value: 'emerald',
    color: '#059669',
    oklch: { light: 'oklch(0.508 0.163 160)', dark: 'oklch(0.627 0.163 160)', fg_light: 'oklch(0.995 0.002 155)', fg_dark: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Azul',
    value: 'blue',
    color: '#2563eb',
    oklch: { light: 'oklch(0.546 0.245 262.881)', dark: 'oklch(0.685 0.196 262.881)', fg_light: 'oklch(0.995 0.002 155)', fg_dark: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Violeta',
    value: 'purple',
    color: '#7c3aed',
    oklch: { light: 'oklch(0.541 0.281 293.009)', dark: 'oklch(0.685 0.222 293.009)', fg_light: 'oklch(0.995 0.002 155)', fg_dark: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Rojo',
    value: 'red',
    color: '#dc2626',
    oklch: { light: 'oklch(0.577 0.245 27.325)', dark: 'oklch(0.704 0.191 22.216)', fg_light: 'oklch(0.995 0.002 155)', fg_dark: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Naranja',
    value: 'orange',
    color: '#ea580c',
    oklch: { light: 'oklch(0.637 0.237 47.604)', dark: 'oklch(0.766 0.187 47.604)', fg_light: 'oklch(0.995 0.002 155)', fg_dark: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Rosa',
    value: 'pink',
    color: '#db2777',
    oklch: { light: 'oklch(0.592 0.249 342.258)', dark: 'oklch(0.708 0.199 342.258)', fg_light: 'oklch(0.995 0.002 155)', fg_dark: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Cyan',
    value: 'cyan',
    color: '#0891b2',
    oklch: { light: 'oklch(0.522 0.135 218.811)', dark: 'oklch(0.685 0.149 218.811)', fg_light: 'oklch(0.995 0.002 155)', fg_dark: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Slate',
    value: 'slate',
    color: '#475569',
    oklch: { light: 'oklch(0.398 0.02 255)', dark: 'oklch(0.568 0.025 255)', fg_light: 'oklch(0.995 0.002 155)', fg_dark: 'oklch(0.145 0.015 155)' },
  },
]

// Exported so SettingsInitializer can use it
export function getColorDef(value: string) {
  return colorOptions.find(c => c.value === value) || colorOptions[0]
}

/** Apply a primary color to the document CSS variables (for primary color) */
export function applyPrimaryColor(colorValue: string) {
  const color = getColorDef(colorValue)
  const root = document.documentElement
  const isDark = root.classList.contains('dark')

  const primary = isDark ? color.oklch.dark : color.oklch.light
  const fg = isDark ? color.oklch.fg_dark : color.oklch.fg_light

  root.style.setProperty('--primary', primary)
  root.style.setProperty('--primary-foreground', fg)
  root.style.setProperty('--ring', primary)
  root.style.setProperty('--chart-1', primary)
  root.style.setProperty('--sidebar-primary', primary)
  root.style.setProperty('--sidebar-primary-foreground', fg)
  root.style.setProperty('--sidebar-ring', primary)
}

/** Apply a secondary color to the document CSS variables */
export function applySecondaryColor(colorValue: string) {
  const color = getColorDef(colorValue)
  const root = document.documentElement
  const isDark = root.classList.contains('dark')

  // Secondary colors are typically more muted versions
  const secondary = isDark ? color.oklch.dark : color.oklch.light
  const fg = isDark ? color.oklch.fg_dark : color.oklch.fg_light

  // Use a lighter/more transparent version for secondary
  root.style.setProperty('--secondary', secondary)
  root.style.setProperty('--secondary-foreground', fg)
}

interface ColorPickerProps {
  value: string
  onChange: (value: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const selected = colorOptions.find(c => c.value === value) || colorOptions[0]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {colorOptions.map((color) => (
          <button
            key={color.value}
            onClick={() => onChange(color.value)}
            className={cn(
              'relative h-9 w-9 rounded-full border-2 transition-all hover:scale-110',
              value === color.value ? 'border-foreground ring-2 ring-offset-2 ring-offset-background' : 'border-transparent'
            )}
            style={{ backgroundColor: color.color }}
            title={color.name}
          >
            {value === color.value && (
              <Check className="h-4 w-4 text-white absolute inset-0 m-auto" />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: selected.color }} />
        <span className="text-sm text-muted-foreground">
          Seleccionado: <span className="font-medium text-foreground">{selected.name}</span>
        </span>
      </div>
    </div>
  )
}
