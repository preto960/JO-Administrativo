'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Loader2, Shield, Save, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { ALL_ROLES, getRoleLabel, type UserPermissions } from '@/lib/permissions'

const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  admin: {
    role: 'admin',
    views: ['pos', 'dashboard', 'products', 'purchases', 'clients', 'suppliers', 'cash', 'expenses', 'settings'],
    canManageUsers: true,
    canAccessSettings: true,
    canManageProducts: true,
    canManagePurchases: true,
    canManageClients: true,
    canManageCash: true,
    canManageExpenses: true,
    canManageSuppliers: true,
  },
  gerente: {
    role: 'gerente',
    views: ['pos', 'dashboard', 'products', 'purchases', 'clients', 'suppliers', 'cash', 'expenses'],
    canManageUsers: false,
    canAccessSettings: false,
    canManageProducts: true,
    canManagePurchases: true,
    canManageClients: true,
    canManageCash: true,
    canManageExpenses: true,
    canManageSuppliers: true,
  },
  cajero: {
    role: 'cajero',
    views: ['pos', 'cash'],
    canManageUsers: false,
    canAccessSettings: false,
    canManageProducts: false,
    canManagePurchases: false,
    canManageClients: false,
    canManageCash: true,
    canManageExpenses: false,
    canManageSuppliers: false,
  },
  vendedor: {
    role: 'vendedor',
    views: ['pos', 'products', 'clients'],
    canManageUsers: false,
    canAccessSettings: false,
    canManageProducts: false,
    canManagePurchases: false,
    canManageClients: true,
    canManageCash: false,
    canManageExpenses: false,
    canManageSuppliers: false,
  },
}

const ALL_VIEWS = [
  { key: 'pos', label: 'Punto de Venta' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'products', label: 'Productos' },
  { key: 'purchases', label: 'Compras' },
  { key: 'clients', label: 'Clientes' },
  { key: 'suppliers', label: 'Proveedores' },
  { key: 'cash', label: 'Caja' },
  { key: 'expenses', label: 'Gastos' },
  { key: 'settings', label: 'Configuración' },
]

const ALL_ABILITIES = [
  { key: 'canManageUsers', label: 'Gestionar Usuarios' },
  { key: 'canAccessSettings', label: 'Acceder a Configuración' },
  { key: 'canManageProducts', label: 'Gestionar Productos' },
  { key: 'canManagePurchases', label: 'Gestionar Compras' },
  { key: 'canManageClients', label: 'Gestionar Clientes' },
  { key: 'canManageCash', label: 'Gestionar Caja' },
  { key: 'canManageExpenses', label: 'Gestionar Gastos' },
  { key: 'canManageSuppliers', label: 'Gestionar Proveedores' },
]

export function RolePermissionsEditor() {
  const [permissions, setPermissions] = useState<Record<string, UserPermissions>>(DEFAULT_PERMISSIONS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>('admin')

  const loadPermissions = useCallback(async () => {
    try {
      const data = await api.get<{ permissions: Record<string, UserPermissions> }>('/api/role-permissions')
      if (data?.permissions && Object.keys(data.permissions).length > 0) {
        // Merge with defaults (in case new permissions were added in code)
        const merged = { ...DEFAULT_PERMISSIONS }
        for (const [role, perms] of Object.entries(data.permissions)) {
          if (merged[role]) {
            merged[role] = { ...DEFAULT_PERMISSIONS[role], ...perms } as UserPermissions
          } else {
            merged[role] = perms as UserPermissions
          }
        }
        setPermissions(merged)
      }
    } catch {
      // Use defaults
      setPermissions(DEFAULT_PERMISSIONS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  const toggleView = (role: string, view: string) => {
    setPermissions(prev => {
      const rolePerms = { ...prev[role] }
      const views = rolePerms.views.includes(view)
        ? rolePerms.views.filter(v => v !== view)
        : [...rolePerms.views, view]
      return { ...prev, [role]: { ...rolePerms, views } }
    })
  }

  const toggleAbility = (role: string, ability: string) => {
    setPermissions(prev => {
      const rolePerms = { ...prev[role] }
      return { ...prev, [role]: { ...rolePerms, [ability]: !rolePerms[ability as keyof UserPermissions] } }
    })
  }

  const savePermissions = async () => {
    setSaving(true)
    try {
      await api.put('/api/role-permissions', { permissions })
      toast.success('Permisos guardados correctamente')
    } catch {
      toast.error('Error al guardar permisos')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = () => {
    setPermissions(DEFAULT_PERMISSIONS)
    toast.info('Permisos restablecidos a valores por defecto')
  }

  const currentPerms = permissions[selectedRole]

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Permisos por Rol
              </CardTitle>
              <CardDescription>Configura qué puede acceder y hacer cada rol en el sistema</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetToDefaults}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Restaurar
              </Button>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={savePermissions}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                Guardar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Role Selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {ALL_ROLES.map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedRole === role
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {getRoleLabel(role)}
              </button>
            ))}
          </div>

          {/* Views Access */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3">Vistas Accesibles</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Selecciona qué vistas del menú puede ver este rol
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ALL_VIEWS.map((view) => {
                  const isActive = currentPerms?.views.includes(view.key)
                  return (
                    <button
                      key={view.key}
                      onClick={() => toggleView(selectedRole, view.key)}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-all text-left ${
                        isActive
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                        isActive ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                      }`}>
                        {isActive && (
                          <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      {view.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Abilities */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Habilidades</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Configura las acciones que puede realizar este rol
              </p>
              <div className="space-y-2">
                {ALL_ABILITIES.map((ability) => {
                  const isEnabled = currentPerms?.[ability.key as keyof UserPermissions] as boolean
                  return (
                    <div
                      key={ability.key}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <span className="text-sm">{ability.label}</span>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleAbility(selectedRole, ability.key)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-6 rounded-lg border bg-muted/50 p-4">
            <h4 className="text-sm font-semibold mb-2">Resumen: {getRoleLabel(selectedRole)}</h4>
            <div className="flex flex-wrap gap-1.5">
              {currentPerms?.views.map((view) => (
                <Badge key={view} variant="outline" className="text-xs">
                  {ALL_VIEWS.find(v => v.key === view)?.label || view}
                </Badge>
              ))}
              {currentPerms?.views.length === 0 && (
                <span className="text-xs text-muted-foreground">Sin vistas asignadas</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ALL_ABILITIES.filter(a => currentPerms?.[a.key as keyof UserPermissions]).map(a => (
                <Badge key={a.key} className="bg-primary text-xs">
                  {a.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
