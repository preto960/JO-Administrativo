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

const navItems: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'pos', label: 'Punto de Venta', icon: ShoppingCart },
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'products', label: 'Productos', icon: Package },
  { view: 'purchases', label: 'Compras', icon: Truck },
  { view: 'clients', label: 'Clientes', icon: Users },
  { view: 'suppliers', label: 'Proveedores', icon: Building2 },
  { view: 'cash', label: 'Caja', icon: Wallet },
  { view: 'expenses', label: 'Gastos', icon: Receipt },
]

export function AppSidebar() {
  const { activeView, setActiveView } = useAppStore()

  return (
    <Sidebar collapsible="icon">
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
              {navItems.map((item) => (
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Configuración">
              <Settings className="h-4 w-4" />
              <span>Configuración</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-4 pb-2 group-data-[collapsible=icon]:hidden">
          <p className="text-[10px] text-muted-foreground">v1.0.0</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
