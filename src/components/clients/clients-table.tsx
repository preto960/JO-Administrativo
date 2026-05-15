'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/stores/use-app-store'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Search, Users, Eye, DollarSign, Loader2, Receipt, Truck, X, Banknote, CreditCard, ArrowLeftRight, Smartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSetting } from '@/stores/use-app-store'

const localCurrencyMethods = ['efectivo', 'pago_movil', 'tarjeta', 'transferencia']

interface Client {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  note: string | null
  pendingBalance: number
  _count: { sales: number }
}

interface SaleRecord {
  id: string
  date: string
  total: number
  status: string
  user: { name: string }
  branch: { name: string }
  payments: Array<{ method: string; amount: number; currency: { symbol: string } }>
  lines: Array<{ product: { name: string }; quantity: number; unitPrice: number; lineTotal: number }>
  receivables: Array<{ pendingBalance: number; status: string; dueDate: string | null }>
}

interface ProductOption {
  id: string
  name: string
  price: number
  currency: { symbol: string }
  inventories: Array<{ stock: number; branchId: string }>
}

interface DispatchLine {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  stock: number
}

export function ClientsTable() {
  const { user } = useAuth()
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formNote, setFormNote] = useState('')

  // Sales/dispatch history dialog
  const [historyClient, setHistoryClient] = useState<Client | null>(null)
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)

  // Payment dialog
  const [paymentClient, setPaymentClient] = useState<Client | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [paymentReference, setPaymentReference] = useState('')
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paying, setPaying] = useState(false)
  const [openCashRegId, setOpenCashRegId] = useState<string | null>(null)
  const baseCurrencyId = useAppStore((s) => s.settings?.baseCurrencyId || '')

  const exchangeRate = useSetting('exchangeRate')
  const referenceCurrency = useSetting('referenceCurrency')
  const currencySymbol = referenceCurrency === 'EUR' ? '\u20ac' : '$'
  const isLocalMethod = localCurrencyMethods.includes(paymentMethod)

  // Dispatch dialog
  const [dispatchClient, setDispatchClient] = useState<Client | null>(null)
  const [showDispatchDialog, setShowDispatchDialog] = useState(false)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [dispatchLines, setDispatchLines] = useState<DispatchLine[]>([])
  const [savingDispatch, setSavingDispatch] = useState(false)

  const fetchClients = async () => {
    try {
      const data = await api.get<Client[]>('/api/clients')
      setClients(data)
    } catch {
      toast.error('Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchClients() }, [])

  // Fetch open cash register
  useEffect(() => {
    api.get<Array<{ id: string; status: string }>>('/api/cash-register')
      .then(regs => {
        const openReg = regs?.find(r => r.status === 'abierta')
        if (openReg) setOpenCashRegId(openReg.id)
      })
      .catch(() => {})
  }, [])

  const filtered = clients.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search)) || (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  )

  const openCreate = () => {
    setFormName('')
    setFormPhone('')
    setFormEmail('')
    setFormAddress('')
    setFormNote('')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formName) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/clients', {
        name: formName,
        phone: formPhone || null,
        email: formEmail || null,
        address: formAddress || null,
        note: formNote || null,
      })
      toast.success('Cliente creado')
      setDialogOpen(false)
      fetchClients()
    } catch {
      toast.error('Error al crear cliente')
    } finally {
      setSaving(false)
    }
  }

  const openHistory = async (client: Client) => {
    setHistoryClient(client)
    setShowHistoryDialog(true)
    setLoadingHistory(true)
    try {
      const data = await api.get<{ sales: SaleRecord[] }>(`/api/clients/${client.id}/sales`)
      setSales(data.sales)
    } catch {
      toast.error('Error al cargar historial')
    } finally {
      setLoadingHistory(false)
    }
  }

  const openPayment = (client: Client) => {
    setPaymentClient(client)
    setPaymentMethod('divisas')
    setPaymentReference('')
    // Set amount in reference currency by default
    setPaymentAmount(client.pendingBalance.toFixed(2))
    setShowPaymentDialog(true)
  }

  // When payment method changes, toggle between Bs. and reference currency
  const handlePaymentMethodChange = (method: string) => {
    setPaymentMethod(method)
    setPaymentReference('')
    if (paymentClient) {
      const isLocal = localCurrencyMethods.includes(method)
      if (isLocal && exchangeRate > 0) {
        // Show amount in Bs.
        setPaymentAmount((paymentClient.pendingBalance * exchangeRate).toFixed(2))
      } else {
        // Show amount in reference currency
        setPaymentAmount(paymentClient.pendingBalance.toFixed(2))
      }
    }
  }

  // Convert displayed amount to reference currency
  const paymentAmountInRef = (() => {
    const parsed = parseFloat(paymentAmount) || 0
    if (isLocalMethod && exchangeRate > 0) {
      return Math.round((parsed / exchangeRate) * 100) / 100
    }
    return parsed
  })()

  const openDispatch = async (client: Client) => {
    setDispatchClient(client)
    setDispatchLines([])
    setShowDispatchDialog(true)
    setLoadingProducts(true)
    try {
      const branchParam = selectedBranchId ? `?branchId=${selectedBranchId}` : ''
      const data = await api.get<{ products: ProductOption[] }>(`/api/products?active=true${branchParam}`)
      setProducts(data.products)
    } catch {
      toast.error('Error al cargar productos')
    } finally {
      setLoadingProducts(false)
    }
  }

  const handlePayment = async () => {
    if (!paymentClient) return
    const amt = parseFloat(paymentAmount)
    if (!amt || amt <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    if (paymentAmountInRef > paymentClient.pendingBalance) {
      toast.error(`El monto no puede ser mayor al saldo pendiente (${currencySymbol}${paymentClient.pendingBalance.toFixed(2)})`)
      return
    }
    setPaying(true)
    try {
      await api.post(`/api/clients/${paymentClient.id}/payment`, {
        amount: paymentAmountInRef,
        method: paymentMethod,
        reference: paymentReference || undefined,
        cashRegId: openCashRegId || undefined,
        userId: user?.id || '',
        currencyId: baseCurrencyId || undefined,
      })
      const displayLabel = isLocalMethod ? `Bs. ${parseFloat(paymentAmount).toFixed(2)}` : `${currencySymbol}${paymentAmountInRef.toFixed(2)}`
      toast.success(`Cobro de ${displayLabel} registrado exitosamente`)
      setShowPaymentDialog(false)
      fetchClients()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar cobro'
      toast.error(msg)
    } finally {
      setPaying(false)
    }
  }

  const addDispatchLine = (productId: string) => {
    const product = products.find(p => p.id === productId)
    if (!product) return

    const existingLine = dispatchLines.find(l => l.productId === productId)
    if (existingLine) {
      // Increment quantity
      if (existingLine.quantity >= existingLine.stock) {
        toast.error('Stock insuficiente')
        return
      }
      setDispatchLines(dispatchLines.map(l =>
        l.productId === productId
          ? { ...l, quantity: l.quantity + 1 }
          : l
      ))
    } else {
      const branchInv = product.inventories.find(i => i.branchId === selectedBranchId)
      const stock = branchInv?.stock ?? 0
      if (stock <= 0) {
        toast.error('Sin stock disponible')
        return
      }
      setDispatchLines([...dispatchLines, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        stock,
      }])
    }
  }

  const updateDispatchLineQty = (productId: string, qty: number) => {
    const line = dispatchLines.find(l => l.productId === productId)
    if (!line) return
    if (qty > line.stock) {
      toast.error(`Stock insuficiente. Máximo: ${line.stock}`)
      return
    }
    if (qty <= 0) {
      setDispatchLines(dispatchLines.filter(l => l.productId !== productId))
    } else {
      setDispatchLines(dispatchLines.map(l =>
        l.productId === productId ? { ...l, quantity: qty } : l
      ))
    }
  }

  const dispatchTotal = dispatchLines.reduce((sum, l) => sum + (l.unitPrice * l.quantity), 0)

  const handleDispatch = async () => {
    if (!dispatchClient || dispatchLines.length === 0) return
    setSavingDispatch(true)
    try {
      await api.post(`/api/clients/${dispatchClient.id}/dispatch`, {
        lines: dispatchLines.map(l => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        userId: user?.id || '',
        branchId: selectedBranchId || undefined,
      })
      toast.success(`Despacho registrado. Total: $${dispatchTotal.toFixed(2)}`)
      setShowDispatchDialog(false)
      fetchClients()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar despacho'
      toast.error(msg)
    } finally {
      setSavingDispatch(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="text-right">Deuda</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{client.phone || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell">{client.email || '—'}</TableCell>
                    <TableCell className="text-right">
                      <span className={client.pendingBalance > 0 ? 'text-red-600 font-medium' : 'text-primary'}>
                        ${client.pendingBalance.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Ver Historial" onClick={() => openHistory(client)}>
                          <Receipt className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" title="Despachar" onClick={() => openDispatch(client)}>
                          <Truck className="h-3.5 w-3.5" />
                        </Button>
                        {client.pendingBalance > 0 && (
                          <Button size="sm" variant="outline" className="text-primary hover:text-primary" onClick={() => openPayment(client)}>
                            <DollarSign className="mr-1 h-3 w-3" /> Cobrar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" title="Eliminar" onClick={async () => {
                          if (!confirm(`¿Estás seguro de eliminar el cliente "${client.name}"?`)) return
                          try {
                            await api.del(`/api/clients?id=${client.id}`)
                            toast.success('Cliente eliminado')
                            fetchClients()
                          } catch {
                            toast.error('Error al eliminar cliente')
                          }
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No se encontraron clientes
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Client Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Cliente</DialogTitle>
            <DialogDescription>Registra un nuevo cliente en el sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cname">Nombre *</Label>
              <Input id="cname" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cphone">Teléfono</Label>
                <Input id="cphone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+58 412-0000000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cemail">Email</Label>
                <Input id="cemail" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="correo@ejemplo.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="caddress">Dirección</Label>
              <Input id="caddress" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Dirección" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnote">Notas</Label>
              <Input id="cnote" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Notas internas" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Crear Cliente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dispatch Dialog */}
      <Dialog open={showDispatchDialog} onOpenChange={setShowDispatchDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Despachar a {dispatchClient?.name}</DialogTitle>
            <DialogDescription>Selecciona productos y cantidades para despachar</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Product selector */}
            <div className="space-y-2">
              <Label>Agregar Producto</Label>
              <Select onValueChange={(v) => { addDispatchLine(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => {
                    const branchInv = p.inventories.find(i => i.branchId === selectedBranchId)
                    const stock = branchInv?.stock ?? 0
                    return (
                      <SelectItem key={p.id} value={p.id} disabled={stock <= 0}>
                        {p.name} — {p.currency.symbol}{p.price.toFixed(2)} (Stock: {stock})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Lines */}
            {dispatchLines.length > 0 ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Productos a Despachar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dispatchLines.map((line) => (
                      <div key={line.productId} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{line.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            ${line.unitPrice.toFixed(2)} c/u · Stock: {line.stock}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => updateDispatchLineQty(line.productId, line.quantity - 1)}
                          >
                            -
                          </Button>
                          <span className="text-sm font-medium w-8 text-center">{line.quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => updateDispatchLineQty(line.productId, line.quantity + 1)}
                          >
                            +
                          </Button>
                        </div>
                        <div className="text-right w-20">
                          <p className="text-sm font-semibold">${(line.unitPrice * line.quantity).toFixed(2)}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-600"
                          onClick={() => setDispatchLines(dispatchLines.filter(l => l.productId !== line.productId))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}

                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Total del Despacho:</span>
                      <span className="text-lg font-bold text-primary">${dispatchTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center">
                <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">Selecciona productos arriba para agregar al despacho</p>
              </div>
            )}

            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-400">
              El despacho genera una venta a credito con vencimiento a 30 dias. El cliente podra pagar la factura desde la opcion &quot;Cobrar&quot;.
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handleDispatch}
              disabled={savingDispatch || dispatchLines.length === 0}
            >
              {savingDispatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
              {savingDispatch ? 'Procesando...' : `Confirmar Despacho ($${dispatchTotal.toFixed(2)})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales/Dispatch History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Historial de {historyClient?.name}</DialogTitle>
            <DialogDescription>Ventas y despachos realizados a este cliente</DialogDescription>
          </DialogHeader>
          {loadingHistory ? (
            <div className="h-48 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Ventas</p>
                    <p className="text-xl font-bold">{sales.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Comprado</p>
                    <p className="text-xl font-bold">
                      ${sales.reduce((s, sale) => s + sale.total, 0).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detalle de Ventas</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {sales.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin ventas registradas</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Productos</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Método</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sales.map((sale) => {
                            const isCredit = sale.payments.some(p => p.method === 'credito') || sale.receivables.some(r => r.status === 'pendiente')
                            return (
                              <TableRow key={sale.id}>
                                <TableCell className="text-xs whitespace-nowrap pr-4">
                                  {new Date(sale.date).toLocaleDateString('es-VE')}
                                </TableCell>
                                <TableCell className="text-xs max-w-[150px]">
                                  <div className="truncate">
                                    {sale.lines.map(l => l.product.name).join(', ')}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm font-medium text-right whitespace-nowrap">
                                  ${sale.total.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {sale.payments.map(p => p.method).join(', ') || '—'}
                                </TableCell>
                                <TableCell>
                                  {isCredit ? (
                                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                                      {sale.receivables[0]?.pendingBalance > 0
                                        ? `Pendiente: $${sale.receivables[0].pendingBalance.toFixed(2)}`
                                        : 'Credito'}
                                    </Badge>
                                  ) : (
                                    <Badge variant={sale.status === 'completada' ? 'default' : 'secondary'}>
                                      {sale.status}
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cobrar a {paymentClient?.name}</DialogTitle>
            <DialogDescription>
              Registrar pago de deuda pendiente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {paymentClient && (
              <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-medium">{paymentClient.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deuda pendiente:</span>
                  <span className="font-medium text-red-600">${paymentClient.pendingBalance.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select value={paymentMethod} onValueChange={handlePaymentMethodChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="divisas">Divisas ({currencySymbol})</SelectItem>
                  <SelectItem value="efectivo">Efectivo (Bs.)</SelectItem>
                  <SelectItem value="pago_movil">Pago Móvil (Bs.)</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta (Bs.)</SelectItem>
                  <SelectItem value="transferencia">Transferencia (Bs.)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpaymentAmt">Monto a Cobrar {isLocalMethod ? '(Bs.)' : `(${currencySymbol})`}</Label>
              <Input
                id="cpaymentAmt"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              {isLocalMethod && exchangeRate > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivale a {currencySymbol}{paymentAmountInRef.toFixed(2)} (Tasa: {exchangeRate.toFixed(2)} Bs./{referenceCurrency})
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Saldo después del cobro: {currencySymbol}{((paymentClient?.pendingBalance || 0) - paymentAmountInRef).toFixed(2)}
              </p>
            </div>
            {(paymentMethod === 'pago_movil' || paymentMethod === 'tarjeta' || paymentMethod === 'transferencia') && (
              <div className="space-y-2">
                <Label>Referencia</Label>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Número de referencia"
                />
              </div>
            )}
            {paymentMethod === 'efectivo' && !openCashRegId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                No hay caja abierta. El cobro no se registrará como entrada de caja.
              </div>
            )}
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handlePayment}
              disabled={paying || !parseFloat(paymentAmount) || parseFloat(paymentAmount) <= 0}
            >
              {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
              {paying ? 'Procesando...' : 'Registrar Cobro'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
