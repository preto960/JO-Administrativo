'use client'

import { useAppStore, type AppView } from '@/stores/use-app-store'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  Users,
  Building2,
  Wallet,
  Receipt,
  Settings,
  Store,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarFooter,
} from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAuth } from '@/hooks/use-auth'

const navItems: { view: AppView; label: string; icon: React.ElementType; roles: string[] }[] = [
  { view: 'pos', label: 'Punto de Venta', icon: ShoppingCart, roles: ['admin', 'gerente', 'cajero', 'vendedor'] },
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'gerente'] },
  { view: 'products', label: 'Productos', icon: Package, roles: ['admin', 'gerente', 'vendedor'] },
  { view: 'purchases', label: 'Compras', icon: Truck, roles: ['admin', 'gerente'] },
  { view: 'clients', label: 'Clientes', icon: Users, roles: ['admin', 'gerente', 'vendedor'] },
  { view: 'suppliers', label: 'Proveedores', icon: Building2, roles: ['admin', 'gerente'] },
  { view: 'cash', label: 'Caja', icon: Wallet, roles: ['admin', 'gerente', 'cajero'] },
  { view: 'expenses', label: 'Gastos', icon: Receipt, roles: ['admin', 'gerente'] },
]

export function AppSidebar() {
  const { activeView, setActiveView } = useAppStore()
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const userRole = user?.role || 'cajero'

  const visibleItems = navItems.filter(item => item.roles.includes(userRole))

  return (
    <Sidebar collapsible={isMobile ? 'offcanvas' : 'icon'}>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Store className="h-5 w-5" />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <h1 className="text-lg font-bold tracking-tight text-emerald-700">JO-Administrativo</h1>
            <p className="text-xs text-muted-foreground">ERP / Punto de Venta</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menú Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.view}>
                  <SidebarMenuButton
                    isActive={activeView === item.view}
                    onClick={() => setActiveView(item.view)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {(userRole === 'admin') && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Configuración"
                isActive={activeView === 'settings'}
                onClick={() => setActiveView('settings')}
              >
                <Settings className="h-4 w-4" />
                <span>Configuración</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <div className="px-4 pb-2 group-data-[collapsible=icon]:hidden">
          <p className="text-[10px] text-muted-foreground">v1.0.0</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
