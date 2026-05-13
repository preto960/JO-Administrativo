'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Target, PiggyBank } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'

interface DashboardData {
  ingresosHoy: number
  ingresosMes: number
  gastosHoy: number
  gastosMes: number
  utilidadBrutaMes: number
  utilidadNetaMes: number
  topProducts: { name: string; revenue: number; qty: number }[]
  recentSales: Array<{
    id: string
    date: string
    total: number
    status: string
    client: { name: string } | null
    user: { name: string }
  }>
  lowStockAlerts: Array<{ productName: string; stock: number; minStock: number }>
  overdueAlerts: Array<{ clientName: string; pendingBalance: number; dueDate: string }>
  chartData: Array<{ date: string; total: number; count: number }>
}

function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'emerald',
}: {
  title: string
  value: string
  icon: React.ElementType
  trend?: 'up' | 'down'
  color?: string
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-primary/5 text-primary border-primary/20 dark:bg-primary/10 dark:text-primary dark:border-primary/30',
    red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
  }

  return (
    <Card className={colorMap[color] || colorMap.emerald}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium opacity-80">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Icon className="h-5 w-5" />
            {trend && (
              trend === 'up' ? (
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              )
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function FinancialDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<DashboardData>('/api/dashboard')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Ingresos Hoy"
          value={`$${data.ingresosHoy.toFixed(2)}`}
          icon={DollarSign}
          trend="up"
          color="emerald"
        />
        <KpiCard
          title="Gastos Hoy"
          value={`$${data.gastosHoy.toFixed(2)}`}
          icon={ShoppingCart}
          trend={data.gastosHoy > 0 ? 'down' : 'up'}
          color="red"
        />
        <KpiCard
          title="Utilidad Bruta (Mes)"
          value={`$${data.utilidadBrutaMes.toFixed(2)}`}
          icon={Target}
          color="violet"
        />
        <KpiCard
          title="Utilidad Neta (Mes)"
          value={`$${data.utilidadNetaMes.toFixed(2)}`}
          icon={PiggyBank}
          color="amber"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sales Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tendencia de Ventas (7 días)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Ventas']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#059669"
                    fill="#059669"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 5 Productos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas este mes</p>
            ) : (
              data.topProducts.map((product, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary dark:bg-primary/10 dark:text-primary">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.qty} uds</p>
                  </div>
                  <span className="text-sm font-semibold text-primary dark:text-primary">
                    ${product.revenue.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Sales */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Últimas Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.recentSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin ventas</p>
              ) : (
                data.recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {sale.client?.name || 'Cliente general'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sale.date).toLocaleString('es-VE')} · {sale.user.name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary dark:text-primary">
                        ${sale.total.toFixed(2)}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {sale.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alertas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-72 overflow-y-auto">
            {data.lowStockAlerts.length === 0 && data.overdueAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin alertas</p>
            ) : (
              <>
                {data.lowStockAlerts.map((alert, i) => (
                  <div
                    key={`low-${i}`}
                    className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2"
                  >
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Stock Bajo
                    </p>
                    <p className="text-xs">{alert.productName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Stock: {alert.stock} / Mín: {alert.minStock}
                    </p>
                  </div>
                ))}
                {data.overdueAlerts.map((alert, i) => (
                  <div
                    key={`over-${i}`}
                    className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-2"
                  >
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                      Cuenta Vencida
                    </p>
                    <p className="text-xs">{alert.clientName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Pendiente: ${alert.pendingBalance.toFixed(2)}
                    </p>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
