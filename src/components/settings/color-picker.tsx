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
    light: { primary: 'oklch(0.508 0.163 160)', fg: 'oklch(0.995 0.002 155)' },
    dark: { primary: 'oklch(0.627 0.163 160)', fg: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Azul',
    value: 'blue',
    color: '#2563eb',
    light: { primary: 'oklch(0.546 0.245 262.881)', fg: 'oklch(0.995 0.002 155)' },
    dark: { primary: 'oklch(0.685 0.196 262.881)', fg: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Violeta',
    value: 'purple',
    color: '#7c3aed',
    light: { primary: 'oklch(0.541 0.281 293.009)', fg: 'oklch(0.995 0.002 155)' },
    dark: { primary: 'oklch(0.685 0.222 293.009)', fg: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Rojo',
    value: 'red',
    color: '#dc2626',
    light: { primary: 'oklch(0.577 0.245 27.325)', fg: 'oklch(0.995 0.002 155)' },
    dark: { primary: 'oklch(0.704 0.191 22.216)', fg: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Naranja',
    value: 'orange',
    color: '#ea580c',
    light: { primary: 'oklch(0.637 0.237 47.604)', fg: 'oklch(0.995 0.002 155)' },
    dark: { primary: 'oklch(0.766 0.187 47.604)', fg: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Rosa',
    value: 'pink',
    color: '#db2777',
    light: { primary: 'oklch(0.592 0.249 342.258)', fg: 'oklch(0.995 0.002 155)' },
    dark: { primary: 'oklch(0.708 0.199 342.258)', fg: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Cyan',
    value: 'cyan',
    color: '#0891b2',
    light: { primary: 'oklch(0.522 0.135 218.811)', fg: 'oklch(0.995 0.002 155)' },
    dark: { primary: 'oklch(0.685 0.149 218.811)', fg: 'oklch(0.145 0.015 155)' },
  },
  {
    name: 'Slate',
    value: 'slate',
    color: '#475569',
    light: { primary: 'oklch(0.398 0.02 255)', fg: 'oklch(0.995 0.002 155)' },
    dark: { primary: 'oklch(0.568 0.025 255)', fg: 'oklch(0.145 0.015 155)' },
  },
]

export function getColorDef(value: string) {
  return colorOptions.find(c => c.value === value) || colorOptions[0]
}

/**
 * Injects a <style> tag that overrides CSS variables in :root and .dark
 * This is more reliable than root.style.setProperty because it uses
 * proper CSS cascade with :root selectors that match globals.css exactly.
 */
function injectThemeStyle(primary: typeof colorOptions[0], secondary: typeof colorOptions[0]) {
  let styleEl = document.getElementById('dynamic-theme') as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'dynamic-theme'
    document.head.appendChild(styleEl)
  }

  styleEl.textContent = `
:root {
  --primary: ${primary.light.primary};
  --primary-foreground: ${primary.light.fg};
  --ring: ${primary.light.primary};
  --chart-1: ${primary.light.primary};
  --sidebar-primary: ${primary.light.primary};
  --sidebar-primary-foreground: ${primary.light.fg};
  --sidebar-ring: ${primary.light.primary};
  --secondary: ${secondary.light.primary};
  --secondary-foreground: ${secondary.light.fg};
}
.dark {
  --primary: ${primary.dark.primary};
  --primary-foreground: ${primary.dark.fg};
  --ring: ${primary.dark.primary};
  --chart-1: ${primary.dark.primary};
  --sidebar-primary: ${primary.dark.primary};
  --sidebar-primary-foreground: ${primary.dark.fg};
  --sidebar-ring: ${primary.dark.primary};
  --secondary: ${secondary.dark.primary};
  --secondary-foreground: ${secondary.dark.fg};
}
  `
}

export function applyPrimaryColor(colorValue: string) {
  const primary = getColorDef(colorValue)
  // Get current secondary from the <style> tag or default to slate
  const secondary = getColorDef('slate')
  injectThemeStyle(primary, secondary)
}

export function applySecondaryColor(colorValue: string) {
  const secondary = getColorDef(colorValue)
  const primary = getColorDef('emerald')
  injectThemeStyle(primary, secondary)
}

export function applyBothColors(primaryValue: string, secondaryValue: string) {
  const primary = getColorDef(primaryValue)
  const secondary = getColorDef(secondaryValue)
  injectThemeStyle(primary, secondary)
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
