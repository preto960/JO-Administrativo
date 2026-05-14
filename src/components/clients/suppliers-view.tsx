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
import { Building2, Plus, Loader2, Eye, Pencil, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'

interface Supplier {
  id: string
  name: string
  rif: string | null
  phone: string | null
  email: string | null
  address: string | null
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
                  <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden lg:table-cell">Email</TableHead>
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
                      <Badge variant="outline">{supplier._count.purchases}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Editar" onClick={() => openEditDialog(supplier)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" title="Ver Compras" onClick={() => openPurchasesDialog(supplier)}>
                          <ShoppingBag className="mr-1 h-3 w-3" /> Compras
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
