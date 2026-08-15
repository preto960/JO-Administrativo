'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/stores/use-app-store'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Eye, Download, Loader2, ClipboardCheck, PackageSearch, Filter } from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────

interface CheckItem {
  productId: string
  productName: string
  initialStock: number
  verifiedStock: number | null
  unitPrice: number
  notes: string
  discrepancyQty?: number
  discrepancyAmt?: number
  product?: { id: string; name: string; sku: string } | null
}

interface InventoryCheck {
  id: string
  checkDate: string
  branch: { id: string; name: string } | null
  user: { id: string; name: string } | null
  status: 'pendiente' | 'verificado'
  inventoryType: string
  cashRegId?: string
  notes?: string
  items: CheckItem[]
}

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function InventoryTypeBadge({ type }: { type: string }) {
  switch (type) {
    case 'apertura':
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          Apertura
        </Badge>
      )
    case 'cierre':
      return (
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
          Cierre
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
          Manual
        </Badge>
      )
  }
}

function fmtMoney(value: number) {
  return value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function thirtyDaysAgoISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

// ── Component ──────────────────────────────────────────────────────────────

export function InventoryCheckTab() {
  const { user } = useAuth()
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)

  const [checks, setChecks] = useState<InventoryCheck[]>([])
  const [loading, setLoading] = useState(true)

  // View dialog state
  const [viewCheck, setViewCheck] = useState<InventoryCheck | null>(null)

  // Filtros
  const [filterType, setFilterType] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState(thirtyDaysAgoISO)
  const [filterDateTo, setFilterDateTo] = useState(todayISO)

  // ── Fetch checks ────────────────────────────────────────────────────────

  const fetchChecks = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedBranchId) params.set('branchId', selectedBranchId)
      if (filterType !== 'all') params.set('inventoryType', filterType)
      params.set('dateFrom', filterDateFrom)
      params.set('dateTo', filterDateTo)

      const data = await api.get<InventoryCheck[]>(`/api/reports/inventory-check?${params.toString()}`)
      setChecks(data)
    } catch {
      toast.error('Error al cargar verificaciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChecks()
  }, [filterType, filterDateFrom, filterDateTo, selectedBranchId])

  // ── Open view dialog ────────────────────────────────────────────────────

  const handleOpenView = (check: InventoryCheck) => {
    setViewCheck(check)
  }

  // ── PDF download ───────────────────────────────────────────────────────

  const handleDownloadPdf = (id: string) => {
    window.open(`/api/reports/inventory-check/${id}/pdf`, '_blank')
  }

  // ── Calculations for view ───────────────────────────────────────────────

  const getCalculations = (items: CheckItem[]) => {
    const itemsWithStock = items.filter(i => i.initialStock > 0)
    let totalDiscrepancyQty = 0
    let totalDiscrepancyAmt = 0
    let sobrantes = 0
    let faltantes = 0

    itemsWithStock.forEach(item => {
      const diffQty = (item.verifiedStock ?? 0) - item.initialStock
      const diffAmt = diffQty * item.unitPrice
      totalDiscrepancyQty += diffQty
      totalDiscrepancyAmt += diffAmt
      if (diffQty > 0) sobrantes += diffQty
      if (diffQty < 0) faltantes += Math.abs(diffQty)
    })

    return { totalDiscrepancyQty, totalDiscrepancyAmt, sobrantes, faltantes, totalItems: itemsWithStock.length }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Inventario de Cajero</h3>
          <p className="text-sm text-muted-foreground">
            Verificaciones generadas al abrir y cerrar caja
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filtros:
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="apertura">Apertura</SelectItem>
                  <SelectItem value="cierre">Cierre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ic-from" className="text-xs">Desde</Label>
              <Input
                id="ic-from"
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ic-to" className="text-xs">Hasta</Label>
              <Input
                id="ic-to"
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-9 w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checks Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((check) => (
                  <TableRow key={check.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmtDateTime(check.checkDate)}
                    </TableCell>
                    <TableCell>
                      <InventoryTypeBadge type={check.inventoryType} />
                    </TableCell>
                    <TableCell>{check.branch?.name || '—'}</TableCell>
                    <TableCell>{check.user?.name || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenView(check)}
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownloadPdf(check.id)}
                          title="Descargar PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {checks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      <PackageSearch className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No hay verificaciones de inventario
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* View Dialog (read-only) */}
      <Dialog
        open={!!viewCheck}
        onOpenChange={(open) => {
          if (!open) setViewCheck(null)
        }}
      >
        <DialogContent className="!w-[85vw] !max-w-[85vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                Inventario de Cajero
                {viewCheck && <InventoryTypeBadge type={viewCheck.inventoryType} />}
              </div>
            </DialogTitle>
            <DialogDescription>
              Fecha: {viewCheck ? fmtDateTime(viewCheck.checkDate) : ''} — {viewCheck?.branch?.name} — Cajero: {viewCheck?.user?.name}
            </DialogDescription>
          </DialogHeader>

          {viewCheck && (() => {
            const calc = getCalculations(viewCheck.items)
            const itemsWithStock = viewCheck.items.filter(i => i.initialStock > 0)
            return (
              <div className="space-y-4">
                {/* Resumen */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-md border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Productos verificados</p>
                    <p className="text-lg font-bold">{calc.totalItems}</p>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Sobrantes</p>
                    <p className="text-lg font-bold text-green-600">+{calc.sobrantes}</p>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Faltantes</p>
                    <p className="text-lg font-bold text-red-600">-{calc.faltantes}</p>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Diferencia $</p>
                    <p className={`text-lg font-bold ${calc.totalDiscrepancyAmt < 0 ? 'text-red-600' : calc.totalDiscrepancyAmt > 0 ? 'text-green-600' : ''}`}>
                      {calc.totalDiscrepancyAmt > 0 ? '+' : ''}{fmtMoney(calc.totalDiscrepancyAmt)}
                    </p>
                  </div>
                </div>

                {/* Items table — only products with stock > 0 */}
                <div className="max-h-[50vh] overflow-auto rounded-md border">
                  <Table className="min-w-[750px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Producto</TableHead>
                        <TableHead className="text-center min-w-[100px]">Stock Inicial</TableHead>
                        <TableHead className="text-center min-w-[120px]">Stock Verificado</TableHead>
                        <TableHead className="text-center min-w-[100px]">Diferencia Qty</TableHead>
                        <TableHead className="text-center min-w-[100px]">Diferencia $</TableHead>
                        <TableHead className="min-w-[180px]">Novedades</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsWithStock.map((item) => {
                        const diffQty = (item.verifiedStock ?? 0) - item.initialStock
                        const diffMoney = diffQty * item.unitPrice

                        return (
                          <TableRow key={item.productId}>
                            <TableCell className="font-medium whitespace-normal">
                              {item.productName}
                            </TableCell>
                            <TableCell className="text-center whitespace-nowrap">
                              {item.initialStock}
                            </TableCell>
                            <TableCell className="text-center whitespace-nowrap font-semibold">
                              {item.verifiedStock ?? 0}
                            </TableCell>
                            <TableCell className="text-center whitespace-nowrap">
                              <span
                                className={
                                  diffQty < 0
                                    ? 'text-red-600 font-semibold'
                                    : diffQty > 0
                                      ? 'text-green-600 font-semibold'
                                      : 'text-muted-foreground'
                                }
                              >
                                {diffQty > 0 ? `+${diffQty}` : diffQty}
                              </span>
                            </TableCell>
                            <TableCell className="text-center whitespace-nowrap">
                              <span
                                className={
                                  diffMoney < 0
                                    ? 'text-red-600 font-semibold'
                                    : diffMoney > 0
                                      ? 'text-green-600 font-semibold'
                                      : 'text-muted-foreground'
                                }
                              >
                                {diffMoney > 0 ? '+' : ''}
                                {fmtMoney(diffMoney)}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {item.notes || '—'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {itemsWithStock.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                            No hay productos con stock para verificar
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Novedades generales */}
                {viewCheck.notes && (
                  <div className="rounded-md border p-3">
                    <p className="text-sm font-medium mb-1">Novedades generales:</p>
                    <p className="text-sm text-muted-foreground">{viewCheck.notes}</p>
                  </div>
                )}

                {/* Footer */}
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadPdf(viewCheck.id)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Descargar PDF
                  </Button>
                </DialogFooter>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
