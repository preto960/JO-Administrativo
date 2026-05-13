'use client'

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'
import { ThemeProvider } from 'next-themes'
import { useAppStore } from '@/stores/use-app-store'
import { PosTerminal } from '@/components/pos/pos-terminal'
import { FinancialDashboard } from '@/components/dashboard/financial-dashboard'
import { ProductsTable } from '@/components/products/products-table'
import { PurchasesTable } from '@/components/purchases/purchases-table'
import { ClientsTable } from '@/components/clients/clients-table'
import { SuppliersView } from '@/components/clients/suppliers-view'
import { CashRegisterView } from '@/components/cash/cash-register-view'
import { ExpensesTable } from '@/components/expenses/expenses-table'
import { SettingsView } from '@/components/settings/settings-view'
import { SessionProvider } from 'next-auth/react'
import { OnboardingTutorial } from '@/components/tutorial/onboarding-tutorial'
import { SettingsInitializer } from '@/components/settings/settings-initializer'
import type { AppView } from '@/stores/use-app-store'

const viewComponents: Record<AppView, React.ComponentType> = {
  pos: PosTerminal,
  dashboard: FinancialDashboard,
  products: ProductsTable,
  purchases: PurchasesTable,
  clients: ClientsTable,
  suppliers: SuppliersView,
  cash: CashRegisterView,
  expenses: ExpensesTable,
  settings: SettingsView,
}

export function AppShell() {
  const { activeView } = useAppStore()
  const ActiveComponent = viewComponents[activeView] || FinancialDashboard

  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <AppHeader />
            <main className="flex-1 overflow-auto p-3 md:p-4 lg:p-6">
              <ActiveComponent />
            </main>
          </SidebarInset>
        </SidebarProvider>
        <OnboardingTutorial />
        <SettingsInitializer />
      </ThemeProvider>
    </SessionProvider>
  )
}
