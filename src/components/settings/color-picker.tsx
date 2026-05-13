'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const colorOptions = [
  { name: 'Esmeralda', value: 'emerald', color: '#059669', hsl: '160 84% 39%' },
  { name: 'Azul', value: 'blue', color: '#2563eb', hsl: '217 91% 60%' },
  { name: 'Violeta', value: 'purple', color: '#7c3aed', hsl: '263 70% 50%' },
  { name: 'Rojo', value: 'red', color: '#dc2626', hsl: '0 84% 60%' },
  { name: 'Naranja', value: 'orange', color: '#ea580c', hsl: '24 95% 53%' },
  { name: 'Rosa', value: 'pink', color: '#db2777', hsl: '330 81% 60%' },
  { name: 'Cyan', value: 'cyan', color: '#0891b2', hsl: '192 91% 36%' },
  { name: 'Slate', value: 'slate', color: '#475569', hsl: '215 16% 47%' },
]

interface ColorPickerProps {
  value: string
  onChange: (value: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const selected = colorOptions.find(c => c.value === value) || colorOptions[0]

  const applyTheme = (color: typeof colorOptions[0]) => {
    const root = document.documentElement
    const hsl = color.hsl

    // Update CSS custom properties for primary
    root.style.setProperty('--primary', hsl)
    root.style.setProperty('--primary-foreground', '0 0% 100%')
    root.style.setProperty('--ring', hsl)

    // Also update the chart color
    root.style.setProperty('--chart-1', hsl)

    onChange(color.value)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {colorOptions.map((color) => (
          <button
            key={color.value}
            onClick={() => applyTheme(color)}
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
