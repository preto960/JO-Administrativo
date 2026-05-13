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
import { Card, CardContent } from '@/components/ui/card'
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
import { Building2, Plus, Loader2 } from 'lucide-react'
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
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>RIF</Label>
                <Input
                  value={rif}
                  onChange={(e) => setRif(e.target.value)}
                  placeholder="J-00000000-0"
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+58 212-0000000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="proveedor@ejemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Dirección del proveedor"
              />
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? 'Guardando...' : 'Crear Proveedor'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
