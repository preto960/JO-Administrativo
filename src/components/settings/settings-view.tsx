'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Building2,
  DollarSign,
  GitBranch,
  Users,
  Monitor,
  Palette,
  Save,
  Plus,
  Edit,
  Trash2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { ALL_ROLES, getRoleLabel } from '@/lib/permissions'
import { ColorPicker, applyBothColors } from './color-picker'

interface Settings {
  id: string
  key: string
  businessName: string
  logoUrl: string
  address: string
  phone: string
  rif: string
  email: string
  baseCurrencyId: string
  sessionDuration: number
  notificationsEnabled: boolean
  primaryColor: string
  secondaryColor: string
  theme: string
}

interface UserItem {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  createdAt: string
}

interface CurrencyItem {
  id: string
  code: string
  name: string
  symbol: string
  isBase: boolean
}

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Users state
  const [users, setUsers] = useState<UserItem[]>([])
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([])
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [userSaving, setUserSaving] = useState(false)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userRole, setUserRole] = useState('cajero')
  const [userActive, setUserActive] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      const [s, u, c] = await Promise.all([
        api.get<Settings>('/api/settings'),
        api.get<UserItem[]>('/api/users'),
        api.get<CurrencyItem[]>('/api/currencies'),
      ])
      setSettings(s)
      setUsers(u)
      setCurrencies(c)
    } catch {
      toast.error('Error al cargar configuración')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const saveSettings = async (updates: Partial<Settings>) => {
    setSaving(true)
    try {
      const updated = await api.put<Settings>('/api/settings', updates)
      setSettings(updated)
      // Re-apply colors after save to ensure they persist
      applyBothColors(updated.primaryColor || 'emerald', updated.secondaryColor || 'slate')
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error al guardar configuración')
    } finally {
      setSaving(false)
    }
  }

  // ── User CRUD ──────────────────────────────────────────────

  const openCreateUser = () => {
    setEditingUser(null)
    setUserName('')
    setUserEmail('')
    setUserPassword('')
    setUserRole('cajero')
    setUserActive(true)
    setShowUserDialog(true)
  }

  const openEditUser = (user: UserItem) => {
    setEditingUser(user)
    setUserName(user.name)
    setUserEmail(user.email)
    setUserPassword('')
    setUserRole(user.role)
    setUserActive(user.active)
    setShowUserDialog(true)
  }

  const saveUser = async () => {
    if (!userName || !userEmail) {
      toast.error('Nombre y email son obligatorios')
      return
    }
    setUserSaving(true)
    try {
      if (editingUser) {
        await api.put('/api/users', {
          id: editingUser.id,
          name: userName,
          email: userEmail,
          role: userRole,
          active: userActive,
          password: userPassword || undefined,
        })
        toast.success('Usuario actualizado')
      } else {
        await api.post('/api/users', {
          name: userName,
          email: userEmail,
          password: userPassword || 'changeme',
          role: userRole,
        })
        toast.success('Usuario creado')
      }
      setShowUserDialog(false)
      fetchSettings()
    } catch {
      toast.error('Error al guardar usuario')
    } finally {
      setUserSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="h-96 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  if (!settings) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Administra la configuración general del sistema
        </p>
      </div>

      <Tabs defaultValue="empresa" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="empresa" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5 hidden sm:block" />
            <span>Empresa</span>
          </TabsTrigger>
          <TabsTrigger value="moneda" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5 hidden sm:block" />
            <span>Moneda</span>
          </TabsTrigger>
          <TabsTrigger value="sucursales" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5 hidden sm:block" />
            <span>Sucursales</span>
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-1.5">
            <Users className="h-3.5 w-3.5 hidden sm:block" />
            <span>Usuarios</span>
          </TabsTrigger>
          <TabsTrigger value="sistema" className="gap-1.5">
            <Monitor className="h-3.5 w-3.5 hidden sm:block" />
            <span>Sistema</span>
          </TabsTrigger>
          <TabsTrigger value="apariencia" className="gap-1.5">
            <Palette className="h-3.5 w-3.5 hidden sm:block" />
            <span>Apariencia</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Empresa Tab ────────────────────────────────── */}
        <TabsContent value="empresa">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos de la Empresa</CardTitle>
              <CardDescription>Información general de tu negocio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre del Negocio</Label>
                  <Input
                    value={settings.businessName}
                    onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RIF</Label>
                  <Input
                    value={settings.rif}
                    onChange={(e) => setSettings({ ...settings, rif: e.target.value })}
                    placeholder="J-00000000-0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    placeholder="+58 212-0000000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>URL del Logo</Label>
                <Input
                  value={settings.logoUrl}
                  onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                  placeholder="https://ejemplo.com/logo.png"
                />
              </div>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => saveSettings({
                  businessName: settings.businessName,
                  rif: settings.rif,
                  email: settings.email,
                  phone: settings.phone,
                  address: settings.address,
                  logoUrl: settings.logoUrl,
                })}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Moneda Tab ─────────────────────────────────── */}
        <TabsContent value="moneda">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Moneda Base</CardTitle>
              <CardDescription>Selecciona la moneda principal del sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Moneda Base</Label>
                <Select
                  value={settings.baseCurrencyId || currencies.find(c => c.isBase)?.id || ''}
                  onValueChange={(v) => setSettings({ ...settings, baseCurrencyId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar moneda" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} ({c.symbol}) - {c.name}
                        {c.isBase && ' ★'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium mb-2">Monedas Disponibles</h4>
                <div className="space-y-2">
                  {currencies.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span>{c.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{c.code}</Badge>
                        <span className="font-medium">{c.symbol}</span>
                        {c.isBase && <Badge className="bg-primary">Base</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => saveSettings({ baseCurrencyId: settings.baseCurrencyId })}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sucursales Tab ─────────────────────────────── */}
        <TabsContent value="sucursales">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sucursales</CardTitle>
              <CardDescription>Gestión de sucursales (en desarrollo)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <GitBranch className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Sucursal Principal</p>
                    <p className="text-sm text-muted-foreground">ID: sucursal-1</p>
                  </div>
                  <Badge className="bg-primary ml-auto">Activa</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                La gestión de múltiples sucursales estará disponible próximamente.
                Actualmente el sistema opera con una sola sucursal (sucursal-1).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Usuarios Tab ──────────────────────────────── */}
        <TabsContent value="usuarios">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Usuarios del Sistema</CardTitle>
                  <CardDescription>Administra usuarios y permisos</CardDescription>
                </div>
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={openCreateUser}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Nuevo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{getRoleLabel(user.role)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.active ? 'default' : 'secondary'}>
                            {user.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditUser(user)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sistema Tab ───────────────────────────────── */}
        <TabsContent value="sistema">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuración del Sistema</CardTitle>
              <CardDescription>Parámetros generales de funcionamiento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Duración de Sesión (horas)</Label>
                <Input
                  type="number"
                  min="1"
                  max="24"
                  value={(settings.sessionDuration / 3600).toString()}
                  onChange={(e) => setSettings({
                    ...settings,
                    sessionDuration: (parseFloat(e.target.value) || 8) * 3600,
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Tiempo antes de que la sesión expire automáticamente (1-24 horas)
                </p>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificaciones Push</p>
                  <p className="text-sm text-muted-foreground">Recibir alertas en tiempo real</p>
                </div>
                <Switch
                  checked={settings.notificationsEnabled}
                  onCheckedChange={(v) => setSettings({ ...settings, notificationsEnabled: v })}
                />
              </div>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => saveSettings({
                  sessionDuration: settings.sessionDuration,
                  notificationsEnabled: settings.notificationsEnabled,
                })}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Apariencia Tab ────────────────────────────── */}
        <TabsContent value="apariencia">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personalización Visual</CardTitle>
              <CardDescription>Cambia el aspecto visual del sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Color Principal</Label>
                <ColorPicker
                  value={settings.primaryColor}
                  onChange={(v) => {
                    const updated = { ...settings, primaryColor: v }
                    setSettings(updated)
                    applyBothColors(v, updated.secondaryColor)
                  }}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Color Secundario</Label>
                <ColorPicker
                  value={settings.secondaryColor}
                  onChange={(v) => {
                    const updated = { ...settings, secondaryColor: v }
                    setSettings(updated)
                    applyBothColors(updated.primaryColor, v)
                  }}
                />
              </div>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => saveSettings({
                  primaryColor: settings.primaryColor,
                  secondaryColor: settings.secondaryColor,
                })}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── User Dialog ──────────────────────────────────── */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Modifica los datos del usuario' : 'Crea un nuevo usuario del sistema'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="usuario@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Contraseña{editingUser ? ' (dejar vacío para no cambiar)' : ' *'}</Label>
              <Input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={userRole} onValueChange={setUserRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>{getRoleLabel(role)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingUser && (
              <div className="flex items-center gap-2">
                <Switch checked={userActive} onCheckedChange={setUserActive} />
                <Label className="cursor-pointer">Usuario activo</Label>
              </div>
            )}
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={saveUser} disabled={userSaving}>
              {userSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {userSaving ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear Usuario'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
