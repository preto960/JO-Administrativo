'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/use-app-store'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Plus, Search, Edit, Trash2, Package, Eye, EyeOff, Upload, ImageIcon, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ProductImportDialog } from './product-import-dialog'

// ── Interfaces ──────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  sku: string | null
  type: string
  costAvg: number
  price: number
  imageUrl: string
  active: boolean
  currency: { id: string; symbol: string; code: string }
  category: { id: string; name: string } | null
  inventories: Array<{ id: string; stock: number; minStock: number; branchId: string; price: number }>
}

interface Category {
  id: string
  name: string
  _count: { products: number }
}

interface Currency {
  id: string
  code: string
  symbol: string
  isBase: boolean
}

interface BranchItem {
  id: string
  name: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtStock(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('es-VE')
  return n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

// ── Component ───────────────────────────────────────────────────────────────

export function ProductsTable() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const branches = useAppStore((s) => s.branches)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('__all__')
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formSku, setFormSku] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formCost, setFormCost] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formCurrency, setFormCurrency] = useState('')
  const [formStock, setFormStock] = useState('')
  const [formMinStock, setFormMinStock] = useState('')
  const [formBranchPrice, setFormBranchPrice] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formImageUrl, setFormImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const activeParam = showInactive ? 'all' : 'true'
      const branchParam = selectedBranchId ? `&branchId=${selectedBranchId}` : ''
      const [prods, cats, currs] = await Promise.all([
        api.get<{ products: Product[] }>(`/api/products?active=${activeParam}${branchParam}`),
        api.get<Category[]>('/api/categories'),
        api.get<Currency[]>('/api/currencies'),
      ])
      setProducts(prods.products)
      setCategories(cats)
      setCurrencies(currs)
    } catch {
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [showInactive, selectedBranchId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredProducts = products.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
    const matchCat =
      catFilter === '__all__' || p.category?.id === catFilter
    return matchSearch && matchCat
  })

  const activeCount = products.filter((p) => p.active).length
  const inactiveCount = products.filter((p) => !p.active).length

  // ── Get branch-specific stock ────────────────────────────────────────────

  const getBranchStock = (product: Product): { stock: number; minStock: number; branchPrice: number; label: string } => {
    if (selectedBranchId) {
      const branchInv = product.inventories.find(i => i.branchId === selectedBranchId)
      if (branchInv) {
        return { stock: branchInv.stock, minStock: branchInv.minStock, branchPrice: branchInv.price, label: '' }
      }
      return { stock: 0, minStock: 0, branchPrice: 0, label: 'N/A' }
    }
    // No branch selected — show total stock
    const totalStock = product.inventories.reduce((sum, i) => sum + i.stock, 0)
    return { stock: totalStock, minStock: 0, branchPrice: 0, label: 'Total' }
  }

  // ── Get effective price (branch-specific or global) ─────────────────────

  const getEffectivePrice = (product: Product): number => {
    const { branchPrice } = getBranchStock(product)
    return branchPrice > 0 ? branchPrice : product.price
  }

  // ── Dialog helpers ───────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormName('')
    setFormSku('')
    setFormPrice('')
    setFormCost('0')
    setFormStock('')
    setFormMinStock('')
    setFormBranchPrice('')
    setFormCategory('')
    setFormCurrency('')
    setFormActive(true)
    setFormImageUrl('')
    setEditProduct(null)
  }, [])

  const openCreate = useCallback(() => {
    resetForm()
    // Set default currency to base currency AFTER reset
    const baseCurrency = currencies.find((c) => c.isBase)
    setFormCurrency(baseCurrency?.id || currencies[0]?.id || '')
    setDialogOpen(true)
  }, [currencies, resetForm])

  const openEdit = useCallback(
    (product: Product) => {
      setEditProduct(product)
      setFormName(product.name)
      setFormSku(product.sku || '')
      setFormPrice(product.price.toString())
      setFormCost(product.costAvg.toString())
      setFormCategory(product.category?.id || '__none__')
      setFormCurrency(product.currency.id)
      setFormActive(product.active)
      setFormImageUrl(product.imageUrl || '')
      // Set branch-specific values
      if (selectedBranchId) {
        const branchInv = product.inventories.find(i => i.branchId === selectedBranchId)
        setFormStock(branchInv?.stock?.toString() || '')
        setFormMinStock(branchInv?.minStock?.toString() || '')
        setFormBranchPrice(branchInv?.price > 0 ? branchInv.price.toString() : '')
      } else {
        setFormStock(product.inventories[0]?.stock?.toString() || '')
        setFormMinStock(product.inventories[0]?.minStock?.toString() || '')
        setFormBranchPrice('')
      }
      setDialogOpen(true)
    },
    [selectedBranchId]
  )

  const openDeleteConfirm = useCallback((product: Product) => {
    setProductToDelete(product)
    setDeleteDialogOpen(true)
  }, [])

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    const price = parseFloat(formPrice)
    if (isNaN(price) || price <= 0) {
      toast.error('El precio debe ser mayor a 0')
      return
    }

    setSaving(true)
    try {
      const body = {
        name: formName.trim(),
        sku: formSku.trim() || null,
        price,
        costAvg: parseFloat(formCost) || 0,
        currencyId: formCurrency,
        categoryId: formCategory && formCategory !== '__none__' ? formCategory : null,
        type: 'simple',
        imageUrl: formImageUrl || undefined,
        branchId: selectedBranchId || undefined,
        branchPrice: formBranchPrice !== '' ? parseFloat(formBranchPrice) : undefined,
      }

      if (editProduct) {
        await api.put(`/api/products/${editProduct.id}`, {
          ...body,
          active: formActive,
          initialStock: formStock !== '' ? parseInt(formStock) : undefined,
          minStock: formMinStock !== '' ? parseInt(formMinStock) : undefined,
        })
        toast.success('Producto actualizado')
      } else {
        await api.post('/api/products', {
          ...body,
          initialStock: formStock !== '' ? parseInt(formStock) : undefined,
          minStock: formMinStock !== '' ? parseInt(formMinStock) : undefined,
        })
        toast.success('Producto creado')
      }
      setDialogOpen(false)
      fetchData()
    } catch {
      toast.error('Error al guardar producto')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!productToDelete) return
    try {
      await api.del(`/api/products/${productToDelete.id}`)
      toast.success(`"${productToDelete.name}" desactivado`)
      setDeleteDialogOpen(false)
      setProductToDelete(null)
      fetchData()
    } catch {
      toast.error('Error al desactivar producto')
    }
  }

  const handleToggleActive = async (product: Product) => {
    const newActive = !product.active
    try {
      await api.put(`/api/products/${product.id}`, {
        name: product.name,
        sku: product.sku,
        type: product.type,
        costAvg: product.costAvg,
        price: product.price,
        currencyId: product.currency.id,
        categoryId: product.category?.id || null,
        active: newActive,
      })
      toast.success(newActive ? `"${product.name}" activado` : `"${product.name}" desactivado`)
      fetchData()
    } catch {
      toast.error('Error al cambiar estado del producto')
    }
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 rounded bg-muted animate-pulse" />
        <div className="h-64 rounded bg-muted animate-pulse" />
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const branchName = branches.find(b => b.id === selectedBranchId)?.name

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive" className="cursor-pointer select-none">
              {showInactive ? <Eye className="inline h-4 w-4 mr-1" /> : <EyeOff className="inline h-4 w-4 mr-1" />}
              Inactivos ({inactiveCount})
            </Label>
          </div>
          <Button
            onClick={openCreate}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo
          </Button>
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" /> Importar
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Badge variant="secondary">{filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''}</Badge>
        <Badge variant="outline" className="text-primary">{activeCount} activo{activeCount !== 1 ? 's' : ''}</Badge>
        {inactiveCount > 0 && (
          <Badge variant="outline" className="text-muted-foreground">{inactiveCount} inactivo{inactiveCount !== 1 ? 's' : ''}</Badge>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Img</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Stock</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const curr = product.currency
                  const { stock, minStock, label } = getBranchStock(product)
                  const effectivePrice = getEffectivePrice(product)
                  const isLowStock = product.active && minStock > 0 && stock <= minStock
                  const hasBranchPrice = selectedBranchId && product.inventories.some(i => i.branchId === selectedBranchId && i.price > 0)
                  return (
                    <TableRow
                      key={product.id}
                      className={!product.active ? 'opacity-60' : ''}
                    >
                      <TableCell>
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-9 w-9 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                            <Package className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {product.sku || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {product.category?.name || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {curr.symbol}{fmt(product.costAvg)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {curr.symbol}{fmt(effectivePrice)}
                        {hasBranchPrice && (
                          <span className="ml-1 text-[10px] text-amber-600">★</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell tabular-nums">
                        <span className={isLowStock ? 'text-red-600 font-medium' : ''}>
                          {label === 'N/A' ? 'N/A' : fmtStock(stock)}
                        </span>
                        {label === 'Total' && (
                          <span className="ml-1 text-[10px] text-muted-foreground">(total)</span>
                        )}
                        {isLowStock && (
                          <span className="ml-1 text-[10px] text-red-500">(mín: {fmtStock(minStock)})</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.active ? 'default' : 'secondary'}>
                          {product.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(product)}
                            title="Editar"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          {product.active ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => openDeleteConfirm(product)}
                              title="Desactivar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary"
                              onClick={() => handleToggleActive(product)}
                              title="Reactivar"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No se encontraron productos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) setDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editProduct ? 'Editar Producto' : 'Nuevo Producto'}
            </DialogTitle>
            <DialogDescription>
              {editProduct
                ? 'Modifica los datos del producto'
                : 'Completa los datos para crear un nuevo producto'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Active toggle (only for edit) */}
            {editProduct && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Switch
                  id="form-active"
                  checked={formActive}
                  onCheckedChange={setFormActive}
                />
                <Label htmlFor="form-active" className="cursor-pointer select-none">
                  Producto {formActive ? 'activo' : 'inactivo'}
                </Label>
              </div>
            )}
            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Imagen del Producto</Label>
              <div className="flex items-center gap-3">
                {formImageUrl ? (
                  <div className="relative">
                    <img
                      src={formImageUrl}
                      alt="Producto"
                      className="h-14 w-14 rounded-lg object-cover border"
                    />
                    <button
                      type="button"
                      onClick={() => setFormImageUrl('')}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30">
                    <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error('La imagen no debe superar 2MB')
                        return
                      }
                      setUploadingImage(true)
                      const formData = new FormData()
                      formData.append('file', file)
                      try {
                        const res = await fetch('/api/upload', { method: 'POST', body: formData })
                        const data = await res.json()
                        if (data.url) {
                          setFormImageUrl(data.url)
                        } else {
                          toast.error(data.error || 'Error al subir imagen')
                        }
                      } catch {
                        toast.error('Error al subir imagen')
                      } finally {
                        setUploadingImage(false)
                      }
                      e.target.value = ''
                    }}
                    className="hidden"
                    id="product-image-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingImage}
                    onClick={() => document.getElementById('product-image-upload')?.click()}
                  >
                    {uploadingImage ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-3.5 w-3.5" />
                    )}
                    {uploadingImage ? 'Subiendo...' : 'Subir Imagen'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF o WebP. Máximo 2MB.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pname">Nombre *</Label>
              <Input
                id="pname"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nombre del producto"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="psku">SKU</Label>
                <Input
                  id="psku"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  placeholder="EMP-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pcat">Categoría</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin categoría</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pcost">Costo Promedio</Label>
                <Input
                  id="pcost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formCost}
                  onChange={(e) => setFormCost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pprice">Precio de Venta *</Label>
                <Input
                  id="pprice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                />
              </div>
            </div>
            {selectedBranchId && (
              <div className="space-y-2">
                <Label htmlFor="pbranchprice">Precio Sucursal ({branchName})</Label>
                <Input
                  id="pbranchprice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formBranchPrice}
                  onChange={(e) => setFormBranchPrice(e.target.value)}
                  placeholder="Vacío = usar precio global"
                />
                <p className="text-xs text-muted-foreground">
                  Si se establece, este precio sobrescribe el precio global para esta sucursal
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pstock">Stock Inicial</Label>
                <Input
                  id="pstock"
                  type="number"
                  step="1"
                  min="0"
                  value={formStock}
                  onChange={(e) => setFormStock(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pminstock">Stock Mínimo</Label>
                <Input
                  id="pminstock"
                  type="number"
                  step="1"
                  min="0"
                  value={formMinStock}
                  onChange={(e) => setFormMinStock(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pcurrency">Moneda</Label>
              <Select value={formCurrency} onValueChange={setFormCurrency}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} ({c.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handleSave}
              disabled={saving || !formName.trim() || !formPrice}
            >
              {saving ? 'Guardando...' : editProduct ? 'Actualizar' : 'Crear Producto'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              El producto <strong>&quot;{productToDelete?.name}&quot;</strong> será marcado como
              inactivo. Podrás reactivarlo más tarde desde la vista de productos inactivos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <ProductImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={fetchData}
      />
    </div>
  )
}
