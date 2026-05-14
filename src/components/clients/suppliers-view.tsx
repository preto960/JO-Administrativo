'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
import { Building2, Plus, Loader2, DollarSign, Eye, Pencil, History } from 'lucide-react'
import { toast } from 'sonner'

interface Supplier {
  id: string
  name: string
  rif: string | null
  phone: string | null
  email: string | null
  address: string | null
  balance: number
  _count: { purchases: number }
}

interface Payable {
  id: string
  amount: number
  pendingBalance: number
  dueDate: string | null
  status: string
  createdAt: string
  purchase: { id: string; date: string; total: number; paidUpfront: boolean } | null
  payments: Array<{ id: string; amount: number; method: string; reference: string | null; createdAt: string; user: { name: string } }>
}

interface PaymentRecord {
  id: string
  amount: number
  method: string
  reference: string | null
  createdAt: string
  user: { name: string }
}

export function SuppliersView() {
  const { user } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [rif, setRif] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')

  // Payment dialog state
  const [payingSupplierId, setPayingSupplierId] = useState<string | null>(null)
  const [payingSupplierName, setPayingSupplierName] = useState('')
  const [payingSupplierBalance, setPayingSupplierBalance] = useState(0)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [paymentReference, setPaymentReference] = useState('')
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paying, setPaying] = useState(false)

  // History dialog state
  const [historySupplierId, setHistorySupplierId] = useState<string | null>(null)
  const [historySupplierName, setHistorySupplierName] = useState('')
  const [payables, setPayables] = useState<Payable[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)

  // Edit dialog state
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [editName, setEditName] = useState('')
  const [editRif, setEditRif] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editing, setEditing] = useState(false)

  const [openCashRegId, setOpenCashRegId] = useState<string | null>(null)

  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const data = await api.get<Supplier[]>('/api/suppliers')
      setSuppliers(data)
    } catch {
      toast.error('Error al cargar proveedores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSuppliers() }, [])

  // Fetch open cash register
  useEffect(() => {
    api.get<Array<{ id: string; status: string }>>('/api/cash-register')
      .then(regs => {
        const openReg = regs?.find(r => r.status === 'abierta')
        if (openReg) setOpenCashRegId(openReg.id)
      })
      .catch(() => {})
  }, [])

  const openCreateDialog = () => {
    setName('')
    setRif('')
    setPhone('')
    setEmail('')
    setAddress('')
    setShowDialog(true)
  }

  const openPaymentDialog = (supplier: Supplier) => {
    setPayingSupplierId(supplier.id)
    setPayingSupplierName(supplier.name)
    setPayingSupplierBalance(supplier.balance)
    setPaymentAmount(supplier.balance.toFixed(2))
    setPaymentMethod('efectivo')
    setPaymentReference('')
    setShowPaymentDialog(true)
  }

  const openHistoryDialog = async (supplier: Supplier) => {
    setHistorySupplierId(supplier.id)
    setHistorySupplierName(supplier.name)
    setShowHistoryDialog(true)
    setLoadingHistory(true)
    try {
      const data = await api.get<{ payables: Payable[]; payments: PaymentRecord[] }>(`/api/suppliers/${supplier.id}/payables`)
      setPayables(data.payables)
      setPayments(data.payments)
    } catch {
      toast.error('Error al cargar historial')
    } finally {
      setLoadingHistory(false)
    }
  }

  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setEditName(supplier.name)
    setEditRif(supplier.rif || '')
    setEditPhone(supplier.phone || '')
    setEditEmail(supplier.email || '')
    setEditAddress(supplier.address || '')
    setShowEditDialog(true)
  }

  const handlePayment = async () => {
    if (!payingSupplierId) return
    const amt = parseFloat(paymentAmount)
    if (!amt || amt <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    if (amt > payingSupplierBalance) {
      toast.error(`El monto no puede ser mayor al balance ($${payingSupplierBalance.toFixed(2)})`)
      return
    }
    setPaying(true)
    try {
      await api.post(`/api/suppliers/${payingSupplierId}/payment`, {
        amount: amt,
        method: paymentMethod,
        reference: paymentReference || undefined,
        cashRegId: openCashRegId || undefined,
        userId: user?.id || '',
        currencyId: '', // Will be resolved server-side if needed
      })
      toast.success(`Pago de $${amt.toFixed(2)} registrado exitosamente`)
      setShowPaymentDialog(false)
      fetchSuppliers()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar pago'
      toast.error(msg)
    } finally {
      setPaying(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre del proveedor es obligatorio')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/suppliers', {
        name: name.trim(),
        rif: rif.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
      })
      toast.success('Proveedor creado exitosamente')
      setShowDialog(false)
      fetchSuppliers()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al crear proveedor'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleEditSave = async () => {
    if (!editingSupplier || !editName.trim()) {
      toast.error('El nombre del proveedor es obligatorio')
      return
    }
    setEditing(true)
    try {
      await api.put(`/api/suppliers/${editingSupplier.id}`, {
        name: editName.trim(),
        rif: editRif.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        address: editAddress.trim() || null,
      })
      toast.success('Proveedor actualizado exitosamente')
      setShowEditDialog(false)
      fetchSuppliers()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al actualizar proveedor'
      toast.error(msg)
    } finally {
      setEditing(false)
    }
  }

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Proveedores</h2>
          <p className="text-sm text-muted-foreground">Gestiona los proveedores de tu negocio</p>
        </div>
        <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={openCreateDialog}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Nuevo Proveedor
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="hidden sm:table-cell">RIF</TableHead>
                  <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden lg:table-cell">Email</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{supplier.rif || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell">{supplier.phone || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{supplier.email || '—'}</TableCell>
                    <TableCell className="text-right">
                      <span className={supplier.balance > 0 ? 'text-amber-600 font-medium' : 'text-primary'}>
                        ${supplier.balance.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{supplier._count.purchases}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Editar" onClick={() => openEditDialog(supplier)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Historial" onClick={() => openHistoryDialog(supplier)}>
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        {supplier.balance > 0 && (
                          <Button size="sm" variant="outline" className="text-primary hover:text-primary" onClick={() => openPaymentDialog(supplier)}>
                            <DollarSign className="mr-1 h-3 w-3" /> Pagar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Building2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No hay proveedores registrados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* New Supplier Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Proveedor</DialogTitle>
            <DialogDescription>Registra un nuevo proveedor para tu negocio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proveedor" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>RIF</Label>
                <Input value={rif} onChange={(e) => setRif(e.target.value)} placeholder="J-00000000-0" />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+58 212-0000000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="proveedor@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección del proveedor" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? 'Guardando...' : 'Crear Proveedor'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Proveedor</DialogTitle>
            <DialogDescription>Modifica los datos del proveedor</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre del proveedor" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>RIF</Label>
                <Input value={editRif} onChange={(e) => setEditRif(e.target.value)} placeholder="J-00000000-0" />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+58 212-0000000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="proveedor@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Dirección del proveedor" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={handleEditSave} disabled={editing}>
              {editing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
            <DialogDescription>
              Registrar pago a {payingSupplierName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proveedor:</span>
                <span className="font-medium">{payingSupplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance pendiente:</span>
                <span className="font-medium text-amber-600">${payingSupplierBalance.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="pago_movil">Pago Móvil</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentAmt">Monto a Pagar</Label>
              <Input
                id="paymentAmt"
                type="number"
                step="0.01"
                min="0"
                max={payingSupplierBalance}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Saldo después del pago: ${(payingSupplierBalance - (parseFloat(paymentAmount) || 0)).toFixed(2)}
              </p>
            </div>
            {paymentMethod !== 'efectivo' && (
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
                No hay caja abierta. El pago no se registrará como salida de caja.
              </div>
            )}
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handlePayment}
              disabled={paying || !parseFloat(paymentAmount) || parseFloat(paymentAmount) <= 0}
            >
              {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
              {paying ? 'Procesando...' : 'Registrar Pago'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Historial de {historySupplierName}</DialogTitle>
            <DialogDescription>Cuentas por pagar y pagos realizados</DialogDescription>
          </DialogHeader>
          {loadingHistory ? (
            <div className="h-48 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Payables */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Cuentas por Pagar</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {payables.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin cuentas pendientes</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Pendiente</TableHead>
                            <TableHead>Vencimiento</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payables.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs">
                                {p.purchase ? new Date(p.purchase.date).toLocaleDateString('es-VE') : '—'}
                              </TableCell>
                              <TableCell className="text-sm">${p.amount.toFixed(2)}</TableCell>
                              <TableCell className="text-sm font-medium text-amber-600">
                                ${p.pendingBalance.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {p.dueDate ? new Date(p.dueDate).toLocaleDateString('es-VE') : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={p.status === 'pendiente' ? 'default' : p.status === 'parcial' ? 'outline' : 'secondary'}>
                                  {p.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payments */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pagos Realizados</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin pagos registrados</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Método</TableHead>
                            <TableHead>Referencia</TableHead>
                            <TableHead>Usuario</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs">
                                {new Date(p.createdAt).toLocaleString('es-VE')}
                              </TableCell>
                              <TableCell className="text-sm font-medium text-primary">
                                ${p.amount.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-xs capitalize">{p.method}</TableCell>
                              <TableCell className="text-xs">{p.reference || '—'}</TableCell>
                              <TableCell className="text-xs">{p.user?.name || '—'}</TableCell>
                            </TableRow>
                          ))}
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
    </div>
  )
}
