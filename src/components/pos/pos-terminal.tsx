'use client'

import { api } from '@/lib/api'
import { usePosStore } from '@/stores/use-pos-store'
import { useSetting, useAppStore } from '@/stores/use-app-store'
import { useAuth } from '@/hooks/use-auth'
import { PosCart } from './pos-cart'
import { PosPaymentModal } from './pos-payment-modal'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Search, ShoppingCart, AlertTriangle, ScanBarcode, X, Camera, Lock } from 'lucide-react'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from 'sonner'
import { BarcodeScannerDialog } from './barcode-scanner-dialog'

interface ProductWithInventory {
  id: string
  name: string
  sku: string | null
  price: number
  costAvg: number
  currencyId: string
  categoryId: string | null
  imageUrl: string
  active: boolean
  currency: { symbol: string }
  category: { name: string } | null
  inventories: { stock: number; branchId: string; price: number; branch?: { id: string; name: string } }[]
}

interface Category {
  id: string
  name: string
}

export function PosTerminal() {
  const { addItem, getCurrentQty, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, validateBranch } = usePosStore()
  const { items, getTotal, getItemCount } = usePosStore()
  const exchangeRate = useSetting('exchangeRate')
  const referenceCurrency = useSetting('referenceCurrency')
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const { user } = useAuth()
  const [products, setProducts] = useState<ProductWithInventory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showPayment, setShowPayment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cartOpen, setCartOpen] = useState(false)
  const [showBarcodeInput, setShowBarcodeInput] = useState(false)
  const [barcodeValue, setBarcodeValue] = useState('')
  const [showCameraScanner, setShowCameraScanner] = useState(false)
  const [checkingCaja, setCheckingCaja] = useState(true)
  const [cajaOpen, setCajaOpen] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()
  const currencySymbol = referenceCurrency === 'EUR' ? '€' : '$'
  const isCashier = user?.role === 'cajero'

  // Check if there's an open cash register (blocks cashiers)
  useEffect(() => {
    if (!user?.id) return
    api.get<Array<{ id: string; status: string }>>('/api/cash-register')
      .then((registers) => {
        const hasOpen = registers?.some((r) => r.status === 'abierta') ?? false
        setCajaOpen(hasOpen)
      })
      .catch(() => setCajaOpen(false))
      .finally(() => setCheckingCaja(false))
  }, [user?.id, selectedBranchId])

  // Poll for caja status every 15s when blocked (auto-unblocks when admin opens caja)
  useEffect(() => {
    if (cajaOpen) return
    const interval = setInterval(() => {
      api.get<Array<{ id: string; status: string }>>('/api/cash-register')
        .then((registers) => {
          const hasOpen = registers?.some((r) => r.status === 'abierta') ?? false
          if (hasOpen) setCajaOpen(true)
        })
        .catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [cajaOpen])

  // Validate saved cart against current branch on mount
  useEffect(() => {
    if (selectedBranchId) {
      validateBranch(selectedBranchId)
    }
  }, [selectedBranchId, validateBranch])

  const fetchProducts = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get<{ products: ProductWithInventory[] }>('/api/products?active=true&allInventories=true'),
      api.get<Category[]>('/api/categories'),
    ]).then(([res, cats]) => {
      setProducts(res.products)
      setCategories(cats)
      setLoading(false)
    }).catch(() => {
      toast.error('Error al cargar productos')
      setLoading(false)
    })
  }, [])

  // Fetch products only when caja is verified open
  useEffect(() => {
    if (checkingCaja || !cajaOpen) return
    fetchProducts()
  }, [fetchProducts, selectedBranchId, checkingCaja, cajaOpen])

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

  // Get stock and branch-specific price for the selected branch
  const getBranchInfo = (product: ProductWithInventory): { stock: number; branchName: string | null; effectivePrice: number } => {
    if (selectedBranchId) {
      const branchInv = product.inventories.find(i => i.branchId === selectedBranchId)
      if (branchInv) {
        const effectivePrice = branchInv.price > 0 ? branchInv.price : product.price
        return { stock: branchInv.stock, branchName: null, effectivePrice }
      }
    }
    // Fallback to first inventory
    const firstInv = product.inventories[0]
    return { stock: firstInv?.stock ?? 0, branchName: firstInv?.branch?.name || null, effectivePrice: product.price }
  }

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
    const { stock, effectivePrice } = getBranchInfo(product)

    if (stock <= 0) {
      const otherBranches = product.inventories.filter(i => i.stock > 0 && i.branch)
      if (otherBranches.length > 0) {
        toast.error(`Sin stock en esta sucursal. Disponible en: ${otherBranches.map(b => b.branch!.name).join(', ')}`)
      } else {
        toast.error('Sin stock disponible')
      }
      return
    }

    const currentQty = getCurrentQty(product.id)
    if (currentQty >= stock) {
      toast.error(`Solo hay ${stock} unidades disponibles. Ya tienes ${currentQty} en el carrito.`)
      return
    }

    const result = addItem({
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: effectivePrice,
      unitCost: product.costAvg,
      currencySymbol: product.currency.symbol,
      maxStock: stock,
    })

    if (!result) {
      toast.error('No se puede agregar más. Stock insuficiente.')
    }
  }

  // Handle barcode scan — find product by SKU and add to cart. Returns true on success.
  const handleBarcodeScan = useCallback((value: string): boolean => {
    const trimmed = value.trim()
    if (!trimmed) return false

    // Search by exact SKU match first, then partial
    const product = products.find(
      (p) => p.sku && p.sku.toLowerCase() === trimmed.toLowerCase()
    ) || products.find(
      (p) => p.sku && p.sku.toLowerCase().includes(trimmed.toLowerCase())
    )

    if (!product) {
      toast.error(`Producto no encontrado: ${trimmed}`)
      return false
    }

    const { stock, effectivePrice } = getBranchInfo(product)
    if (stock <= 0) {
      toast.error(`Sin stock: ${product.name}`)
      return false
    }

    const currentQty = getCurrentQty(product.id)
    if (currentQty >= stock) {
      toast.error(`Stock máximo alcanzado: ${product.name} (${currentQty}/${stock})`)
      return false
    }

    const result = addItem({
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: effectivePrice,
      unitCost: product.costAvg,
      currencySymbol: product.currency.symbol,
      maxStock: stock,
    })

    if (result) {
      toast.success(`${product.name} agregado al carrito`, { description: product.sku || undefined })
      return true
    } else {
      toast.error('No se puede agregar. Stock insuficiente.')
      return false
    }
  }, [products, getCurrentQty, addItem, getBranchInfo])

  const handleBarcodeKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleBarcodeScan(barcodeValue)
      setBarcodeValue('')
      // Keep focus on barcode input for rapid consecutive scans
      setTimeout(() => barcodeRef.current?.focus(), 10)
    }
  }, [barcodeValue, handleBarcodeScan])

  const toggleBarcodeInput = useCallback(() => {
    setShowBarcodeInput((prev) => !prev)
    setTimeout(() => {
      if (!showBarcodeInput) {
        barcodeRef.current?.focus()
      } else {
        setBarcodeValue('')
      }
    }, 50)
  }, [showBarcodeInput])

  // After a successful sale, refresh products to show updated stock
  const handlePaymentSuccess = () => {
    setShowPayment(false)
    fetchProducts()
  }

  const itemCount = getItemCount()
  const total = getTotal()

  const cartContent = (
    <PosCart onPayment={() => {
      setCartOpen(false)
      setShowPayment(true)
    }} />
  )

  // Show loading while checking caja status
  if (checkingCaja) {
    return (
      <div className="flex h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Verificando estado de caja...</p>
        </div>
      </div>
    )
  }

  // Block POS when no cash register is open
  if (!cajaOpen) {
    return (
      <div className="flex h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-center space-y-4 max-w-sm mx-auto p-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/30">
            <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Caja Cerrada</h2>
            <p className="text-sm text-muted-foreground mt-1">
              No hay ninguna caja abierta. Debe abrir una caja antes de poder realizar ventas.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {isCashier
              ? 'Contacta a un administrador o gerente para que abra una caja en la seccion de Caja.'
              : 'Ve a la seccion de Caja y abre un registro para comenzar a vender.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] gap-3 md:gap-4">
      {/* Product Grid */}
      <div className="flex flex-1 flex-col gap-3 min-h-0">
        {/* Search + Barcode + Mobile Cart Toggle */}
        <div className="flex gap-2">
          {showBarcodeInput ? (
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                ref={barcodeRef}
                placeholder="Escanear código de barras..."
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                className="pl-10 pr-9 border-primary/50 bg-primary/5 ring-primary/20"
                autoFocus
              />
              <button
                type="button"
                onClick={() => { setShowBarcodeInput(false); setBarcodeValue('') }}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                title="Cerrar escáner"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 border-primary/30 hover:bg-primary/10 hover:text-primary"
              onClick={toggleBarcodeInput}
              title="Escanear con lector externo (SKU)"
            >
              <ScanBarcode className="h-4 w-4" />
            </Button>
          )}
          {/* Camera barcode scanner button */}
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 dark:border-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
            onClick={() => setShowCameraScanner(true)}
            title="Escanear con camara"
          >
            <Camera className="h-4 w-4" />
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Buscar producto (F2)... "
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-tutorial="pos-search"
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
                  <DrawerDescription>{itemCount} productos · Total: {currencySymbol}{total.toFixed(2)}</DrawerDescription>
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
            <div data-tutorial="pos-products" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-1">
              {filteredProducts.map((product) => {
                const { stock, effectivePrice } = getBranchInfo(product)
                const outOfStock = stock <= 0
                const currentQty = getCurrentQty(product.id)
                const atMaxStock = currentQty >= stock
                return (
                <button
                  key={product.id}
                  onClick={() => handleAddProduct(product)}
                  disabled={outOfStock}
                  className={`group relative flex flex-col items-start gap-0.5 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/30 hover:shadow-md hover:bg-primary/5 dark:hover:bg-primary/10 ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {outOfStock ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs">
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    ) : atMaxStock ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-xs">
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-xs">+</span>
                    )}
                  </div>
                  {product.imageUrl ? (
                    <div className="flex items-center gap-2 w-full">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className={`text-sm font-medium leading-tight line-clamp-1 block ${outOfStock ? 'line-through' : ''}`}>
                          {product.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight block">
                          {product.sku || 'Sin SKU'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className={`text-sm font-medium leading-tight line-clamp-1 ${outOfStock ? 'line-through' : ''}`}>
                        {product.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {product.sku || 'Sin SKU'}
                      </span>
                    </>
                  )}
                  <div className="mt-auto flex items-center justify-between w-full">
                    <div>
                      <span className="text-sm font-bold text-primary dark:text-primary">
                        {currencySymbol}{effectivePrice.toFixed(2)}
                      </span>
                      {currentQty > 0 && (
                        <p className="text-[10px] text-primary font-medium">En carrito: {currentQty}</p>
                      )}
                    </div>
                    <div className="text-right">
                      {outOfStock ? (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Sin stock</Badge>
                      ) : atMaxStock ? (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-600 border-amber-300">Max alcanzado</Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          Stock: {stock}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Desktop Cart - hidden on mobile */}
      {!isMobile && cartContent}

      {/* Payment Modal */}
      {showPayment && <PosPaymentModal onClose={handlePaymentSuccess} />}

      {/* Camera Barcode Scanner */}
      <BarcodeScannerDialog
        open={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={handleBarcodeScan}
      />
    </div>
  )
}
