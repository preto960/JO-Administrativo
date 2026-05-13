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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Plus, Search, Users } from 'lucide-react'
import { toast } from 'sonner'

interface Client {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  _count: { sales: number }
}

export function ClientsTable() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')

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

  const filtered = clients.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search)) || (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  )

  const openCreate = () => {
    setFormName('')
    setFormPhone('')
    setFormEmail('')
    setFormAddress('')
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
                  <TableHead className="hidden lg:table-cell">Dirección</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{client.phone || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell">{client.email || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{client.address || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{client._count.sales}</Badge>
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
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Crear Cliente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
