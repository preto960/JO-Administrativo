'use client'

import { api } from '@/lib/api'
import { usePosStore } from '@/stores/use-pos-store'
import { PosCart } from './pos-cart'
import { PosPaymentModal } from './pos-payment-modal'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Plus } from 'lucide-react'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'

interface ProductWithInventory {
  id: string
  name: string
  sku: string | null
  price: number
  costAvg: number
  currencyId: string
  categoryId: string | null
  active: boolean
  currency: { symbol: string }
  category: { name: string } | null
  inventories: { stock: number }[]
}

interface Category {
  id: string
  name: string
}

export function PosTerminal() {
  const { addItem, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter } = usePosStore()
  const [products, setProducts] = useState<ProductWithInventory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showPayment, setShowPayment] = useState(false)
  const [loading, setLoading] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      api.get<ProductWithInventory[]>('/api/products?active=true'),
      api.get<Category[]>('/api/categories'),
    ]).then(([prods, cats]) => {
      setProducts(prods)
      setCategories(cats)
      setLoading(false)
    }).catch(() => {
      toast.error('Error al cargar productos')
      setLoading(false)
    })
  }, [])

  const filteredProducts = useMemo(() => {
    let result = products
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))
      )
    }
    if (categoryFilter) {
      result = result.filter((p) => p.category?.name === categoryFilter)
    }
    return result
  }, [searchQuery, categoryFilter, products])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'F2' || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    },
    []
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleAddProduct = (product: ProductWithInventory) => {
    addItem({
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: product.price,
      unitCost: product.costAvg,
      currencySymbol: product.currency.symbol,
    })
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Product Grid */}
      <div className="flex flex-1 flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Buscar producto (F2)... "
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={categoryFilter === '' ? 'default' : 'outline'}
            className="cursor-pointer hover:bg-emerald-50 hover:text-emerald-700"
            onClick={() => setCategoryFilter('')}
          >
            Todos
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat.id}
              variant={categoryFilter === cat.name ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-emerald-50 hover:text-emerald-700"
              onClick={() => setCategoryFilter(categoryFilter === cat.name ? '' : cat.name)}
            >
              {cat.name}
            </Badge>
          ))}
        </div>

        {/* Grid */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-1">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleAddProduct(product)}
                  className="group relative flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-all hover:border-emerald-300 hover:shadow-md hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                >
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus className="h-4 w-4 text-emerald-600" />
                  </div>
                  <span className="text-sm font-medium leading-tight line-clamp-2">
                    {product.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {product.sku || 'Sin SKU'}
                  </span>
                  <div className="mt-auto flex items-center justify-between w-full">
                    <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {product.currency.symbol}{product.price.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Stock: {product.inventories[0]?.stock ?? 0}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Cart */}
      <PosCart onPayment={() => setShowPayment(true)} />

      {/* Payment Modal */}
      {showPayment && <PosPaymentModal onClose={() => setShowPayment(false)} />}
    </div>
  )
}
