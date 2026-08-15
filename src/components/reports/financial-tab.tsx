'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Building2, Receipt, Wallet, FileSpreadsheet,
  Plus, Download, Loader2, Search,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface Currency {
  id: string
  code: string
  name: string
  symbol: string
  isBase: boolean
}

interface CostCenter {
  id: string
  name: string
  code: string
  active: boolean
}

interface CostEntry {
  id: string
  date: string
  costCenterName: string
  concept: string
  amount: number
  currencySymbol: string
}

interface Budget {
  id: string
  costCenterName: string
  budgetAmount: number
  actualExpense: number
  variation: number
  utilizationPercent: number
}

interface ERIItem {
  id: string
  nombre: string
  codigo: string
  presupuesto: number
  gastoReal: number
  variacion: number
  porcentajeUtilizado: number
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getCurrentYearMonth(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function thirtyDaysAgoISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function fmtMoney(value: number) {
  return Math.abs(value).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function utilizationBadgeColor(pct: number) {
  if (pct >= 100) return 'destructive' as const
  if (pct >= 80) return 'secondary' as const
  return 'default' as const
}

// ── Component ──────────────────────────────────────────────────────────────

interface FinancialTabProps {
  userRole: string
}

export function FinancialTab({ userRole }: FinancialTabProps) {
  const canEdit = userRole === 'admin' || userRole === 'gerente'

  // ─────────────────────────────────────────────────────────────────────
  // Shared: Currencies
  // ─────────────────────────────────────────────────────────────────────
  const [currencies, setCurrencies] = useState<Currency[]>([])

  useEffect(() => {
    api.get<Currency[]>('/api/currencies').then(setCurrencies).catch(() => {})
  }, [])

  // ─────────────────────────────────────────────────────────────────────
  // A) Centros de Costo
  // ─────────────────────────────────────────────────────────────────────
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [loadingCostCenters, setLoadingCostCenters] = useState(false)
  const [ccDialogOpen, setCcDialogOpen] = useState(false)
  const [ccForm, setCcForm] = useState({ name: '', code: '' })
  const [ccSubmitting, setCcSubmitting] = useState(false)

  const fetchCostCenters = () => {
    setLoadingCostCenters(true)
    api
      .get<CostCenter[]>('/api/reports/financial/cost-centers')
      .then((data) => {
        // API returns array directly, ensure it's always an array
        setCostCenters(Array.isArray(data) ? data : [])
      })
      .catch(() => toast.error('Error al cargar centros de costo'))
      .finally(() => setLoadingCostCenters(false))
  }

  useEffect(() => { fetchCostCenters() }, [])

  const handleAddCostCenter = async () => {
    if (!ccForm.name.trim() || !ccForm.code.trim()) {
      toast.error('Nombre y código son obligatorios')
      return
    }
    setCcSubmitting(true)
    try {
      await api.post('/api/reports/financial/cost-centers', {
        name: ccForm.name,
        code: ccForm.code,
      })
      toast.success('Centro de costo agregado correctamente')
      setCcDialogOpen(false)
      setCcForm({ name: '', code: '' })
      fetchCostCenters()
    } catch {
      toast.error('Error al agregar centro de costo')
    } finally {
      setCcSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // B) Registro de Costos
  // ─────────────────────────────────────────────────────────────────────
  const [costDateFrom, setCostDateFrom] = useState(thirtyDaysAgoISO)
  const [costDateTo, setCostDateTo] = useState(todayISO)
  const [costEntries, setCostEntries] = useState<CostEntry[]>([])
  const [loadingCostEntries, setLoadingCostEntries] = useState(false)
  const [ceDialogOpen, setCeDialogOpen] = useState(false)
  const [ceForm, setCeForm] = useState({
    costCenterId: '',
    concept: '',
    amount: '',
    currencyId: '',
  })
  const [ceSubmitting, setCeSubmitting] = useState(false)

  // Pre-fill currencyId with base currency when currencies load
  useEffect(() => {
    if (currencies.length > 0 && !ceForm.currencyId) {
      const baseCurrency = currencies.find((c) => c.isBase)
      if (baseCurrency) {
        setCeForm((prev) => ({ ...prev, currencyId: baseCurrency.id }))
      }
    }
  }, [currencies])

  const fetchCostEntries = () => {
    setLoadingCostEntries(true)
    const params = new URLSearchParams()
    params.set('dateFrom', costDateFrom)
    params.set('dateTo', costDateTo)
    api
      .get<unknown>(`/api/reports/financial/cost-entries?${params.toString()}`)
      .then((data) => {
        // API returns { entries: [{ ...entry, costCenter, currency, user }], totalsByCenter, grandTotal }
        const wrapped = data as Record<string, unknown>
        if (wrapped && Array.isArray(wrapped.entries)) {
          // Mapear entries al formato CostEntry que espera el componente
          const mapped = (wrapped.entries as Record<string, unknown>[]).map((e) => {
            const costCenter = e.costCenter as { name: string } | undefined
            const currency = e.currency as { symbol: string } | undefined
            return {
              id: (e.id as string) || '',
              date: (e.date as string) || '',
              costCenterName: costCenter?.name || '',
              concept: (e.concept as string) || '',
              amount: (e.amount as number) ?? 0,
              currencySymbol: currency?.symbol || '',
            }
          })
          setCostEntries(mapped)
        } else {
          setCostEntries(Array.isArray(data) ? (data as CostEntry[]) : [])
        }
      })
      .catch(() => toast.error('Error al cargar registro de costos'))
      .finally(() => setLoadingCostEntries(false))
  }

  useEffect(() => { fetchCostEntries() }, [costDateFrom, costDateTo])

  const handleAddCostEntry = async () => {
    if (!ceForm.costCenterId || !ceForm.concept.trim() || !ceForm.amount || !ceForm.currencyId) {
      toast.error('Todos los campos son obligatorios')
      return
    }
    setCeSubmitting(true)
    try {
      await api.post('/api/reports/financial/cost-entries', {
        costCenterId: ceForm.costCenterId,
        concept: ceForm.concept,
        amount: parseFloat(ceForm.amount),
        currencyId: ceForm.currencyId,
      })
      toast.success('Costo registrado correctamente')
      setCeDialogOpen(false)
      setCeForm({ costCenterId: '', concept: '', amount: '', currencyId: '' })
      fetchCostEntries()
    } catch {
      toast.error('Error al registrar costo')
    } finally {
      setCeSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // C) Presupuestos
  // ─────────────────────────────────────────────────────────────────────
  const [budgetYearMonth, setBudgetYearMonth] = useState(getCurrentYearMonth)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loadingBudgets, setLoadingBudgets] = useState(false)
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false)
  const [budgetForm, setBudgetForm] = useState({
    costCenterId: '',
    budgetAmount: '',
  })
  const [budgetSubmitting, setBudgetSubmitting] = useState(false)

  const fetchBudgets = () => {
    if (!budgetYearMonth) return
    setLoadingBudgets(true)
    const params = new URLSearchParams()
    params.set('yearMonth', budgetYearMonth)
    api
      .get<unknown[]>(`/api/reports/financial/budgets?${params.toString()}`)
      .then((data) => {
        // API returns [{ ...budget, costCenter, actualSpend, variance, percentUsed }]
        // Mapear a la interfaz Budget que espera el frontend
        const mapped = (Array.isArray(data) ? data : []).map((item: Record<string, unknown>) => {
          const b = item as Record<string, unknown>
          const costCenter = b.costCenter as { name: string } | undefined
          return {
            id: (b.id as string) || '',
            costCenterName: costCenter?.name || '',
            budgetAmount: (b.budgetAmount as number) ?? 0,
            actualExpense: (b.actualSpend as number) ?? 0,
            variation: (b.variance as number) ?? 0,
            utilizationPercent: (b.percentUsed as number) ?? 0,
          }
        })
        setBudgets(mapped)
      })
      .catch(() => toast.error('Error al cargar presupuestos'))
      .finally(() => setLoadingBudgets(false))
  }

  useEffect(() => { fetchBudgets() }, [budgetYearMonth])

  const handleAddBudget = async () => {
    if (!budgetForm.costCenterId || !budgetForm.budgetAmount) {
      toast.error('Todos los campos son obligatorios')
      return
    }
    setBudgetSubmitting(true)
    try {
      await api.post('/api/reports/financial/budgets', {
        costCenterId: budgetForm.costCenterId,
        budgetAmount: parseFloat(budgetForm.budgetAmount),
        yearMonth: budgetYearMonth,
      })
      toast.success('Presupuesto agregado correctamente')
      setBudgetDialogOpen(false)
      setBudgetForm({ costCenterId: '', budgetAmount: '' })
      fetchBudgets()
    } catch {
      toast.error('Error al agregar presupuesto')
    } finally {
      setBudgetSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // D) Informe ERI
  // ─────────────────────────────────────────────────────────────────────
  const [eriDateFrom, setEriDateFrom] = useState(thirtyDaysAgoISO)
  const [eriDateTo, setEriDateTo] = useState(todayISO)
  const [eriItems, setEriItems] = useState<ERIItem[]>([])
  const [loadingEri, setLoadingEri] = useState(false)
  const [eriGenerated, setEriGenerated] = useState(false)

  const handleGenerateEri = async () => {
    if (!eriDateFrom || !eriDateTo) {
      toast.error('Selecciona las fechas')
      return
    }
    setLoadingEri(true)
    const params = new URLSearchParams()
    params.set('dateFrom', eriDateFrom)
    params.set('dateTo', eriDateTo)
    try {
      const data = await api.get<ERIItem[] | { centros?: ERIItem[] }>(
        `/api/reports/financial/statement?${params.toString()}`,
      )
      // API returns { centros: [...] }, extract the array
      if (Array.isArray(data)) {
        setEriItems(data)
      } else {
        setEriItems((data as { centros?: ERIItem[] }).centros || [])
      }
      setEriGenerated(true)
    } catch {
      toast.error('Error al generar informe ERI')
    } finally {
      setLoadingEri(false)
    }
  }

  const handleDownloadEriPdf = () => {
    const params = new URLSearchParams()
    params.set('dateFrom', eriDateFrom)
    params.set('dateTo', eriDateTo)
    window.open(
      `/api/reports/financial/statement/pdf?${params.toString()}`,
      '_blank',
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════════════════
          A) Centros de Costo
          ═══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Centros de Costo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={() => setCcDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>
          )}

          {loadingCostCenters ? (
            <div className="h-32 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costCenters.map((cc) => (
                    <TableRow key={cc.id}>
                      <TableCell className="font-medium">{cc.name}</TableCell>
                      <TableCell>{cc.code}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={cc.active ? 'default' : 'secondary'}>
                          {cc.active ? 'Sí' : 'No'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {costCenters.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No hay centros de costo registrados
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Agregar Centro de Costo */}
      <Dialog open={ccDialogOpen} onOpenChange={setCcDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Centro de Costo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cc-name">Nombre</Label>
              <Input
                id="cc-name"
                placeholder="Nombre del centro de costo"
                value={ccForm.name}
                onChange={(e) => setCcForm({ ...ccForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-code">Código</Label>
              <Input
                id="cc-code"
                placeholder="Ej: CC-001"
                value={ccForm.code}
                onChange={(e) => setCcForm({ ...ccForm, code: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCcDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddCostCenter} disabled={ccSubmitting}>
              {ccSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          B) Registro de Costos
          ═══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Registro de Costos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="cost-from">Desde</Label>
              <Input
                id="cost-from"
                type="date"
                value={costDateFrom}
                onChange={(e) => setCostDateFrom(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost-to">Hasta</Label>
              <Input
                id="cost-to"
                type="date"
                value={costDateTo}
                onChange={(e) => setCostDateTo(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            {canEdit && (
              <Button onClick={() => setCeDialogOpen(true)} className="ml-auto">
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            )}
          </div>

          {/* Table */}
          {loadingCostEntries ? (
            <div className="h-32 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Centro</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{fmtDate(entry.date)}</TableCell>
                      <TableCell>{entry.costCenterName}</TableCell>
                      <TableCell className="font-medium">{entry.concept}</TableCell>
                      <TableCell className="text-right">
                        {entry.currencySymbol} {fmtMoney(entry.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {costEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No hay costos registrados en el periodo seleccionado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Agregar Costo */}
      <Dialog open={ceDialogOpen} onOpenChange={setCeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Costo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Centro de Costo</Label>
              <Select
                value={ceForm.costCenterId}
                onValueChange={(v) => setCeForm({ ...ceForm, costCenterId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar centro" />
                </SelectTrigger>
                <SelectContent>
                  {costCenters
                    .filter((cc) => cc.active)
                    .map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.name} ({cc.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ce-concept">Concepto</Label>
              <Input
                id="ce-concept"
                placeholder="Descripción del costo"
                value={ceForm.concept}
                onChange={(e) => setCeForm({ ...ceForm, concept: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ce-amount">Monto</Label>
              <Input
                id="ce-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={ceForm.amount}
                onChange={(e) => setCeForm({ ...ceForm, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Moneda</Label>
              <Select
                value={ceForm.currencyId}
                onValueChange={(v) => setCeForm({ ...ceForm, currencyId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar moneda" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddCostEntry} disabled={ceSubmitting}>
              {ceSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          C) Presupuestos
          ═══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Presupuestos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="budget-month">Mes y Año</Label>
              <Input
                id="budget-month"
                type="month"
                value={budgetYearMonth}
                onChange={(e) => setBudgetYearMonth(e.target.value)}
                className="w-full sm:w-48"
              />
            </div>
            {canEdit && (
              <Button onClick={() => setBudgetDialogOpen(true)} className="ml-auto">
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            )}
          </div>

          {/* Table */}
          {loadingBudgets ? (
            <div className="h-32 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Centro</TableHead>
                    <TableHead className="text-right">Presupuesto</TableHead>
                    <TableHead className="text-right">Gasto Real</TableHead>
                    <TableHead className="text-right">Variación</TableHead>
                    <TableHead className="text-center">% Utilizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgets.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.costCenterName}</TableCell>
                      <TableCell className="text-right">{fmtMoney(b.budgetAmount)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(b.actualExpense)}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            b.variation < 0
                              ? 'text-red-600 font-semibold'
                              : b.variation > 0
                                ? 'text-green-600 font-semibold'
                                : ''
                          }
                        >
                          {b.variation >= 0 ? '+' : '-'}{fmtMoney(b.variation)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={utilizationBadgeColor(b.utilizationPercent ?? 0)}>
                          {(b.utilizationPercent ?? 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {budgets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No hay presupuestos para el periodo seleccionado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Agregar Presupuesto */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Presupuesto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Centro de Costo</Label>
              <Select
                value={budgetForm.costCenterId}
                onValueChange={(v) => setBudgetForm({ ...budgetForm, costCenterId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar centro" />
                </SelectTrigger>
                <SelectContent>
                  {costCenters
                    .filter((cc) => cc.active)
                    .map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.name} ({cc.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-amount">Monto del Presupuesto</Label>
              <Input
                id="budget-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={budgetForm.budgetAmount}
                onChange={(e) => setBudgetForm({ ...budgetForm, budgetAmount: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddBudget} disabled={budgetSubmitting}>
              {budgetSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          D) Informe ERI
          ═══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Informe ERI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="eri-from">Desde</Label>
              <Input
                id="eri-from"
                type="date"
                value={eriDateFrom}
                onChange={(e) => setEriDateFrom(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eri-to">Hasta</Label>
              <Input
                id="eri-to"
                type="date"
                value={eriDateTo}
                onChange={(e) => setEriDateTo(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGenerateEri} disabled={loadingEri}>
                {loadingEri ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Generar
              </Button>
              {eriGenerated && (
                <Button variant="outline" onClick={handleDownloadEriPdf}>
                  <Download className="mr-2 h-4 w-4" />
                  Descargar PDF
                </Button>
              )}
            </div>
          </div>

          {/* Results Table */}
          {loadingEri ? (
            <div className="h-32 rounded-lg bg-muted animate-pulse" />
          ) : eriGenerated ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Centro de Costo</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-right">Presupuesto</TableHead>
                    <TableHead className="text-right">Gasto Real</TableHead>
                    <TableHead className="text-right">Variación</TableHead>
                    <TableHead className="text-center">% Utilizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eriItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.nombre}</TableCell>
                      <TableCell>{item.codigo || '-'}</TableCell>
                      <TableCell className="text-right">{fmtMoney(item.presupuesto)}</TableCell>
                      <TableCell className="text-right">
                        {item.gastoReal > 0 ? (
                          <span className="text-red-600">{fmtMoney(item.gastoReal)}</span>
                        ) : (
                          <span className="text-muted-foreground">0.00</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            item.variacion < 0
                              ? 'text-red-600 font-semibold'
                              : item.variacion > 0
                                ? 'text-green-600 font-semibold'
                                : ''
                          }
                        >
                          {item.variacion >= 0 ? '+' : '-'}{fmtMoney(item.variacion)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={utilizationBadgeColor(item.porcentajeUtilizado ?? 0)}>
                          {(item.porcentajeUtilizado ?? 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {eriItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No se encontraron datos para el periodo seleccionado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
