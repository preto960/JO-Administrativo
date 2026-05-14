'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Building2, Plus, Loader2, Eye, Pencil, ShoppingBag, DollarSign, FileText, CalendarDays } from 'lucide-react'
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

interface PurchaseRecord {
  id: string
  date: string
  total: number
  paidAmount: number
  status: string
  currency: { symbol: string; code: string }
}

interface PayableRecord {
  id: string
  amount: number
  pendingBalance: number
  status: string
  dueDate: string | null
  description: string | null
  createdAt: string
  purchase: {
    id: string
    date: string
    total: number
    lines: Array<{ product: { name: string } }>
  } | null
  payments: Array<{ amount: number; createdAt: string; user: { name: string } }>
}

export function SuppliersView() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [rif, setRif] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')

  // Purchases dialog state
  const [purchasesSupplier, setPurchasesSupplier] = useState<Supplier | null>(null)
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([])
  const [loadingPurchases, setLoadingPurchases] = useState(false)
  const [showPurchasesDialog, setShowPurchasesDialog] = useState(false)

  // Edit dialog state
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [editName, setEditName] = useState('')
  const [editRif, setEditRif] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editing, setEditing] = useState(false)

  // Add Payable dialog state
  const [payableSupplier, setPayableSupplier] = useState<Supplier | null>(null)
  const [showPayableDialog, setShowPayableDialog] = useState(false)
  const [payableAmount, setPayableAmount] = useState('')
  const [payableDescription, setPayableDescription] = useState('')
  const [payableDueDate, setPayableDueDate] = useState('')
  const [savingPayable, setSavingPayable] = useState(false)

  // Debt/Payables dialog state
  const [debtSupplier, setDebtSupplier] = useState<Supplier | null>(null)
  const [payables, setPayables] = useState<PayableRecord[]>([])
  const [totalDebt, setTotalDebt] = useState(0)
  const [loadingDebt, setLoadingDebt] = useState(false)
  const [showDebtDialog, setShowDebtDialog] = useState(false)

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

  const openCreateDialog = () => {
    setName('')
    setRif('')
    setPhone('')
    setEmail('')
    setAddress('')
    setShowDialog(true)
  }

  const openPurchasesDialog = async (supplier: Supplier) => {
    setPurchasesSupplier(supplier)
    setShowPurchasesDialog(true)
    setLoadingPurchases(true)
    try {
      const data = await api.get<{ purchases: PurchaseRecord[] }>(`/api/suppliers/${supplier.id}/purchases`)
      setPurchases(data.purchases)
    } catch {
      toast.error('Error al cargar compras')
    } finally {
      setLoadingPurchases(false)
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

  const openPayableDialog = (supplier: Supplier) => {
    setPayableSupplier(supplier)
    setPayableAmount('')
    setPayableDescription('')
    setPayableDueDate('')
    setShowPayableDialog(true)
  }

  const openDebtDialog = async (supplier: Supplier) => {
    setDebtSupplier(supplier)
    setShowDebtDialog(true)
    setLoadingDebt(true)
    try {
      const data = await api.get<{ payables: PayableRecord[]; totalDebt: number }>(`/api/suppliers/${supplier.id}/payables`)
      setPayables(data.payables)
      setTotalDebt(data.totalDebt)
    } catch {
      toast.error('Error al cargar deudas')
    } finally {
      setLoadingDebt(false)
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

  const handleCreatePayable = async () => {
    if (!payableSupplier) return
    const amt = parseFloat(payableAmount)
    if (!amt || amt <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    setSavingPayable(true)
    try {
      await api.post(`/api/suppliers/${payableSupplier.id}/payables`, {
        amount: amt,
        description: payableDescription.trim() || null,
        dueDate: payableDueDate || null,
      })
      toast.success(`Cuenta por pagar de $${amt.toFixed(2)} registrada`)
      setShowPayableDialog(false)
      fetchSuppliers()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al crear cuenta por pagar'
      toast.error(msg)
    } finally {
      setSavingPayable(false)
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
          <p className="text-sm text-muted-foreground">Directorio de proveedores de tu negocio</p>
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
                  <TableHead className="text-right hidden md:table-cell">Compras</TableHead>
                  <TableHead className="text-right">Deuda</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{supplier.name}</span>
                        {supplier.phone && (
                          <p className="text-xs text-muted-foreground md:hidden">{supplier.phone}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{supplier.rif || '—'}</TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      <Badge variant="outline">{supplier._count.purchases}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={supplier.balance > 0 ? 'text-red-600 font-medium' : 'text-primary'}>
                        ${supplier.balance.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Editar" onClick={() => openEditDialog(supplier)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Ver Deudas" onClick={() => openDebtDialog(supplier)}>
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" title="Agregar Deuda" onClick={() => openPayableDialog(supplier)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" title="Ver Compras" onClick={() => openPurchasesDialog(supplier)}>
                          <ShoppingBag className="mr-1 h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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

      {/* Add Payable Dialog */}
      <Dialog open={showPayableDialog} onOpenChange={setShowPayableDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Deuda a {payableSupplier?.name}</DialogTitle>
            <DialogDescription>Registra una cuenta por pagar a este proveedor</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {payableSupplier && (
              <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deuda actual:</span>
                  <span className="font-medium text-red-600">${payableSupplier.balance.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="pamount">Monto a Deber *</Label>
              <Input
                id="pamount"
                type="number"
                step="0.01"
                min="0"
                value={payableAmount}
                onChange={(e) => setPayableAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdesc">Descripción / Productos</Label>
              <Input
                id="pdesc"
                value={payableDescription}
                onChange={(e) => setPayableDescription(e.target.value)}
                placeholder="Ej: 10 cajas de cerveza Polar, 5 bolsas de harina PAN..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pduedate">Plazo de Pago</Label>
              <Input
                id="pduedate"
                type="date"
                value={payableDueDate}
                onChange={(e) => setPayableDueDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Fecha límite para realizar el pago</p>
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handleCreatePayable}
              disabled={savingPayable || !parseFloat(payableAmount) || parseFloat(payableAmount) <= 0}
            >
              {savingPayable ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {savingPayable ? 'Registrando...' : 'Registrar Deuda'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Debt/Payables Dialog */}
      <Dialog open={showDebtDialog} onOpenChange={setShowDebtDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Deudas de {debtSupplier?.name}</DialogTitle>
            <DialogDescription>Cuentas por pagar pendientes</DialogDescription>
          </DialogHeader>
          {loadingDebt ? (
            <div className="h-48 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Deuda Total</p>
                    <p className="text-xl font-bold text-red-600">${totalDebt.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Cuentas Pendientes</p>
                    <p className="text-xl font-bold">
                      {payables.filter(p => p.status === 'pendiente' || p.status === 'parcial').length}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Payables Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detalle de Deudas</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {payables.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin deudas registradas</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Descripción</TableHead>
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
                                {new Date(p.createdAt).toLocaleDateString('es-VE')}
                              </TableCell>
                              <TableCell className="text-xs max-w-[150px] truncate">
                                {p.description || p.purchase?.lines?.map(l => l.product.name).join(', ') || '—'}
                              </TableCell>
                              <TableCell className="text-sm">
                                ${p.amount.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                <span className={p.pendingBalance > 0 ? 'text-red-600' : 'text-primary'}>
                                  ${p.pendingBalance.toFixed(2)}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs">
                                {p.dueDate ? (
                                  <span className={new Date(p.dueDate) < new Date() && p.pendingBalance > 0 ? 'text-red-600 font-medium' : ''}>
                                    {new Date(p.dueDate).toLocaleDateString('es-VE')}
                                  </span>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  p.status === 'pagada' ? 'default' :
                                  p.status === 'parcial' ? 'outline' : 'secondary'
                                }>
                                  {p.status === 'pagada' ? 'Pagada' :
                                   p.status === 'parcial' ? 'Parcial' : 'Pendiente'}
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Purchases Dialog */}
      <Dialog open={showPurchasesDialog} onOpenChange={setShowPurchasesDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Compras de {purchasesSupplier?.name}</DialogTitle>
            <DialogDescription>Historial de compras realizadas a este proveedor</DialogDescription>
          </DialogHeader>
          {loadingPurchases ? (
            <div className="h-48 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Compras</p>
                    <p className="text-xl font-bold">{purchases.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Gastado</p>
                    <p className="text-xl font-bold">
                      {purchases.length > 0 ? `${purchases[0]?.currency?.symbol || '$'}${purchases.reduce((s, p) => s + p.total, 0).toFixed(2)}` : '$0.00'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Purchases Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detalle de Compras</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {purchases.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin compras registradas</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Pagado</TableHead>
                            <TableHead>Pendiente</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchases.map((p) => {
                            const pending = p.total - p.paidAmount
                            return (
                              <TableRow key={p.id}>
                                <TableCell className="text-xs">
                                  {new Date(p.date).toLocaleDateString('es-VE')}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {p.currency?.symbol || '$'}{p.total.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {p.currency?.symbol || '$'}{p.paidAmount.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-sm font-medium text-amber-600">
                                  {pending > 0 ? `${p.currency?.symbol || '$'}${pending.toFixed(2)}` : '—'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={
                                    p.status === 'pagada' ? 'default' :
                                    p.status === 'parcial' ? 'outline' : 'secondary'
                                  }>
                                    {p.status === 'pagada' ? 'Pagada' :
                                     p.status === 'parcial' ? 'Parcial' : 'Recibida'}
                                  </Badge>
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
    </div>
  )
}
