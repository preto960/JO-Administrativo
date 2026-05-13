'use client'

import { useAppStore } from '@/stores/use-app-store'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Moon, Sun, LogOut, UserCircle, Settings } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/layout/notification-bell'
import { SessionTimer } from '@/components/settings/session-timer'
import { useAuth } from '@/hooks/use-auth'
import { signOut } from 'next-auth/react'

const viewLabels: Record<string, string> = {
  pos: 'Punto de Venta',
  dashboard: 'Dashboard',
  products: 'Productos',
  purchases: 'Compras',
  clients: 'Clientes',
  suppliers: 'Proveedores',
  cash: 'Caja',
  expenses: 'Gastos',
  settings: 'Configuración',
}

export function AppHeader() {
  const { activeView, setActiveView } = useAppStore()
  const { setTheme, theme } = useTheme()
  const { user } = useAuth()

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'US'

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b px-3 md:h-14 md:gap-2 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1.5 h-4 md:mr-2" />
      <h2 className="text-sm font-semibold md:text-lg truncate">{viewLabels[activeView] || 'Dashboard'}</h2>
      <div className="ml-auto flex items-center gap-1 md:gap-2">
        <SessionTimer />
        <NotificationBell />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:h-9 md:w-9"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Cambiar tema</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name || 'Usuario'}</p>
                <p className="text-xs text-muted-foreground">{user?.email || 'usuario@erp.com'}</p>
                <p className="text-xs text-primary capitalize">{user?.role || 'cajero'}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserCircle className="mr-2 h-4 w-4" />
              Perfil
            </DropdownMenuItem>
            {user?.role === 'admin' && (
              <DropdownMenuItem onClick={() => setActiveView('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Configuración
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
