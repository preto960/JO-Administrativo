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
  RefreshCw,
  Shield,
} from 'lucide-react'
import { toast } from 'sonner'
import { ALL_ROLES, getRoleLabel } from '@/lib/permissions'
import { ColorPicker, applyBothColors } from './color-picker'
import { RolePermissionsEditor } from './role-permissions-editor'

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
  referenceCurrency: string
  usdRate: number
  eurRate: number
  customRate: number
  exchangeRate: number
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
  const [fetchingRate, setFetchingRate] = useState(false)

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
    // Fetch settings independently — this is the critical load
    try {
      const s = await api.get<Settings>('/api/settings')
      setSettings(s)
    } catch {
      toast.error('Error al cargar configuración')
    } finally {
      setLoading(false)
    }

    // Fetch users and currencies in background (non-blocking)
    api.get<UserItem[]>('/api/users').then(setUsers).catch(() => {})
    api.get<CurrencyItem[]>('/api/currencies').then(setCurrencies).catch(() => {})
  }, [])

  // Auto-fetch BCV rates on page load
  const autoFetchRates = useCallback(async () => {
    try {
      const data = await api.get<{ rates: Array<{ currency: string; rate: number; source: string }> }>('/api/exchange-rates')
      if (data?.rates && data.rates.length > 0) {
        setSettings(prev => {
          if (!prev) return prev
          const usdRate = data.rates.find(r => r.currency === 'USD')
          const eurRate = data.rates.find(r => r.currency === 'EUR')
          const updates: Record<string, number> = {}
          if (usdRate) updates.usdRate = usdRate.rate
          if (eurRate) updates.eurRate = eurRate.rate
          // Update effective rate only if no custom rate
          if (!prev.customRate) {
            const refCurrency = prev.referenceCurrency || 'USD'
            const refRate = data.rates.find(r => r.currency === refCurrency) || usdRate
            if (refRate) updates.exchangeRate = refRate.rate
          }
          return { ...prev, ...updates }
        })
      }
    } catch {
      // Silent fail
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])
  useEffect(() => { autoFetchRates() }, [autoFetchRates])

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
          <TabsTrigger value="roles" className="gap-1.5">
            <Shield className="h-3.5 w-3.5 hidden sm:block" />
            <span>Roles</span>
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
          <div className="space-y-4">
            {/* Tasas de Referencia BCV */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Tasas de Referencia (BCV)</CardTitle>
                    <CardDescription>Tasas obtenidas del Banco Central de Venezuela</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setFetchingRate(true)
                      try {
                        const data = await api.get<{ rates: Array<{ currency: string; rate: number; source: string }> }>('/api/exchange-rates')
                        if (data?.rates && data.rates.length > 0) {
                          const usdRate = data.rates.find(r => r.currency === 'USD')
                          const eurRate = data.rates.find(r => r.currency === 'EUR')
                          const updates: Record<string, number> = {}
                          if (usdRate) updates.usdRate = usdRate.rate
                          if (eurRate) updates.eurRate = eurRate.rate
                          if (!settings.customRate) {
                            const refCurrency = settings.referenceCurrency || 'USD'
                            const refRate = data.rates.find(r => r.currency === refCurrency) || usdRate
                            if (refRate) updates.exchangeRate = refRate.rate
                          }
                          setSettings({ ...settings, ...updates })
                          toast.success('Tasas actualizadas desde el BCV')
                        } else {
                          toast.error('No se pudieron obtener las tasas')
                        }
                      } catch {
                        toast.error('Error al obtener tasas del BCV')
                      } finally {
                        setFetchingRate(false)
                      }
                    }}
                    disabled={fetchingRate}
                  >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${fetchingRate ? 'animate-spin' : ''}`} />
                    Actualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* USD Rate */}
                  <div className="rounded-lg border p-4 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="text-base">$</span>
                      USD - Dólar Estadounidense
                    </div>
                    <p className="text-2xl font-bold text-primary">
                      {(settings.usdRate || 0).toFixed(2)} <span className="text-sm font-normal text-muted-foreground">Bs.</span>
                    </p>
                    <p className="text-xs text-muted-foreground">1 USD = {(settings.usdRate || 0).toFixed(2)} VES</p>
                  </div>

                  {/* EUR Rate */}
                  <div className="rounded-lg border p-4 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="text-base">€</span>
                      EUR - Euro
                    </div>
                    <p className="text-2xl font-bold text-primary">
                      {(settings.eurRate || 0).toFixed(2)} <span className="text-sm font-normal text-muted-foreground">Bs.</span>
                    </p>
                    <p className="text-xs text-muted-foreground">1 EUR = {(settings.eurRate || 0).toFixed(2)} VES</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Moneda de Referencia y Tasa Personalizada */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Moneda de Referencia para Precios</CardTitle>
                <CardDescription>Selecciona la moneda base para registrar precios y una tasa personalizada (opcional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Moneda de Referencia</Label>
                  <Select
                    value={settings.referenceCurrency || 'USD'}
                    onValueChange={(v) => {
                      const updated = { ...settings, referenceCurrency: v }
                      // Recalculate effective rate
                      if (!updated.customRate) {
                        const refRate = v === 'EUR' ? updated.eurRate : updated.usdRate
                        updated.exchangeRate = refRate || 0
                      }
                      setSettings(updated)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD - Dólar Estadounidense</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Moneda en la que se registran los precios de productos
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Tasa Personalizada (opcional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Dejar vacío para usar la tasa del BCV"
                    value={settings.customRate > 0 ? settings.customRate.toString() : ''}
                    onChange={(e) => {
                      const customRate = parseFloat(e.target.value) || 0
                      const updated = { ...settings, customRate }
                      // Recalculate effective rate
                      if (customRate > 0) {
                        updated.exchangeRate = customRate
                      } else {
                        const refCurrency = updated.referenceCurrency || 'USD'
                        updated.exchangeRate = refCurrency === 'EUR'
                          ? (updated.eurRate || 0)
                          : (updated.usdRate || 0)
                      }
                      setSettings(updated)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Si ingresas un valor aquí, se usará esta tasa en lugar de la del BCV para calcular los precios.
                  </p>
                </div>

                <Separator />

                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tasa efectiva en uso:</span>
                    <span className="font-bold text-primary">{(settings.exchangeRate || 0).toFixed(2)} Bs.</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fuente:</span>
                    <span className="font-medium">
                      {settings.customRate > 0 ? 'Tasa personalizada' : `BCV - ${settings.referenceCurrency || 'USD'}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Ejemplo 10.00 {settings.referenceCurrency || 'USD'}:</span>
                    <span className="font-bold text-primary">
                      {(10 * (settings.exchangeRate || 0)).toFixed(2)} Bs.
                    </span>
                  </div>
                </div>

                <Button
                  className="bg-primary hover:bg-primary/90 text-white"
                  onClick={() => saveSettings({
                    referenceCurrency: settings.referenceCurrency,
                    usdRate: settings.usdRate,
                    eurRate: settings.eurRate,
                    customRate: settings.customRate,
                    exchangeRate: settings.exchangeRate,
                  })}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar
                </Button>
              </CardContent>
            </Card>

            {/* Moneda Base */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Moneda Base</CardTitle>
                <CardDescription>Moneda principal del sistema para reportes</CardDescription>
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
          </div>
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

        {/* ── Roles & Permisos Tab ────────────────────────── */}
        <TabsContent value="roles">
          <RolePermissionsEditor />
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
