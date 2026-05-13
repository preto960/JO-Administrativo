'use client'

import { api } from '@/lib/api'
import { usePosStore } from '@/stores/use-pos-store'
import { PosCart } from './pos-cart'
import { PosPaymentModal } from './pos-payment-modal'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Search, ShoppingCart } from 'lucide-react'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
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
  const { items, getTotal, getItemCount } = usePosStore()
  const [products, setProducts] = useState<ProductWithInventory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showPayment, setShowPayment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cartOpen, setCartOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

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

  const itemCount = getItemCount()
  const total = getTotal()

  const cartContent = (
    <PosCart onPayment={() => {
      setCartOpen(false)
      setShowPayment(true)
    }} />
  )

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] gap-3 md:gap-4">
      {/* Product Grid */}
      <div className="flex flex-1 flex-col gap-3 min-h-0">
        {/* Search + Mobile Cart Toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Buscar producto (F2)... "
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {isMobile && (
            <Drawer open={cartOpen} onOpenChange={setCartOpen}>
              <DrawerTrigger asChild>
                <Button variant="outline" size="icon" className="relative h-10 w-10 shrink-0">
                  <ShoppingCart className="h-4 w-4" />
                  {itemCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                      {itemCount}
                    </span>
                  )}
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Carrito</DrawerTitle>
                  <DrawerDescription>{itemCount} productos · Total: ${total.toFixed(2)}</DrawerDescription>
                </DrawerHeader>
                <div className="px-4 pb-4 overflow-auto max-h-[60vh]">
                  {cartContent}
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={categoryFilter === '' ? 'default' : 'outline'}
            className="cursor-pointer hover:bg-primary/5 hover:text-primary"
            onClick={() => setCategoryFilter('')}
          >
            Todos
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat.id}
              variant={categoryFilter === cat.name ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/5 hover:text-primary"
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
                  className="group relative flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/30 hover:shadow-md hover:bg-primary/5 dark:hover:bg-primary/10"
                >
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-xs">+</span>
                  </div>
                  <span className="text-sm font-medium leading-tight line-clamp-2">
                    {product.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {product.sku || 'Sin SKU'}
                  </span>
                  <div className="mt-auto flex items-center justify-between w-full">
                    <span className="text-base font-bold text-primary dark:text-primary">
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

      {/* Desktop Cart - hidden on mobile */}
      {!isMobile && cartContent}

      {/* Payment Modal */}
      {showPayment && <PosPaymentModal onClose={() => setShowPayment(false)} />}
    </div>
  )
}
