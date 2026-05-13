'use client'

import { usePosStore } from '@/stores/use-pos-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Minus, Plus, Trash2, ShoppingCart } from 'lucide-react'

interface PosCartProps {
  onPayment: () => void
}

export function PosCart({ onPayment }: PosCartProps) {
  const { items, updateQuantity, removeItem, getTotal, getItemCount } = usePosStore()
  const total = getTotal()
  const count = getItemCount()

  return (
    <div className="flex w-full max-w-sm flex-col rounded-lg border bg-card shadow-sm md:w-80">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          <span className="font-semibold">Carrito</span>
        </div>
        <span className="text-sm text-muted-foreground">{count} items</span>
      </div>

      {/* Items */}
      <ScrollArea className="flex-1 p-2" style={{ maxHeight: 'calc(100vh - 20rem)' }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShoppingCart className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Carrito vacío</p>
            <p className="text-xs text-muted-foreground/70">Agrega productos para comenzar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.productId} className="rounded-md border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight truncate">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.currencySymbol}{item.unitPrice.toFixed(2)} c/u
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="text-sm font-bold text-primary dark:text-primary">
                    {item.currencySymbol}{item.lineTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-2xl font-bold text-primary dark:text-primary">
            ${total.toFixed(2)}
          </span>
        </div>
        <Separator />
        <Button
          className="w-full bg-primary hover:bg-primary/90 text-white"
          size="lg"
          disabled={items.length === 0}
          onClick={onPayment}
        >
          Cobrar ${total.toFixed(2)}
        </Button>
      </div>
    </div>
  )
}
