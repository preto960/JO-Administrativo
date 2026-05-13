export interface UserPermissions {
  role: string
  views: string[]
  canManageUsers: boolean
  canAccessSettings: boolean
  canManageProducts: boolean
  canManagePurchases: boolean
  canManageClients: boolean
  canManageCash: boolean
  canManageExpenses: boolean
  canManageSuppliers: boolean
}

const rolePermissions: Record<string, UserPermissions> = {
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

export function getPermissions(role: string): UserPermissions {
  return rolePermissions[role] || rolePermissions.cajero
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
