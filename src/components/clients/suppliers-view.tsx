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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Building2, Plus, Loader2, Eye, Pencil, DollarSign, CalendarDays, FileText, Trash2, Search, Phone, Mail, MapPin, UserCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Supplier {
  id: string
  name: string
  rif: string | null
  phone: string | null
  email: string | null
  address: string | null
  balance: number
  nextDueDate: string | null
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
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [rif, setRif] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')

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

  const filtered = suppliers.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.rif && s.rif.toLowerCase().includes(search.toLowerCase())) ||
      (s.phone && s.phone.includes(search)) ||
      (s.email && s.email.toLowerCase().includes(search.toLowerCase()))
  )

  const openCreateDialog = () => {
    setName('')
    setRif('')
    setPhone('')
    setEmail('')
    setAddress('')
    setShowDialog(true)
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

  const getDueDateBadge = (dueDate: string | null) => {
    if (!dueDate) return <span className="text-muted-foreground">—</span>
    const now = new Date()
    const due = new Date(dueDate)
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) {
      return (
        <Badge variant="destructive" className="text-xs">
          <CalendarDays className="mr-1 h-3 w-3" />
          Vencida
        </Badge>
      )
    }
    if (diffDays <= 3) {
      return (
        <Badge variant="outline" className="text-xs border-red-300 text-red-600">
          <CalendarDays className="mr-1 h-3 w-3" />
          {due.toLocaleDateString('es-VE')}
        </Badge>
      )
    }
    return (
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <CalendarDays className="h-3 w-3" />
        {due.toLocaleDateString('es-VE')}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button onClick={openCreateDialog} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Proveedor
        </Button>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">No se encontraron proveedores</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((supplier) => {
            const isOverdue = supplier.nextDueDate && new Date(supplier.nextDueDate) < new Date()
            return (
              <Card key={supplier.id} className="relative overflow-hidden hover:shadow-md transition-shadow">
                <div className={`h-1 ${supplier.balance > 0 ? (isOverdue ? 'bg-orange-500' : 'bg-red-500') : 'bg-green-500'}`} />
                <CardContent className="p-4 space-y-3">
                  {/* Name + Balance badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">{supplier.name}</h3>
                      {supplier.rif && (
                        <p className="text-xs text-muted-foreground font-mono">{supplier.rif}</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${supplier.balance > 0
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                    }`}>
                      {supplier.balance > 0
                        ? `$${supplier.balance.toFixed(2)}`
                        : 'Sin deuda'
                      }
                    </span>
                  </div>

                  {/* Contact info */}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {supplier.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="truncate">{supplier.phone}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{supplier.email}</span>
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{supplier.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Due date + balance summary */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {supplier.balance > 0 && (
                      <div className="text-red-600 font-medium">
                        Debe: ${supplier.balance.toFixed(2)}
                      </div>
                    )}
                    {supplier.nextDueDate && (
                      <div className="flex items-center">
                        {getDueDateBadge(supplier.nextDueDate)}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 pt-2 border-t">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver Deudas" onClick={() => openDebtDialog(supplier)}>
                      <DollarSign className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-primary hover:text-primary" title="Agregar Deuda" onClick={() => openPayableDialog(supplier)}>
                      <Plus className="mr-1 h-3 w-3" /> Deuda
                    </Button>
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar" onClick={() => openEditDialog(supplier)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" title="Eliminar" onClick={async () => {
                      if (!confirm(`¿Estás seguro de eliminar el proveedor "${supplier.name}"?`)) return
                      try {
                        await api.del(`/api/suppliers?id=${supplier.id}`)
                        toast.success('Proveedor eliminado')
                        fetchSuppliers()
                      } catch {
                        toast.error('Error al eliminar proveedor')
                      }
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

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
    </div>
  )
}
