'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InventoryCheckTab } from './inventory-check-tab'
import { InventoryAdminTab } from './inventory-admin-tab'
import { FinancialTab } from './financial-tab'
import { SalesCashierTab } from './sales-cashier-tab'
import { ClientsReportTab } from './clients-report-tab'
import { BarChart3 } from 'lucide-react'

export function ReportsView() {
  const { user } = useAuth()
  const userRole = user?.role || 'cajero'

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-sm text-muted-foreground">Genera y descarga informes del negocio</p>
        </div>
      </div>

      <Tabs defaultValue="inventory-check" className="w-full">
        <TabsList className="flex w-full flex-wrap gap-1">
          <TabsTrigger value="inventory-check">Inventario Cajero</TabsTrigger>
          <TabsTrigger value="inventory-admin">Inventario Admin</TabsTrigger>
          <TabsTrigger value="financial">Financieros</TabsTrigger>
          <TabsTrigger value="sales-cashier">Ventas Caja</TabsTrigger>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory-check" className="mt-4">
          <InventoryCheckTab />
        </TabsContent>

        <TabsContent value="inventory-admin" className="mt-4">
          <InventoryAdminTab userRole={userRole} />
        </TabsContent>

        <TabsContent value="financial" className="mt-4">
          <FinancialTab userRole={userRole} />
        </TabsContent>

        <TabsContent value="sales-cashier" className="mt-4">
          <SalesCashierTab />
        </TabsContent>

        <TabsContent value="clients" className="mt-4">
          <ClientsReportTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
