'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Printer, X } from 'lucide-react'
import { toast } from 'sonner'

interface ProductItem {
  id: string
  name: string
  sku: string | null
  price: number
  currency: { symbol: string }
  active: boolean
}

interface BarcodeLabelSelectorProps {
  products: ProductItem[]
  onClose: () => void
}

export function BarcodeLabelSelector({ products, onClose }: BarcodeLabelSelectorProps) {
  const [selected, setSelected] = useState<Map<string, number>>(new Map())
  const [generating, setGenerating] = useState(false)
  const [defaultQty, setDefaultQty] = useState('1')

  const toggleProduct = (productId: string) => {
    const next = new Map(selected)
    if (next.has(productId)) {
      next.delete(productId)
    } else {
      next.set(productId, parseInt(defaultQty) || 1)
    }
    setSelected(next)
  }

  const selectAll = () => {
    const next = new Map<string, number>()
    const qty = parseInt(defaultQty) || 1
    for (const p of products) {
      if (p.active) next.set(p.id, qty)
    }
    setSelected(next)
  }

  const clearAll = () => setSelected(new Map())

  const updateQty = (productId: string, qty: number) => {
    const next = new Map(selected)
    if (qty <= 0) {
      next.delete(productId)
    } else {
      next.set(productId, qty)
    }
    setSelected(next)
  }

  const totalLabels = Array.from(selected.values()).reduce((sum, qty) => sum + qty, 0)

  const handleGenerate = async () => {
    if (selected.size === 0) {
      toast.error('Selecciona al menos un producto')
      return
    }
    setGenerating(true)
    try {
      const items = Array.from(selected.entries()).map(([productId, quantity]) => ({
        productId,
        quantity,
      }))
      const res = await fetch('/api/products/barcode-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: items }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'etiquetas_productos.pdf'
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${totalLabels} etiquetas generadas`)
      onClose()
    } catch {
      toast.error('Error al generar etiquetas')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Cant. por defecto:</label>
          <Input
            type="number"
            min="1"
            max="100"
            value={defaultQty}
            onChange={(e) => setDefaultQty(e.target.value)}
            className="w-20 h-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={selectAll}>
          Seleccionar todos
        </Button>
        <Button variant="outline" size="sm" onClick={clearAll}>
          <X className="mr-1 h-3 w-3" /> Limpiar
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          {selected.size} producto{selected.size !== 1 ? 's' : ''} · {totalLabels} etiquetas
        </div>
      </div>

      {/* Product list */}
      <ScrollArea className="flex-1 border rounded-lg">
        <div className="p-2 space-y-1">
          {products.filter(p => p.active).map((product) => {
            const isSelected = selected.has(product.id)
            const qty = selected.get(product.id) || 0
            return (
              <div
                key={product.id}
                className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                  isSelected ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'
                }`}
                onClick={() => toggleProduct(product.id)}
              >
                <Checkbox checked={isSelected} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.sku || 'Sin SKU'} · {product.currency.symbol}{product.price.toFixed(2)}
                  </p>
                </div>
                {isSelected && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => updateQty(product.id, qty - 1)}
                    >
                      -
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{qty}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => updateQty(product.id, qty + 1)}
                    >
                      +
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
          {products.filter(p => p.active).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay productos activos
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Generate button */}
      <Button
        className="w-full bg-amber-600 hover:bg-amber-700 text-white"
        onClick={handleGenerate}
        disabled={generating || selected.size === 0}
      >
        {generating ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Printer className="mr-2 h-4 w-4" />
        )}
        {generating ? 'Generando...' : `Generar ${totalLabels} Etiqueta${totalLabels !== 1 ? 's' : ''}`}
      </Button>
    </div>
  )
}
