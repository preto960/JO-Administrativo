export interface UserPermissions {
  role: string
  views: string[]
  canManageUsers: boolean
  canAccessSettings: boolean
  canManageProducts: boolean
  canManageClients: boolean
  canManageCash: boolean
  canManageExpenses: boolean
  canManageSuppliers: boolean
  canManageAudit: boolean
}

const defaultRolePermissions: Record<string, UserPermissions> = {
  admin: {
    role: 'admin',
    views: ['pos', 'dashboard', 'products', 'clients', 'suppliers', 'cash', 'expenses', 'audit', 'settings'],
    canManageUsers: true,
    canAccessSettings: true,
    canManageProducts: true,
    canManageClients: true,
    canManageCash: true,
    canManageExpenses: true,
    canManageSuppliers: true,
    canManageAudit: true,
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
    canManageAudit: false,
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
    canManageAudit: false,
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
    canManageAudit: false,
  },
}

/**
 * Custom permissions override - can be set at runtime from the database.
 * This allows the admin to customize role permissions from the settings UI.
 */
let customPermissions: Record<string, UserPermissions> = {}

/**
 * Set custom permissions (called from settings initializer after loading from DB).
 * Also triggers a Zustand state bump so components re-render with updated perms.
 */
export function setCustomPermissions(perms: Record<string, UserPermissions>) {
  customPermissions = perms
  // Import dynamically to avoid circular dependency — bumpPermissions triggers re-renders
  import('@/stores/use-app-store').then(({ useAppStore }) => {
    useAppStore.getState().bumpPermissions()
  })
}

export function getPermissions(role: string): UserPermissions {
  // First check custom permissions, then fall back to defaults
  if (customPermissions[role]) {
    return customPermissions[role]
  }
  return defaultRolePermissions[role] || defaultRolePermissions.cajero
}

export function canAccessView(role: string, view: string): boolean {
  const perms = getPermissions(role)
  return perms.views.includes(view)
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Administrador',
    gerente: 'Gerente',
    cajero: 'Cajero',
    vendedor: 'Vendedor',
  }
  return labels[role] || role
}

export const ALL_ROLES = ['admin', 'gerente', 'cajero', 'vendedor'] as const

export { defaultRolePermissions }
