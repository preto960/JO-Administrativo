'use client'

import { useEffect, useState, useCallback } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'
import { ThemeProvider } from 'next-themes'
import { useAppStore } from '@/stores/use-app-store'
import { PosTerminal } from '@/components/pos/pos-terminal'
import { FinancialDashboard } from '@/components/dashboard/financial-dashboard'
import { ProductsTable } from '@/components/products/products-table'
import { ClientsTable } from '@/components/clients/clients-table'
import { SuppliersView } from '@/components/clients/suppliers-view'
import { CashRegisterView } from '@/components/cash/cash-register-view'
import { ExpensesTable } from '@/components/expenses/expenses-table'
import { SettingsView } from '@/components/settings/settings-view'
import { OnboardingTutorial } from '@/components/tutorial/onboarding-tutorial'
import { SettingsInitializer } from '@/components/settings/settings-initializer'
import { useAuth } from '@/hooks/use-auth'
import { canAccessView } from '@/lib/permissions'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Wallet, AlertTriangle } from 'lucide-react'
import type { AppView } from '@/stores/use-app-store'

const viewComponents: Record<AppView, React.ComponentType> = {
  pos: PosTerminal,
  dashboard: FinancialDashboard,
  products: ProductsTable,
  clients: ClientsTable,
  suppliers: SuppliersView,
  cash: CashRegisterView,
  expenses: ExpensesTable,
  settings: SettingsView,
}

export function AppShell() {
  const { activeView, setActiveView, selectedBranchId } = useAppStore()
  const { user, isLoading } = useAuth()
  const [posHasOpenRegister, setPosHasOpenRegister] = useState<boolean | null>(null)

  // ── Resolve the view (role-based) ──
  let resolvedView = activeView
  if (!isLoading && user) {
    const role = user.role || 'cajero'
    if (!canAccessView(role, activeView)) {
      resolvedView = 'pos'
    }
  }

  const isPosView = resolvedView === 'pos'

  // ── Check if there's an open cash register for the selected branch ──
  const checkOpenRegister = useCallback(async (branchId: string | null) => {
    if (!branchId) {
      setPosHasOpenRegister(null)
      return
    }
    try {
      const registers = await api.get<Array<{ status: string; branchId: string }>>(
        `/api/cash-register?branchId=${branchId}`
      )
      const hasOpen = registers?.some(r => r.status === 'abierta' && r.branchId === branchId) ?? false
      setPosHasOpenRegister(hasOpen)
    } catch {
      setPosHasOpenRegister(null)
    }
  }, [])

  // Check when branch changes or view becomes POS
  useEffect(() => {
    if (isPosView && selectedBranchId) {
      checkOpenRegister(selectedBranchId)
    }
  }, [selectedBranchId, isPosView, checkOpenRegister])

  // Also check periodically (every 60s) while on POS view
  useEffect(() => {
    if (!isPosView || !selectedBranchId) return
    const interval = setInterval(() => {
      checkOpenRegister(selectedBranchId)
    }, 60000)
    return () => clearInterval(interval)
  }, [isPosView, selectedBranchId, checkOpenRegister])

  // ── Role-based view guard ──
  useEffect(() => {
    if (!user || isLoading) return
    const role = user.role || 'cajero'
    if (!canAccessView(role, activeView)) {
      setActiveView('pos')
    }
  }, [user, activeView, isLoading, setActiveView])

  // Clear localStorage on logout
  useEffect(() => {
    if (!isLoading && !user) {
      localStorage.removeItem('jo-admin-store')
    }
  }, [isLoading, user])

  const ActiveComponent = viewComponents[resolvedView] || FinancialDashboard

  // Don't render the app shell until we know the user's role
  if (isLoading) {
    return (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <div className="flex h-screen items-center justify-center">
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </ThemeProvider>
    )
  }

  // Block POS if no open register for the selected branch
  const isPosBlocked = isPosView && posHasOpenRegister === false

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <main className="flex-1 overflow-auto p-3 md:p-4 lg:p-6">
            {isPosBlocked ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
                <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-6">
                  <Wallet className="h-12 w-12 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-2 max-w-md">
                  <h2 className="text-xl font-semibold">Punto de Venta Bloqueado</h2>
                  <p className="text-muted-foreground">
                    No hay ninguna caja abierta para la sucursal seleccionada.
                    Debes abrir una caja antes de poder realizar ventas.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Abre una caja desde la seccion de Caja para comenzar a vender.</span>
                </div>
                <Button
                  className="bg-primary hover:bg-primary/90 text-white"
                  onClick={() => setActiveView('cash')}
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Ir a Caja
                </Button>
              </div>
            ) : (
              <ActiveComponent />
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
      <OnboardingTutorial />
      <SettingsInitializer />
    </ThemeProvider>
  )
}
