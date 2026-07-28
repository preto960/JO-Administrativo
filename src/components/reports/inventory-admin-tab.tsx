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
  Download, Loader2, FileBarChart, AlertTriangle, PackageSearch,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface Branch {
  id: string
  name: string
}

interface MonthlyItem {
  productId: string
  productName: string
  monthlySales: number
  currentStock: number
  losses: number
  gifts: number
}

interface DiscrepancyItem {
  productId: string
  productName: string
  differenceQty: number
  differenceMoney: number
}

interface InventoryCheck {
  id: string
  date: string
  branch: { id: string; name: string } | null
  user: { id: string; name: string } | null
  status: string
}

interface DiscrepancyCheck extends InventoryCheck {
  discrepancyItems: DiscrepancyItem[]
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getCurrentYearMonth(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
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

// ── Component ──────────────────────────────────────────────────────────────

interface InventoryAdminTabProps {
  userRole: string
}

export function InventoryAdminTab({ userRole }: InventoryAdminTabProps) {
  // ── Filters ─────────────────────────────────────────────────────────────
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth)
  const [branchId, setBranchId] = useState('')

  // ── Branches ────────────────────────────────────────────────────────────
  const [branches, setBranches] = useState<Branch[]>([])

  useEffect(() => {
    api
      .get<Branch[]>('/api/branches')
      .then(setBranches)
      .catch(() => {})
  }, [])

  // ── Monthly report ──────────────────────────────────────────────────────
  const [monthlyItems, setMonthlyItems] = useState<MonthlyItem[]>([])
  const [loadingReport, setLoadingReport] = useState(false)
  const [reportGenerated, setReportGenerated] = useState(false)

  const handleGenerateReport = async () => {
    setLoadingReport(true)
    try {
      const params = new URLSearchParams()
      params.set('yearMonth', yearMonth)
      if (branchId) params.set('branchId', branchId)
      const data = await api.get<MonthlyItem[]>(
        `/api/reports/inventory-admin/monthly?${params.toString()}`,
      )
      setMonthlyItems(data)
      setReportGenerated(true)
    } catch {
      toast.error('Error al generar reporte mensual')
    } finally {
      setLoadingReport(false)
    }
  }

  const handleDownloadReportPdf = () => {
    const params = new URLSearchParams()
    params.set('yearMonth', yearMonth)
    if (branchId) params.set('branchId', branchId)
    window.open(
      `/api/reports/inventory-admin/monthly/pdf?${params.toString()}`,
      '_blank',
    )
  }

  // ── Discrepancy checks ─────────────────────────────────────────────────
  const [discrepancyChecks, setDiscrepancyChecks] = useState<DiscrepancyCheck[]>([])
  const [loadingDiscrepancies, setLoadingDiscrepancies] = useState(false)

  const fetchDiscrepancyChecks = async () => {
    setLoadingDiscrepancies(true)
    try {
      const data = await api.get<DiscrepancyCheck[]>(
        '/api/reports/inventory-check?status=verificado',
      )
      // Filter only checks that have items with non-zero discrepancy
      const withDiscrepancy = data.filter(
        (c) => c.discrepancyItems && c.discrepancyItems.length > 0,
      )
      setDiscrepancyChecks(withDiscrepancy)
    } catch {
      toast.error('Error al cargar verificaciones con descuadre')
    } finally {
      setLoadingDiscrepancies(false)
    }
  }

  useEffect(() => {
    fetchDiscrepancyChecks()
  }, [])

  const handleDownloadCheckPdf = (id: string) => {
    window.open(`/api/reports/inventory-check/${id}/pdf`, '_blank')
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Monthly Report Section ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5" />
            Reporte Mensual de Inventario
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="space-y-2">
              <Label htmlFor="yearMonth">Mes y Año</Label>
              <Input
                id="yearMonth"
                type="month"
                value={yearMonth}
                onChange={(e) => setYearMonth(e.target.value)}
                className="w-full sm:w-48"
              />
            </div>
            <div className="space-y-2">
              <Label>Sucursal</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Todas las sucursales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas las sucursales</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleGenerateReport}
                disabled={loadingReport}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {loadingReport ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileBarChart className="mr-2 h-4 w-4" />
                )}
                Generar Reporte Mensual
              </Button>
              {reportGenerated && (
                <Button variant="outline" onClick={handleDownloadReportPdf}>
                  <Download className="mr-2 h-4 w-4" />
                  Descargar PDF
                </Button>
              )}
            </div>
          </div>

          {/* Results Table */}
          {reportGenerated && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-center">Ventas del Mes</TableHead>
                    <TableHead className="text-center">Stock Actual</TableHead>
                    <TableHead className="text-center">Perdidas</TableHead>
                    <TableHead className="text-center">Obsequios</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyItems.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell className="text-center">{item.monthlySales}</TableCell>
                      <TableCell className="text-center">{item.currentStock}</TableCell>
                      <TableCell className="text-center">
                        {item.losses > 0 ? (
                          <span className="text-red-600 font-semibold">
                            {item.losses}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.gifts > 0 ? (
                          <span className="text-amber-600 font-semibold">
                            {item.gifts}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {monthlyItems.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-8 text-muted-foreground"
                      >
                        <PackageSearch className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No se encontraron datos para el periodo seleccionado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Discrepancy Section ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Verificaciones con Descuadre
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingDiscrepancies ? (
            <div className="h-32 rounded-lg bg-muted animate-pulse" />
          ) : discrepancyChecks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <PackageSearch className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No hay verificaciones con descuadre
            </div>
          ) : (
            <div className="space-y-4">
              {discrepancyChecks.map((check) => (
                <div
                  key={check.id}
                  className="rounded-lg border p-4 space-y-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{fmtDate(check.date)}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{check.branch?.name || 'Sin sucursal'}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{check.user?.name || 'Sin cajero'}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadCheckPdf(check.id)}
                    >
                      <Download className="mr-2 h-3.5 w-3.5" />
                      Descargar PDF
                    </Button>
                  </div>

                  {/* Discrepancy items */}
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-center">Diferencia Qty</TableHead>
                          <TableHead className="text-center">Diferencia $</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {check.discrepancyItems.map((di) => (
                          <TableRow key={di.productId}>
                            <TableCell className="font-medium text-sm">
                              {di.productName}
                            </TableCell>
                            <TableCell className="text-center">
                              <span
                                className={
                                  di.differenceQty < 0
                                    ? 'text-red-600 font-semibold'
                                    : 'text-green-600 font-semibold'
                                }
                              >
                                {di.differenceQty > 0
                                  ? `+${di.differenceQty}`
                                  : di.differenceQty}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span
                                className={
                                  di.differenceMoney < 0
                                    ? 'text-red-600 font-semibold'
                                    : 'text-green-600 font-semibold'
                                }
                              >
                                {di.differenceMoney > 0 ? '+' : '-'}
                                {fmtMoney(di.differenceMoney)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
