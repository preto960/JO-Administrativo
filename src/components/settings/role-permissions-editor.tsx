'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Loader2, Shield, Save, RotateCcw, Eye, Pencil, Check, X as XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ALL_ROLES, getRoleLabel, type UserPermissions } from '@/lib/permissions'

// ── Default permissions per role ───────────────────────────────
const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  admin: {
    role: 'admin',
    views: ['pos', 'dashboard', 'products', 'clients', 'suppliers', 'cash', 'expenses', 'settings'],
    canManageUsers: true,
    canAccessSettings: true,
    canManageProducts: true,
    canManageClients: true,
    canManageCash: true,
    canManageExpenses: true,
    canManageSuppliers: true,
    canViewAudit: true,
  },
  gerente: {
    role: 'gerente',
    views: ['pos', 'dashboard', 'products', 'clients', 'suppliers', 'cash', 'expenses'],
    canManageUsers: false,
    canAccessSettings: false,
    canManageProducts: true,
    canManageClients: true,
    canManageCash: true,
    canManageExpenses: true,
    canManageSuppliers: true,
    canViewAudit: false,
  },
  cajero: {
    role: 'cajero',
    views: ['pos', 'cash'],
    canManageUsers: false,
    canAccessSettings: false,
    canManageProducts: false,
    canManageClients: false,
    canManageCash: true,
    canManageExpenses: false,
    canManageSuppliers: false,
    canViewAudit: false,
  },
  vendedor: {
    role: 'vendedor',
    views: ['pos', 'products', 'clients'],
    canManageUsers: false,
    canAccessSettings: false,
    canManageProducts: false,
    canManageClients: true,
    canManageCash: false,
    canManageExpenses: false,
    canManageSuppliers: false,
    canViewAudit: false,
  },
}

// ── Permission definitions (what each row represents) ──────────
interface PermRow {
  id: string
  label: string
  description: string
  icon: React.ElementType
  type: 'view' | 'ability'
  // For 'view' type: checks if the view key is in the role's views array
  // For 'ability' type: checks the boolean key on the permissions object
  key: string
}

const PERMISSION_ROWS: PermRow[] = [
  // ── VISTAS (acceso al menú lateral) ──
  { id: 'view-pos', label: 'Punto de Venta', description: 'Acceder a la pantalla de ventas', icon: () => <span className="font-mono text-xs">POS</span>, type: 'view', key: 'pos' },
  { id: 'view-dashboard', label: 'Dashboard', description: 'Ver panel de estadísticas', icon: () => <span className="font-mono text-xs">📊</span>, type: 'view', key: 'dashboard' },
  { id: 'view-products', label: 'Productos', description: 'Ver la lista de productos', icon: () => <span className="font-mono text-xs">📦</span>, type: 'view', key: 'products' },
  { id: 'view-clients', label: 'Clientes', description: 'Ver la lista de clientes', icon: () => <span className="font-mono text-xs">👥</span>, type: 'view', key: 'clients' },
  { id: 'view-suppliers', label: 'Proveedores', description: 'Ver la lista de proveedores', icon: () => <span className="font-mono text-xs">🏭</span>, type: 'view', key: 'suppliers' },
  { id: 'view-cash', label: 'Caja', description: 'Acceder al registro de caja', icon: () => <span className="font-mono text-xs">💰</span>, type: 'view', key: 'cash' },
  { id: 'view-expenses', label: 'Gastos', description: 'Ver y registrar gastos', icon: () => <span className="font-mono text-xs">💸</span>, type: 'view', key: 'expenses' },
  { id: 'view-settings', label: 'Configuración', description: 'Acceder a la configuración del sistema', icon: () => <span className="font-mono text-xs">⚙</span>, type: 'view', key: 'settings' },
  // ── ACCIONES / HABILIDADES ──
  { id: 'can-manage-users', label: 'Gestionar Usuarios', description: 'Crear, editar y eliminar usuarios', icon: () => <span className="font-mono text-xs">👤</span>, type: 'ability', key: 'canManageUsers' },
  { id: 'can-access-settings', label: 'Acceder a Configuración', description: 'Permitir entrada a la pestaña de configuración', icon: () => <span className="font-mono text-xs">🔧</span>, type: 'ability', key: 'canAccessSettings' },
  { id: 'can-manage-products', label: 'Gestionar Productos', description: 'Crear, editar y eliminar productos', icon: () => <span className="font-mono text-xs">✏</span>, type: 'ability', key: 'canManageProducts' },
  { id: 'can-manage-clients', label: 'Gestionar Clientes', description: 'Crear, editar y eliminar clientes', icon: () => <span className="font-mono text-xs">✏</span>, type: 'ability', key: 'canManageClients' },
  { id: 'can-manage-cash', label: 'Gestionar Caja', description: 'Abrir, cerrar y manejar caja', icon: () => <span className="font-mono text-xs">✏</span>, type: 'ability', key: 'canManageCash' },
  { id: 'can-manage-expenses', label: 'Gestionar Gastos', description: 'Crear, editar y eliminar gastos', icon: () => <span className="font-mono text-xs">✏</span>, type: 'ability', key: 'canManageExpenses' },
  { id: 'can-manage-suppliers', label: 'Gestionar Proveedores', description: 'Crear, editar y eliminar proveedores', icon: () => <span className="font-mono text-xs">✏</span>, type: 'ability', key: 'canManageSuppliers' },
  { id: 'can-view-audit', label: 'Ver Auditoría', description: 'Acceder al registro de auditoría', icon: () => <span className="font-mono text-xs">📋</span>, type: 'ability', key: 'canViewAudit' },
]

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  gerente: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  cajero: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  vendedor: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20',
}

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-blue-500 text-white',
  gerente: 'bg-emerald-500 text-white',
  cajero: 'bg-amber-500 text-white',
  vendedor: 'bg-violet-500 text-white',
}

// ── Helper: get value for a permission row ─────────────────────
function getPermValue(perms: UserPermissions, row: PermRow): boolean {
  if (row.type === 'view') {
    return perms.views.includes(row.key)
  }
  return perms[row.key as keyof UserPermissions] as boolean
}

// ── Helper: toggle a permission row ────────────────────────────
function togglePerm(perms: UserPermissions, row: PermRow): UserPermissions {
  if (row.type === 'view') {
    const hasView = perms.views.includes(row.key)
    return {
      ...perms,
      views: hasView ? perms.views.filter(v => v !== row.key) : [...perms.views, row.key],
    }
  }
  return {
    ...perms,
    [row.key]: !perms[row.key as keyof UserPermissions],
  }
}

export function RolePermissionsEditor() {
  const [permissions, setPermissions] = useState<Record<string, UserPermissions>>(DEFAULT_PERMISSIONS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterSection, setFilterSection] = useState<'all' | 'view' | 'ability'>('all')

  const loadPermissions = useCallback(async () => {
    try {
      const data = await api.get<{ permissions: Record<string, UserPermissions> }>('/api/role-permissions')
      if (data?.permissions && Object.keys(data.permissions).length > 0) {
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
      setPermissions(DEFAULT_PERMISSIONS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  const handleToggle = (role: string, row: PermRow) => {
    setPermissions(prev => ({
      ...prev,
      [role]: togglePerm(prev[role], row),
    }))
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

  const toggleAllForRole = (role: string, enable: boolean) => {
    setPermissions(prev => {
      const rolePerms = { ...prev[role] }
      for (const row of PERMISSION_ROWS) {
        if (row.type === 'view') {
          if (enable && !rolePerms.views.includes(row.key)) {
            rolePerms.views = [...rolePerms.views, row.key]
          } else if (!enable) {
            rolePerms.views = rolePerms.views.filter(v => v !== row.key)
          }
        } else {
          rolePerms[row.key as keyof UserPermissions] = enable as never
        }
      }
      return { ...prev, [role]: { ...rolePerms } }
    })
  }

  const filteredRows = PERMISSION_ROWS.filter(
    r => filterSection === 'all' || r.type === filterSection
  )

  const viewRows = filteredRows.filter(r => r.type === 'view')
  const abilityRows = filteredRows.filter(r => r.type === 'ability')

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="h-96 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Permisos por Rol
              </CardTitle>
              <CardDescription className="mt-1">
                Activa o desactiva permisos para cada rol. Los cambios se aplican al guardar.
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={resetToDefaults}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Restaurar
              </Button>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={savePermissions}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Guardar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Filter buttons ── */}
          <div className="flex gap-2">
            {([
              { key: 'all', label: 'Todos' },
              { key: 'view', label: 'Vistas' },
              { key: 'ability', label: 'Acciones' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterSection(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filterSection === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Matrix Table ── */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              {/* ── Header ── */}
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground min-w-[220px] sticky left-0 bg-muted/50 z-10">
                    Permiso
                  </th>
                  {ALL_ROLES.map((role) => (
                    <th key={role} className="p-3 text-center min-w-[100px]">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_BADGE_COLORS[role]}`}>
                          {getRoleLabel(role)}
                        </span>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => toggleAllForRole(role, true)}
                            className="p-0.5 rounded hover:bg-green-500/20 text-green-600 dark:text-green-400 transition-colors"
                            title="Activar todos"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => toggleAllForRole(role, false)}
                            className="p-0.5 rounded hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors"
                            title="Desactivar todos"
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* ── Views Section ── */}
                {(filterSection === 'all' || filterSection === 'view') && (
                  <>
                    <tr>
                      <td colSpan={ALL_ROLES.length + 1} className="px-3 py-2 bg-muted/30">
                        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          <Eye className="h-3.5 w-3.5" />
                          Vistas del Menú
                        </div>
                      </td>
                    </tr>
                    {viewRows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                      >
                        <td className="p-3 sticky left-0 z-10 bg-inherit">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs">
                              <row.icon />
                            </div>
                            <div>
                              <p className="font-medium text-sm leading-tight">{row.label}</p>
                              <p className="text-[11px] text-muted-foreground leading-tight">{row.description}</p>
                            </div>
                          </div>
                        </td>
                        {ALL_ROLES.map((role) => {
                          const val = getPermValue(permissions[role], row)
                          return (
                            <td key={role} className="p-3 text-center">
                              <div className="flex justify-center">
                                <Switch
                                  checked={val}
                                  onCheckedChange={() => handleToggle(role, row)}
                                  className="data-[state=checked]:bg-primary"
                                />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </>
                )}

                {/* ── Abilities Section ── */}
                {(filterSection === 'all' || filterSection === 'ability') && (
                  <>
                    <tr>
                      <td colSpan={ALL_ROLES.length + 1} className="px-3 py-2 bg-muted/30">
                        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          <Pencil className="h-3.5 w-3.5" />
                          Acciones y Habilidades
                        </div>
                      </td>
                    </tr>
                    {abilityRows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={(filterSection === 'all' ? (viewRows.length + idx) : idx) % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                      >
                        <td className="p-3 sticky left-0 z-10 bg-inherit">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs">
                              <row.icon />
                            </div>
                            <div>
                              <p className="font-medium text-sm leading-tight">{row.label}</p>
                              <p className="text-[11px] text-muted-foreground leading-tight">{row.description}</p>
                            </div>
                          </div>
                        </td>
                        {ALL_ROLES.map((role) => {
                          const val = getPermValue(permissions[role], row)
                          return (
                            <td key={role} className="p-3 text-center">
                              <div className="flex justify-center">
                                <Switch
                                  checked={val}
                                  onCheckedChange={() => handleToggle(role, row)}
                                  className="data-[state=checked]:bg-primary"
                                />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Quick Summary ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ALL_ROLES.map((role) => {
              const rolePerms = permissions[role]
              const totalViews = PERMISSION_ROWS.filter(r => r.type === 'view').length
              const totalAbilities = PERMISSION_ROWS.filter(r => r.type === 'ability').length
              const activeViews = PERMISSION_ROWS.filter(r => r.type === 'view' && getPermValue(rolePerms, r)).length
              const activeAbilities = PERMISSION_ROWS.filter(r => r.type === 'ability' && getPermValue(rolePerms, r)).length
              return (
                <div key={role} className={`rounded-lg border p-3 ${ROLE_COLORS[role]}`}>
                  <p className="text-xs font-semibold mb-1">{getRoleLabel(role)}</p>
                  <div className="flex gap-3 text-[11px]">
                    <span>
                      <strong>{activeViews}</strong>/{totalViews} vistas
                    </span>
                    <span>
                      <strong>{activeAbilities}</strong>/{totalAbilities} acciones
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
