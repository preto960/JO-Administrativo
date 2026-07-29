'use client'

import { useState } from 'react'
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
  Download, Loader2, Search, Calculator, BarChart3,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface CategoryBreakdown {
  name: string
  amount: number
}

interface CashierSales {
  cashierName: string
  salesDay: number
  salesWeek: number
  salesMonth: number
  dailyTarget: number
  advancePercent: number
  breakdown: CategoryBreakdown[]
}

// ── Helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function sevenDaysAgoISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

function fmtMoney(value: number) {
  return Math.abs(value).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function advanceBadgeVariant(pct: number) {
  if (pct >= 100) return 'default' as const
  if (pct >= 75) return 'secondary' as const
  if (pct >= 50) return 'outline' as const
  return 'destructive' as const
}

// ── Component ──────────────────────────────────────────────────────────────

export function SalesCashierTab() {
  const [dateFrom, setDateFrom] = useState(sevenDaysAgoISO)
  const [dateTo, setDateTo] = useState(todayISO)
  const [cashiers, setCashiers] = useState<CashierSales[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleConsult = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Selecciona las fechas')
      return
    }
    setLoading(true)
    const params = new URLSearchParams()
    params.set('dateFrom', dateFrom)
    params.set('dateTo', dateTo)
    try {
      const data = await api.get<CashierSales[]>(
        `/api/reports/sales-cashier?${params.toString()}`,
      )
      setCashiers(data)
      setSearched(true)
    } catch {
      toast.error('Error al consultar ventas por cajero')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPdf = () => {
    const params = new URLSearchParams()
    params.set('dateFrom', dateFrom)
    params.set('dateTo', dateTo)
    window.open(`/api/reports/sales-cashier/pdf?${params.toString()}`, '_blank')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Ventas por Cajero
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="sc-from">Desde</Label>
            <Input
              id="sc-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full sm:w-44"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sc-to">Hasta</Label>
            <Input
              id="sc-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full sm:w-44"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleConsult} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Consultar
            </Button>
            {searched && cashiers.length > 0 && (
              <Button variant="outline" onClick={handleDownloadPdf}>
                <Download className="mr-2 h-4 w-4" />
                Descargar PDF
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        ) : searched ? (
          cashiers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calculator className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No se encontraron datos para el periodo seleccionado
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cajero</TableHead>
                    <TableHead className="text-right">Ventas Día</TableHead>
                    <TableHead className="text-right">Ventas Semana</TableHead>
                    <TableHead className="text-right">Ventas Mes</TableHead>
                    <TableHead className="text-right">Meta Diaria</TableHead>
                    <TableHead className="text-center">% Avance</TableHead>
                    <TableHead>Desglose</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashiers.map((c, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{c.cashierName}</TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(c.salesDay)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(c.salesWeek)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(c.salesMonth)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(c.dailyTarget)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={advanceBadgeVariant(c.advancePercent)}>
                          {c.advancePercent.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.breakdown.map((cat, catIdx) => (
                            <Badge key={catIdx} variant="outline" className="text-xs">
                              {cat.name}: {fmtMoney(cat.amount)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}
