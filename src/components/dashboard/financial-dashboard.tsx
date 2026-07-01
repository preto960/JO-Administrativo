'use client'

import { useEffect, useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { useCurrency } from '@/hooks/use-currency'
import { useAppStore } from '@/stores/use-app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Target, PiggyBank, Package, Users, Receipt, Filter, CalendarDays, CheckCircle2, XCircle, Settings2, Loader2, UserCheck } from 'lucide-react'
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
  Cell,
} from 'recharts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DashboardData {
  ingresosHoy: number
  ingresosMes: number
  ingresosPeriodo: number
  gastosHoy: number
  gastosMes: number
  gastosPeriodo: number
  utilidadBrutaMes: number
  utilidadNetaMes: number
  utilidadBrutaPeriodo: number
  utilidadNetaPeriodo: number
  costoVentasMes: number
  cuentasPorCobrarMes: number
  perdidasMes: number
  costoVentasPeriodo: number
  cuentasPorCobrarPeriodo: number
  perdidasPeriodo: number
  totalProductosActivos: number
  totalClientesActivos: number
  totalAsistenciasPeriodo: number
  topProducts: { name: string; revenue: number; qty: number }[]
  recentSales: Array<{
    id: string
    date: string
    total: number
    status: string
    client: { name: string; lastName: string | null } | null
    user: { name: string }
    lines: Array<{ product: { name: string } | null; quantity: number }> | null
  }>
  lowStockAlerts: Array<{ productName: string; stock: number; minStock: number }>
  overdueAlerts: Array<{ clientName: string; pendingBalance: number; dueDate: string }>
  overduePayableAlerts: Array<{ supplierName: string; pendingBalance: number; dueDate: string }>
  chartData: Array<{ date: string; total: number; count: number }>
  chartLabel: string
  period: string
}

type PeriodOption = 'today' | 'week' | 'month' | 'year' | 'custom'

interface VendorPerformance {
  userId: string
  userName: string
  role: string
  productSales: number
  renewalSales: number
  totalSales: number
  target: number
  achieved: boolean
  remaining: number
  percent: number
  overTarget: number
}

interface SalesPerformanceData {
  month: string
  performance: VendorPerformance[]
  totalMonthSales: number
  totalMonthTarget: number
}

const periodOptions: { value: PeriodOption; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
  { value: 'custom', label: 'Personalizado' },
]

function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'primary',
  subtitle,
}: {
  title: string
  value: string
  icon: React.ElementType
  trend?: 'up' | 'down'
  color?: string
  subtitle?: string
}) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary/5 text-primary border-primary/20 dark:bg-primary/10 dark:text-primary dark:border-primary/30',
    red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
  }

  return (
    <Card className={colorMap[color] || colorMap.primary}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium opacity-80">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-[10px] opacity-60 mt-1 leading-tight">{subtitle}</p>}
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
  const { fmt } = useCurrency()
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodOption>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Sales Performance / Targets
  const [perfMonth, setPerfMonth] = useState(() => {
    const now = new Date()
    const tz = (typeof window !== 'undefined' && (window as any).__APP_TZ__) || 'America/Bogota'
    const localStr = now.toLocaleString('en-US', { timeZone: tz })
    const localNow = new Date(localStr)
    return `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}`
  })
  const [perfData, setPerfData] = useState<SalesPerformanceData | null>(null)
  const [perfLoading, setPerfLoading] = useState(false)
  const [showTargetDialog, setShowTargetDialog] = useState(false)
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({})
  const [savingTargets, setSavingTargets] = useState(false)

  // Validate custom date range (derived value, no setState)
  const { dateError, isCustomValid } = useMemo(() => {
    if (!customFrom || !customTo) return { dateError: '', isCustomValid: false }
    const from = new Date(customFrom)
    const to = new Date(customTo)
    if (from > to) {
      return { dateError: 'La fecha "Desde" no puede ser posterior a "Hasta"', isCustomValid: false }
    }
    const diffMs = to.getTime() - from.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (diffDays > 365) {
      return { dateError: 'El rango no puede superar 1 año', isCustomValid: false }
    }
    return { dateError: '', isCustomValid: true }
  }, [customFrom, customTo])

  useEffect(() => {
    // Check membership expirations in background
    api.get('/api/clients/check-expirations').catch(() => {})

    // Don't fetch if custom period is selected but dates are invalid/empty
    if (period === 'custom' && !isCustomValid) return

    setLoading(true)
    const params = new URLSearchParams()
    if (selectedBranchId) params.set('branchId', selectedBranchId)
    params.set('period', period)
    if (period === 'custom' && customFrom) params.set('from', customFrom)
    if (period === 'custom' && customTo) params.set('to', customTo)
    const query = `?${params.toString()}`
    api.get<DashboardData>(`/api/dashboard${query}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedBranchId, period, customFrom, customTo, isCustomValid])

  const totalProducts = data?.totalProductosActivos || 0
  const totalClients = data?.totalClientesActivos || 0
  const totalAttendance = data?.totalAsistenciasPeriodo || 0

  // Fetch sales performance data
  useEffect(() => {
    setPerfLoading(true)
    api.get<SalesPerformanceData>(`/api/dashboard/sales-performance?month=${perfMonth}`)
      .then(setPerfData)
      .catch(() => {})
      .finally(() => setPerfLoading(false))
  }, [perfMonth])

  // Open target dialog and load current targets
  const handleOpenTargetDialog = async () => {
    setShowTargetDialog(true)
    api.get<{ users: { id: string; name: string }[]; targets: { userId: string; yearMonth: string; targetAmount: number }[] }>(`/api/sales-targets?month=${perfMonth}`)
      .then(({ users, targets }) => {
        const inputs: Record<string, string> = {}
        users.forEach(u => {
          const t = targets.find(t => t.userId === u.id && t.yearMonth === perfMonth)
          inputs[u.id] = t ? String(t.targetAmount) : ''
        })
        setTargetInputs(inputs)
      })
      .catch(() => {})
  }

  const handleSaveTargets = async () => {
    setSavingTargets(true)
    const targets = Object.entries(targetInputs)
      .filter(([, v]) => v && Number(v) > 0)
      .map(([userId, v]) => ({ userId, yearMonth: perfMonth, targetAmount: Number(v) }))

    await api.put('/api/sales-targets', { targets })
    setShowTargetDialog(false)
    // Refresh performance data
    api.get<SalesPerformanceData>(`/api/dashboard/sales-performance?month=${perfMonth}`)
      .then(setPerfData)
      .catch(() => {})
    setSavingTargets(false)
  }

  // Chart data for recharts
  const chartData = useMemo(() => {
    if (!perfData) return []
    return perfData.performance.map(p => ({
      name: p.userName.split(' ')[0], // first name
      fullName: p.userName,
      ventas: p.totalSales,
      meta: p.target,
      achieved: p.achieved,
      percent: p.percent,
    }))
  }, [perfData])

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
      {/* Period Filter */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtrar:</span>
          {periodOptions.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={period === opt.value ? 'default' : 'outline'}
              className={period === opt.value ? 'bg-primary hover:bg-primary/90 text-white' : ''}
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* Custom Date Range Picker */}
        {period === 'custom' && (
          <div className="flex items-center gap-3 flex-wrap rounded-lg border bg-muted/30 p-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Desde</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                max={customTo || undefined}
              />
            </div>
            <span className="text-muted-foreground">—</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                min={customFrom || undefined}
              />
            </div>
            {dateError && (
              <p className="text-xs text-red-500">{dateError}</p>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards - Row 1: All respect the selected period filter */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={`Ingresos (${data.chartLabel})`}
          value={fmt(data.ingresosPeriodo)}
          icon={DollarSign}
          trend="up"
          color="primary"
        />
        <KpiCard
          title={`Gastos (${data.chartLabel})`}
          value={fmt(data.gastosPeriodo)}
          icon={ShoppingCart}
          trend={data.gastosPeriodo > 0 ? 'down' : 'up'}
          color="red"
        />
        <KpiCard
          title={`Util. Bruta (${data.chartLabel})`}
          value={fmt(data.utilidadBrutaPeriodo)}
          icon={Target}
          color="violet"
          subtitle="Ingresos - Costo de ventas"
        />
        <KpiCard
          title={`Util. Neta (${data.chartLabel})`}
          value={fmt(data.utilidadNetaPeriodo)}
          icon={PiggyBank}
          color="amber"
          subtitle="Ingreso - (Costo + Gasto + Impuesto + CxC + Pérdidas - Intereses)"
        />
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={`Ventas del Período (${data.chartLabel})`}
          value={data.chartData.reduce((s, d) => s + d.count, 0).toString()}
          icon={Receipt}
          trend="up"
          color="primary"
        />
        <KpiCard
          title={`Costo de Ventas (${data.chartLabel})`}
          value={fmt(data.costoVentasPeriodo)}
          icon={TrendingDown}
          color="red"
          subtitle="Costo unitario × cantidad vendida"
        />
        <KpiCard
          title="Productos Activos"
          value={totalProducts.toString()}
          icon={Package}
          color="violet"
        />
        <KpiCard
          title="Clientes"
          value={totalClients.toString()}
          icon={Users}
          color="amber"
        />
      </div>

      {/* KPI Cards - Row 3: Asistencias del período */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={`Asistencias (${data.chartLabel})`}
          value={totalAttendance.toString()}
          icon={UserCheck}
          trend="up"
          color="primary"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sales Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tendencia de Ventas ({data.chartLabel})</CardTitle>
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
                    formatter={(value: number) => [fmt(value), 'Ventas']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--primary)"
                    fill="var(--primary)"
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
              <p className="text-sm text-muted-foreground">Sin ventas en este período</p>
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
                    {fmt(product.revenue)}
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {sale.client ? `${sale.client.name}${sale.client.lastName ? ' ' + sale.client.lastName : ''}` : 'Cliente general'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {sale.lines && sale.lines.length > 0
                            ? sale.lines.map(l => l.product?.name || 'Producto').join(', ')
                            : 'Suscripción'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(sale.date).toLocaleString('es-VE')} · {sale.user.name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary dark:text-primary">
                        {fmt(sale.total)}
                      </p>
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
            {data.lowStockAlerts.length === 0 && data.overdueAlerts.length === 0 && data.overduePayableAlerts.length === 0 ? (
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
                      Cuenta Vencida (Cliente)
                    </p>
                    <p className="text-xs">{alert.clientName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Pendiente: {fmt(alert.pendingBalance)}
                    </p>
                  </div>
                ))}
                {data.overduePayableAlerts.map((alert, i) => (
                  <div
                    key={`payable-${i}`}
                    className="rounded-md border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-2"
                  >
                    <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                      Pago Vencido (Proveedor)
                    </p>
                    <p className="text-xs">{alert.supplierName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Pendiente: {fmt(alert.pendingBalance)}
                    </p>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales Performance & Targets */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Metas de Vendedores
            </CardTitle>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={perfMonth}
                onChange={(e) => setPerfMonth(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button size="sm" variant="outline" onClick={handleOpenTargetDialog}>
                <Settings2 className="h-3.5 w-3.5 mr-1" />
                Configurar Metas
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {perfLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : perfData && perfData.performance.length > 0 ? (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Total Ventas</p>
                  <p className="text-sm font-bold">{fmt(perfData.totalMonthSales)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Meta Total</p>
                  <p className="text-sm font-bold">{fmt(perfData.totalMonthTarget)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">% General</p>
                  <p className={`text-sm font-bold ${perfData.totalMonthTarget > 0 && perfData.totalMonthSales >= perfData.totalMonthTarget ? 'text-green-600' : ''}`}>
                    {perfData.totalMonthTarget > 0 ? `${Math.round((perfData.totalMonthSales / perfData.totalMonthTarget) * 100)}%` : '—'}
                  </p>
                </div>
              </div>

              {/* Bar Chart */}
              {chartData.length > 0 && (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 11 }} />
                      <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number, name: string) => [fmt(value), name === 'ventas' ? 'Ventas' : 'Meta']}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                      />
                      <Bar dataKey="meta" fill="var(--muted-foreground)" opacity={0.25} radius={[4, 4, 0, 0]} name="meta" />
                      <Bar dataKey="ventas" radius={[4, 4, 0, 0]} name="ventas">
                        {chartData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.achieved ? '#22c55e' : entry.percent >= 70 ? '#f59e0b' : 'var(--primary)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Vendor Breakdown */}
              <div className="space-y-3">
                {perfData.performance.map((p) => (
                  <div key={p.userId} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{p.userName}</span>
                        {p.target > 0 && (
                          p.achieved ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" /> Cumplido
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              <XCircle className="h-3 w-3 mr-0.5 text-amber-500" />
                              Faltan {fmt(p.remaining)}
                            </Badge>
                          )
                        )}
                      </div>
                      <span className="text-sm font-bold">{fmt(p.totalSales)}</span>
                    </div>
                    {p.target > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>Productos: {fmt(p.productSales)}</span>
                          <span>Renovaciones: {fmt(p.renewalSales)}</span>
                          <span>Meta: {fmt(p.target)} — {p.percent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              p.achieved ? 'bg-green-500' : p.percent >= 70 ? 'bg-amber-500' : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(p.percent, 100)}%` }}
                          />
                        </div>
                        {p.overTarget > 0 && (
                          <p className="text-[10px] text-green-600 font-medium">
                            <TrendingUp className="h-3 w-3 inline mr-0.5" />
                            Supera la meta por {fmt(p.overTarget)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              {perfData ? 'Sin datos de ventas para este mes' : 'Sin vendedores activos'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Target Configuration Dialog */}
      <Dialog open={showTargetDialog} onOpenChange={setShowTargetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Metas de Vendedores</DialogTitle>
            <DialogDescription>
              Establece la meta de ventas para cada vendedor en el mes {perfMonth}. Deja vacio si no tiene meta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(targetInputs).map(([userId, value]) => {
              const perf = perfData?.performance.find(p => p.userId === userId)
              return (
                <div key={userId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm">{perf?.userName || userId}</Label>
                    {perf && perf.totalSales > 0 && (
                      <p className="text-[10px] text-muted-foreground">Ventas actuales: {fmt(perf.totalSales)}</p>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="0"
                    value={value}
                    onChange={(e) => setTargetInputs(prev => ({ ...prev, [userId]: e.target.value }))}
                    className="w-32 text-right"
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowTargetDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveTargets} disabled={savingTargets}>
              {savingTargets && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Guardar Metas
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
